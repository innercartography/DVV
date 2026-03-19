import './styles.css';
import { loadBuildings } from './building.js';
import { initMap } from './map.js';
import { startInvestorTour } from './investor-tour.js';
import { startMysteryGame } from './mystery-game.js';

let buildings = [];
let currentMode = null;
let currentBuilding = null;
let currentPhase = 'current';

// Game state — persisted in localStorage
let gameState = {
  unlockedBuildings: ['hotel-california'],
  completedClues: [],
  visitedPhases: {}
};

async function init() {
  buildings = await loadBuildings('/data/buildings.json');

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
    startMysteryGame(buildings, gameState, showMap, showBuilding);
  });

  document.getElementById('btn-back-to-menu').addEventListener('click', showModeSelector);
  document.getElementById('btn-back-to-map').addEventListener('click', showMap);

  // Reset game progress
  document.getElementById('btn-reset-game').addEventListener('click', () => {
    if (confirm('Reset all mystery tour progress? You will start over from the Hotel.')) {
      gameState = {
        unlockedBuildings: ['hotel-california'],
        completedClues: [],
        visitedPhases: {}
      };
      saveGameState();
      showMap();
      initMap(buildings, gameState, 'game', showBuilding);
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
      initMap(buildings, gameState, currentMode, showBuilding);

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
  ['mode-selector', 'map-view', 'building-panel', 'final-reveal', 'mystery-intro'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
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
