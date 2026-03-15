import { initMap } from './map.js';

export function startMysteryGame(buildings, gameState, showMap, showBuilding) {
  document.getElementById('map-mode-label').textContent = 'Mystery Tour — Explore the Village';
  showMap();
  initMap(buildings, gameState, 'game', showBuilding);
}
