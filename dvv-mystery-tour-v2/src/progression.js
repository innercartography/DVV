/**
 * progression.js
 * Manages the MoE tour state independently of the existing gameState.
 * Stored under its own localStorage key to avoid desync with dvv-game-state.
 */

const STORAGE_KEY = 'dvv-moe-state';

export function createMoeState() {
  return {
    visited: [],            // building IDs, in visit order
    fragmentsUnlocked: [],  // [{ building, ghost, type }]
    ghostsHeard: [],        // ghost IDs
    tourPhase: 'exploring'  // 'exploring' | 'deepening' | 'convergence'
  };
}

export function loadMoeState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* fall through */ }
  return createMoeState();
}

export function saveMoeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetMoeState() {
  localStorage.removeItem(STORAGE_KEY);
  return createMoeState();
}

/**
 * Record a building visit and update derived state.
 * Returns a new state object — does not mutate the input.
 * Synthesis check is based on unique buildings visited vs total count.
 */
export function recordVisit(state, buildingId, totalBuildingCount) {
  const next = { ...state };

  // Only record unique visits
  if (!next.visited.includes(buildingId)) {
    next.visited = [...state.visited, buildingId];
  }

  // Derive tour phase from unique visit count
  next.tourPhase = deriveTourPhase(next.visited.length, totalBuildingCount);

  return next;
}

/**
 * Record that a ghost fragment was surfaced at a building.
 * Returns a new state object.
 */
export function recordFragment(state, buildingId, ghostId, type) {
  const already = state.fragmentsUnlocked.some(
    f => f.building === buildingId && f.ghost === ghostId && f.type === type
  );
  if (already) return state;

  const next = { ...state };
  next.fragmentsUnlocked = [
    ...state.fragmentsUnlocked,
    { building: buildingId, ghost: ghostId, type }
  ];

  if (!next.ghostsHeard.includes(ghostId)) {
    next.ghostsHeard = [...state.ghostsHeard, ghostId];
  }

  return next;
}

/**
 * Pure function — no side effects.
 */
export function getTourPhase(state) {
  return state.tourPhase;
}

/**
 * Returns true only when ALL buildings have been uniquely visited.
 */
export function isSynthesisAvailable(state, totalBuildingCount) {
  return state.visited.length >= totalBuildingCount;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function deriveTourPhase(visitedCount, totalBuildingCount) {
  if (visitedCount >= totalBuildingCount) return 'convergence';
  if (visitedCount >= 3) return 'deepening';
  return 'exploring';
}
