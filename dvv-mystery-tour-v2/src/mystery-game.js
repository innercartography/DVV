import { initMap } from './map.js';

export function startMysteryGame(buildings, gameState, moeState, showMap, showBuilding) {
  const intro = document.getElementById('mystery-intro');
  const beginBtn = document.getElementById('btn-begin-mystery');

  // Show the narrative intro overlay
  hideAll();
  intro.classList.remove('hidden');

  // Begin button transitions to the map
  beginBtn.addEventListener('click', () => {
    intro.classList.add('fading-out');
    setTimeout(() => {
      intro.classList.add('hidden');
      intro.classList.remove('fading-out');
      document.getElementById('map-mode-label').textContent = 'Mystery Tour — Explore the Village';
      showMap();
      initMap(buildings, gameState, moeState, 'game', showBuilding);
    }, 600);
  }, { once: true });
}

function hideAll() {
  ['mode-selector', 'map-view', 'building-panel', 'final-reveal', 'synthesis-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}
