/**
 * moe-router.js
 * Pure routing function — zero side effects, no DOM, no localStorage.
 * Takes the current building + moeState + loaded ghost definitions.
 * Returns an ordered array of fragment objects to render.
 *
 * Fragment object shape:
 * {
 *   ghost: { id, name, color, cssClass, icon, ... },
 *   text: string,
 *   type: 'primary' | 'secondary' | 'recalled'
 * }
 */

import { getTourPhase } from './progression.js';

/**
 * @param {Object} building       - Building object from buildings.json
 * @param {Object} moeState       - Current MoE state from progression.js
 * @param {Array}  allGhosts      - Ghost definitions loaded from ghosts.json
 * @returns {Array} fragments     - Ordered fragments to display, may be empty
 */
export function routeFragments(building, moeState, allGhosts) {
  if (!building.experts) return [];

  const phase = getTourPhase(moeState);
  const primaryGhostId = building.experts.primary;
  const secondaryGhostId = building.experts.secondary;
  const results = [];

  // ── Primary ghost ─────────────────────────────────────────────────────────
  const primaryGhost = allGhosts.find(g => g.id === primaryGhostId);
  if (primaryGhost) {
    const primaryFrag = building.experts.fragments?.[primaryGhostId]?.primary;
    if (primaryFrag) {
      const alreadySeen = moeState.fragmentsUnlocked.some(
        f => f.building === building.id && f.ghost === primaryGhostId && f.type === 'primary'
      );
      results.push({
        ghost: primaryGhost,
        text: primaryFrag,
        type: alreadySeen ? 'recalled' : 'primary'
      });
    }
  }

  // ── Secondary ghost (deepening + convergence phase only) ─────────────────
  if ((phase === 'deepening' || phase === 'convergence') && secondaryGhostId) {
    const secondaryGhost = allGhosts.find(g => g.id === secondaryGhostId);
    if (secondaryGhost) {
      const secondaryFrag = building.experts.fragments?.[secondaryGhostId]?.secondary;
      if (secondaryFrag) {
        results.push({
          ghost: secondaryGhost,
          text: secondaryFrag,
          type: 'secondary'
        });
      }
    }
  }

  return results;
}

/**
 * Build the synthesis fragment list from ghosts.json synthesis data.
 * Returns an array of { ghost, text } for use in the convergence overlay.
 *
 * @param {Object} ghostsData  - Full ghosts.json object (contains .synthesis)
 * @param {Array}  allGhosts   - Ghost definitions (for lookup)
 */
export function buildSynthesisFragments(ghostsData, allGhosts) {
  if (!ghostsData?.synthesis?.fragments) return [];
  return ghostsData.synthesis.fragments.map(f => ({
    ghost: allGhosts.find(g => g.id === f.ghost),
    text: f.text
  })).filter(f => f.ghost); // guard against bad ghost ids
}
