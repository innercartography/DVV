import { initMap } from './map.js';

export function startInvestorTour(buildings, showMap, showBuilding) {
  document.getElementById('map-mode-label').textContent = 'Investor Tour';
  showMap();
  // In investor mode, all buildings are unlocked; no MoE state needed
  const investorState = { unlockedBuildings: buildings.map(b => b.id), completedClues: [] };
  initMap(buildings, investorState, null, 'investor', showBuilding);
}
