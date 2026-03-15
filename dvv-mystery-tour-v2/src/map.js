let resizeTimer = null;

// Constellation connection order — defines edges between buildings
const CONSTELLATION_EDGES = [
  ['hotel-california', 'california-theatre'],
  ['california-theatre', 'theatre-annex'],
  ['theatre-annex', 'castle-rock-inn'],
  ['castle-rock-inn', 'energy-station']
];

export function initMap(buildings, gameState, mode, onBuildingClick) {
  const svg = document.getElementById('map-overlay');
  const img = document.getElementById('map-image');
  svg.innerHTML = '';

  document.getElementById('map-mode-label').textContent =
    mode === 'investor' ? 'Investor Tour' : 'Mystery Tour — Explore the Village';

  // Update progress indicator
  updateProgress(buildings, gameState, mode);

  // Show/hide reset button
  const resetBtn = document.getElementById('btn-reset-game');
  if (resetBtn) {
    if (mode === 'game') {
      resetBtn.classList.remove('hidden');
    } else {
      resetBtn.classList.add('hidden');
    }
  }

  function renderNodes() {
    svg.innerHTML = '';
    const imgW = img.naturalWidth || 1512;
    const imgH = img.naturalHeight || 810;

    svg.setAttribute('viewBox', `0 0 ${imgW} ${imgH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Create defs for fog-of-war gradient
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const fogGradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    fogGradient.setAttribute('id', 'fog-gradient');
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#0a0805');
    stop1.setAttribute('stop-opacity', '0.7');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#0a0805');
    stop2.setAttribute('stop-opacity', '0');
    fogGradient.appendChild(stop1);
    fogGradient.appendChild(stop2);
    defs.appendChild(fogGradient);
    svg.appendChild(defs);

    // Build a lookup map for positions
    const posMap = {};
    buildings.forEach(b => { posMap[b.id] = b; });

    // Draw constellation lines
    CONSTELLATION_EDGES.forEach(([fromId, toId]) => {
      const from = posMap[fromId];
      const to = posMap[toId];
      if (!from || !to) return;

      const fromUnlocked = mode === 'investor' || gameState.unlockedBuildings.includes(fromId);
      const toUnlocked = mode === 'investor' || gameState.unlockedBuildings.includes(toId);
      const bothUnlocked = fromUnlocked && toUnlocked;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.mapPosition.x);
      line.setAttribute('y1', from.mapPosition.y);
      line.setAttribute('x2', to.mapPosition.x);
      line.setAttribute('y2', to.mapPosition.y);
      line.setAttribute('class', `constellation-line ${bothUnlocked ? 'revealed' : ''}`);
      svg.appendChild(line);
    });

    // Draw building nodes
    buildings.forEach(building => {
      const isUnlocked = mode === 'investor' ||
        gameState.unlockedBuildings.includes(building.id);

      const x = building.mapPosition.x;
      const y = building.mapPosition.y;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `map-node ${isUnlocked ? 'map-node-revealed' : 'map-node-locked'}`);
      g.style.cursor = isUnlocked ? 'pointer' : 'default';

      // Fog-of-war circle under locked nodes
      if (!isUnlocked && mode === 'game') {
        const fog = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        fog.setAttribute('cx', x);
        fog.setAttribute('cy', y);
        fog.setAttribute('r', '60');
        fog.setAttribute('fill', 'url(#fog-gradient)');
        fog.setAttribute('class', 'map-fog');
        g.appendChild(fog);
      }

      // Outer glow ring
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('cx', x);
      glow.setAttribute('cy', y);
      glow.setAttribute('r', '24');
      glow.setAttribute('fill', 'none');
      glow.setAttribute('stroke', building.color);
      glow.setAttribute('stroke-width', '1.5');
      glow.setAttribute('opacity', isUnlocked ? '0.4' : '0.1');
      if (isUnlocked) glow.setAttribute('class', 'map-node-pulse');

      // Main circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      const baseR = building.constellation.starSize * 6;
      circle.setAttribute('r', `${baseR}`);
      circle.setAttribute('fill', isUnlocked ? building.color : 'rgba(100,80,60,0.3)');
      circle.setAttribute('stroke', isUnlocked ? building.color : 'rgba(100,80,60,0.2)');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('class', 'map-node-circle');

      // Lock icon if locked
      if (!isUnlocked) {
        const lock = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lock.setAttribute('x', x);
        lock.setAttribute('y', y + 5);
        lock.setAttribute('text-anchor', 'middle');
        lock.setAttribute('font-size', '14');
        lock.setAttribute('fill', 'rgba(180,160,120,0.3)');
        lock.textContent = '◈';
        g.appendChild(lock);
      }

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', y + 32);
      label.setAttribute('class', 'map-node-label');
      label.setAttribute('opacity', isUnlocked ? '0.9' : '0.3');
      label.textContent = building.shortName;

      g.appendChild(glow);
      g.appendChild(circle);
      g.appendChild(label);
      svg.appendChild(g);

      if (isUnlocked) {
        g.addEventListener('click', () => onBuildingClick(building.id));
        g.addEventListener('mouseenter', () => {
          circle.setAttribute('r', `${baseR * 1.3}`);
        });
        g.addEventListener('mouseleave', () => {
          circle.setAttribute('r', `${baseR}`);
        });

        // Touch support
        g.addEventListener('touchend', (e) => {
          e.preventDefault();
          onBuildingClick(building.id);
        });
      }
    });
  }

  // Always render nodes immediately with fallback dimensions
  renderNodes();

  // Re-render when image loads (to get exact dimensions)
  if (!img.complete) {
    img.addEventListener('load', () => {
      img.classList.remove('img-error');
      renderNodes();
    }, { once: true });
    img.addEventListener('error', () => {
      img.classList.add('img-error');
    }, { once: true });
  } else if (img.naturalWidth === 0) {
    img.classList.add('img-error');
  }

  // Debounced resize handler
  window.removeEventListener('resize', handleResize);
  window.addEventListener('resize', handleResize);

  function handleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderNodes();
    }, 200);
  }
}

function updateProgress(buildings, gameState, mode) {
  const progressEl = document.getElementById('map-progress');
  if (!progressEl) return;

  if (mode !== 'game') {
    progressEl.classList.add('hidden');
    return;
  }

  progressEl.classList.remove('hidden');
  const unlocked = gameState.unlockedBuildings.length;
  const total = buildings.length;

  const dots = buildings.map(b => {
    const isUnlocked = gameState.unlockedBuildings.includes(b.id);
    return `<span class="progress-dot ${isUnlocked ? 'unlocked' : ''}" title="${b.shortName}" style="${isUnlocked ? `background: ${b.color}; box-shadow: 0 0 6px ${b.color}` : ''}"></span>`;
  }).join('');

  progressEl.innerHTML = `
    <div>${unlocked} of ${total} discovered</div>
    <div class="progress-dots">${dots}</div>
  `;
}
