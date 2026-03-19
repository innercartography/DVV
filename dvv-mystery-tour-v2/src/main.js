import './styles.css';
import { loadBuildings } from './building.js';
import { initMap } from './map.js';
import { startInvestorTour } from './investor-tour.js';
import { startMysteryGame } from './mystery-game.js';
import {
  loadMoeState, saveMoeState, resetMoeState,
  recordVisit, recordFragment, isSynthesisAvailable
} from './progression.js';
import { routeFragments, buildSynthesisFragments } from './moe-router.js';

let buildings = [];
let allGhosts = [];   // loaded from ghosts.json at startup
let ghostsData = {};  // full ghosts.json, including synthesis key
let currentMode = null;
let currentBuilding = null;
let currentPhase = 'current';

// Game state — persisted in localStorage
let gameState = {
  unlockedBuildings: ['hotel-california'],
  completedClues: [],
  visitedPhases: {}
};

// MoE state — persisted separately to avoid desync
let moeState = loadMoeState();

async function init() {
  // Load buildings and ghost definitions in parallel
  [buildings, ghostsData] = await Promise.all([
    loadBuildings('/data/buildings.json'),
    fetch('/data/ghosts.json').then(r => r.json())
  ]);
  allGhosts = ghostsData.ghosts || [];

  // Load saved game state
  const saved = localStorage.getItem('dvv-game-state');
  if (saved) {
    try { gameState = JSON.parse(saved); } catch (e) { /* use default */ }
  }

  // Mode selector buttons
  document.getElementById('btn-investor').addEventListener('click', () => {
    currentMode = 'investor';
    startInvestorTour(buildings, showMap, showBuilding);
  });

  document.getElementById('btn-game').addEventListener('click', () => {
    currentMode = 'game';
    startMysteryGame(buildings, gameState, moeState, showMap, showBuilding);
  });


  document.getElementById('btn-back-to-menu').addEventListener('click', showModeSelector);
  document.getElementById('btn-back-to-map').addEventListener('click', showMap);

  // Reset game progress — clears BOTH state keys to prevent desync
  document.getElementById('btn-reset-game').addEventListener('click', () => {
    if (confirm('Reset all mystery tour progress? You will start over from the Hotel.')) {
      gameState = {
        unlockedBuildings: ['hotel-california'],
        completedClues: [],
        visitedPhases: {}
      };
      saveGameState();
      moeState = resetMoeState();
      showMap();
      initMap(buildings, gameState, moeState, 'game', showBuilding);
    }
  });

  // Remove loading state
  document.body.classList.add('loaded');
}

function showModeSelector() {
  hideAll();
  document.getElementById('mode-selector').classList.remove('hidden');
}

function showMap() {
  hideAll();
  document.getElementById('map-view').classList.remove('hidden');
}

function showBuilding(buildingId, phase = 'current') {
  const building = buildings.find(b => b.id === buildingId);
  if (!building) return;

  currentBuilding = building;
  currentPhase = phase;

  hideAll();
  const panel = document.getElementById('building-panel');
  panel.classList.remove('hidden');

  // Set header
  document.getElementById('panel-building-name').textContent = building.name;
  document.getElementById('panel-building-tagline').textContent = building.tagline;
  panel.style.setProperty('--building-color', building.color);

  // Render phase tabs
  renderPhaseTabs(building);

  // Render current phase content
  renderPhaseContent(building, phase);

  // Investor notes (investor mode only)
  const notesEl = document.getElementById('investor-notes');
  if (currentMode === 'investor') {
    notesEl.classList.remove('hidden');
    notesEl.innerHTML = `
      <div class="investor-notes-label">Investor Notes</div>
      <div class="investor-notes-text">${building.investorNotes}</div>
    `;
  } else {
    notesEl.classList.add('hidden');
  }

  // Clue panel (game mode only)
  renderCluePanel(building);

  // Ghost fragment panel (game mode, MoE layer)
  renderGhostPanel(building);
}

function renderPhaseTabs(building) {
  const tabsEl = document.getElementById('phase-tabs');
  tabsEl.innerHTML = '';

  Object.entries(building.phases).forEach(([phaseKey, phase]) => {
    const tab = document.createElement('button');
    tab.className = `phase-tab ${phaseKey === currentPhase ? 'active' : ''}`;
    tab.innerHTML = `
      <span class="tab-icon">${phase.icon || '◉'}</span>
      <span class="tab-label">${phase.label}</span>
      <span class="${phase.ready ? 'tab-ready' : 'tab-pending'}">
        ${phase.ready ? '● Live' : '○ Soon'}
      </span>
    `;
    tab.addEventListener('click', () => {
      currentPhase = phaseKey;
      document.querySelectorAll('.phase-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPhaseContent(building, phaseKey);
      renderCluePanel(building);
    });
    tabsEl.appendChild(tab);
  });
}

function renderPhaseContent(building, phaseKey) {
  const phase = building.phases[phaseKey];
  const content = document.getElementById('phase-content');

  let worldHTML = '';

  if (phase.videoUrl) {
    worldHTML = `
      <div class="world-viewer">
        <video autoplay loop muted playsinline>
          <source src="${phase.videoUrl}" type="video/mp4">
        </video>
      </div>
    `;
  } else if (phase.worldUrl) {
    worldHTML = `
      <div class="world-viewer">
        <div class="world-viewer-placeholder">
          <span class="placeholder-icon">◈</span>
          <div class="placeholder-text">3D World — Open in Headset</div>
        </div>
      </div>
    `;
  } else if (phase.photoUrl) {
    worldHTML = `
      <div class="world-viewer">
        <img src="${phase.photoUrl}" style="width:100%;height:100%;object-fit:cover;">
      </div>
    `;
  } else {
    worldHTML = `
      <div class="world-viewer">
        <div class="world-viewer-placeholder">
          <span class="placeholder-icon">◇</span>
          <div class="placeholder-text">${phase.comingSoonText || 'Coming Soon'}</div>
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <p class="phase-description">${phase.description || ''}</p>
    ${worldHTML}
  `;

  // Auto-play audio if present
  if (phase.audioUrl) {
    const audio = new Audio(phase.audioUrl);
    audio.loop = true;
    audio.volume = 0.3;
    audio.play().catch(() => {});
  }
}

function renderCluePanel(building) {
  const clueEl = document.getElementById('clue-panel');

  if (currentMode !== 'game' || !building.clue) {
    clueEl.classList.add('hidden');
    return;
  }

  const clue = building.clue;
  const isCompleted = gameState.completedClues.includes(building.id);
  const isCorrectPhase = clue.hiddenIn === currentPhase;

  if (isCompleted) {
    clueEl.classList.remove('hidden');
    clueEl.innerHTML = `
      <div class="clue-label">Clue Found</div>
      <div class="clue-hint" style="color:#27ae60">✓ ${clue.unlocksMessage}</div>
    `;
    return;
  }

  if (!isCorrectPhase) {
    clueEl.classList.add('hidden');
    return;
  }

  clueEl.classList.remove('hidden');

  // Special handling for the final clue (no answer required)
  if (clue.type === 'final') {
    clueEl.innerHTML = `
      <div class="clue-label">◈ The Journey Is Complete</div>
      <div class="clue-hint">${clue.hint}</div>
      <button class="clue-submit" id="clue-reveal-btn" style="margin-top: 1rem; width: 100%;">
        Reveal The Village
      </button>
    `;
    document.getElementById('clue-reveal-btn').addEventListener('click', () => {
      gameState.completedClues.push(building.id);
      saveGameState();
      showFinalReveal();
    });
    return;
  }

  clueEl.innerHTML = `
    <div class="clue-label">◈ A Clue Is Hidden Here</div>
    <div class="clue-hint">${clue.hint}</div>
    <div class="clue-input-row">
      <input 
        type="text" 
        class="clue-input" 
        placeholder="Enter what you found..."
        id="clue-input-field"
      >
      <button class="clue-submit" id="clue-submit-btn">Submit</button>
    </div>
    <div class="clue-feedback" id="clue-feedback"></div>
  `;

  document.getElementById('clue-submit-btn').addEventListener('click', () => {
    const answer = document.getElementById('clue-input-field').value.toLowerCase().trim();
    const feedback = document.getElementById('clue-feedback');

    if (answer === clue.answer) {
      feedback.className = 'clue-feedback correct';
      feedback.textContent = '✓ ' + clue.unlocksMessage;

      // Update game state
      gameState.completedClues.push(building.id);
      if (clue.unlocksBuilding) {
        gameState.unlockedBuildings.push(clue.unlocksBuilding);
      }
      saveGameState();

      // Refresh the map in background
      initMap(buildings, gameState, moeState, currentMode, showBuilding);

    } else {
      feedback.className = 'clue-feedback incorrect';
      feedback.textContent = 'Not quite. Look more carefully.';
    }
  });

  // Allow enter key
  document.getElementById('clue-input-field').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('clue-submit-btn').click();
  });
}

function showFinalReveal() {
  hideAll();
  const reveal = document.getElementById('final-reveal');
  reveal.classList.remove('hidden');
  document.getElementById('reveal-title').textContent = 'THE VILLAGE IS REVEALED';
  document.getElementById('reveal-text').textContent =
    'You have walked through every building. You have heard every story. You have found every clue. Now you know what this place is asking to become. A village for visionaries. Built not from nostalgia but from vision. The question is: will you help build it?';

  // Build a summary of all discovered buildings
  const summary = document.getElementById('reveal-buildings-summary');
  if (summary) {
    summary.innerHTML = buildings.map(b => `
      <div class="reveal-building-card" style="--card-color: ${b.color}">
        <div class="reveal-card-name">${b.shortName}</div>
        <div class="reveal-card-year">Est. ${b.built}</div>
      </div>
    `).join('');
  }

  // Create star particles for the reveal
  const starsContainer = reveal.querySelector('.reveal-stars');
  if (starsContainer) {
    starsContainer.innerHTML = '';
    for (let i = 0; i < 40; i++) {
      const star = document.createElement('div');
      star.className = 'reveal-star';
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.animationDelay = `${Math.random() * 3}s`;
      star.style.animationDuration = `${2 + Math.random() * 3}s`;
      starsContainer.appendChild(star);
    }
  }

  document.getElementById('btn-contact').addEventListener('click', () => {
    window.location.href = 'mailto:mark@dunsmuirvillage.com?subject=I walked through the Mystery Tour';
  });
}

function saveGameState() {
  localStorage.setItem('dvv-game-state', JSON.stringify(gameState));
}

function hideAll() {
  ['mode-selector', 'map-view', 'building-panel', 'final-reveal', 'mystery-intro', 'synthesis-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// ─── Ghost Panel (MoE narrative layer) ───────────────────────────────────────

function renderGhostPanel(building) {
  const panel = document.getElementById('ghost-panel');
  if (!panel) return;

  // Only show in game mode, and only if the building has expert routing
  if (currentMode !== 'game' || !building.experts) {
    panel.classList.add('hidden');
    return;
  }

  // Record this visit (unique) and derive new state
  moeState = recordVisit(moeState, building.id, buildings.length);

  // Check for synthesis BEFORE routing fragments (convergence on 5th unique building)
  if (isSynthesisAvailable(moeState, buildings.length)) {
    saveMoeState(moeState);
    // Refresh map so the 5th sigil renders and atmosphere shifts to convergence
    initMap(buildings, gameState, moeState, 'game', showBuilding);
    // Show synthesis overlay instead of standard ghost panel
    renderSynthesisOverlay();
    return;
  }

  // Route fragments for this building and progression state
  const fragments = routeFragments(building, moeState, allGhosts);

  if (!fragments.length) {
    panel.classList.add('hidden');
    return;
  }

  // Record which fragments were surfaced
  fragments.forEach(f => {
    if (f.type !== 'recalled') {
      moeState = recordFragment(moeState, building.id, f.ghost.id, f.type);
    }
  });
  saveMoeState(moeState);

  // Refresh map to show ghost sigil on this building
  initMap(buildings, gameState, moeState, 'game', showBuilding);

  panel.classList.remove('hidden');
  panel.innerHTML = fragments.map(f => `
    <div class="ghost-fragment ${f.ghost.cssClass} ${f.type === 'recalled' ? 'recalled' : ''}">
      <div class="ghost-header">
        <span class="ghost-icon">${f.ghost.icon}</span>
        <span class="ghost-name">${f.ghost.name}</span>
        ${f.type === 'secondary' ? `<span class="ghost-counterpoint-badge" style="color:${f.ghost.color}">Counterpoint</span>` : ''}
        <span class="ghost-domain">${f.ghost.domain}</span>
      </div>
      <div class="ghost-fragment-text">${f.text}</div>
    </div>
  `).join('');
}

function renderSynthesisOverlay() {
  hideAll();
  const overlay = document.getElementById('synthesis-overlay');
  overlay.classList.remove('hidden');

  const fragmentsEl = document.getElementById('synthesis-fragments');
  const synthFragments = buildSynthesisFragments(ghostsData, allGhosts);

  fragmentsEl.innerHTML = synthFragments.map(f => `
    <div class="synthesis-fragment ${f.ghost.cssClass}">
      <div class="synthesis-fragment-name">${f.ghost.icon} ${f.ghost.name}</div>
      <div class="synthesis-fragment-text">${f.text}</div>
    </div>
  `).join('');

  // Continue button transitions to the existing final-reveal flow
  document.getElementById('btn-synthesis-continue').addEventListener('click', () => {
    hideAll();
    showMap();
  }, { once: true });
}

// Audio — autoplay on first interaction, toggle with ♪ button
const audioToggle = document.getElementById('audio-toggle');
let ambientAudio = new Audio('/audio/ambient.mp3');
ambientAudio.loop = true;
ambientAudio.volume = 1.0;

// Browsers block autoplay — start on first user interaction
function startAudioOnce() {
  ambientAudio.play().catch(() => {});
  if (audioToggle) audioToggle.classList.add('playing');
  document.removeEventListener('click', startAudioOnce);
  document.removeEventListener('keydown', startAudioOnce);
}
document.addEventListener('click', startAudioOnce);
document.addEventListener('keydown', startAudioOnce);

if (audioToggle) {
  audioToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // don't trigger startAudioOnce twice
    if (!ambientAudio.paused) {
      ambientAudio.pause();
      audioToggle.classList.remove('playing');
    } else {
      ambientAudio.play().catch(() => {});
      audioToggle.classList.add('playing');
    }
  });
}

init();
