import * as THREE from 'three';

/**
 * Topology layout algorithms — ported from poet engineer's concepts.
 * Each returns a Map<nodeId, THREE.Vector3> of target positions.
 */

const SPHERE_RADIUS = 12;
const CLUSTER_RADIUS = 5;

// ============================================================
// CENTRALIZED: One core idea, everything orbits on a sphere
// ============================================================
export function computeCentralized(nodes, edges) {
  const positions = new Map();

  // Find the node with most connections
  const connectionCounts = new Map();
  nodes.forEach(n => connectionCounts.set(n.id, 0));
  edges.forEach(e => {
    connectionCounts.set(e.source, (connectionCounts.get(e.source) || 0) + 1);
    connectionCounts.set(e.target, (connectionCounts.get(e.target) || 0) + 1);
  });

  let centerId = nodes[0].id;
  let maxConnections = 0;
  connectionCounts.forEach((count, id) => {
    if (count > maxConnections) {
      maxConnections = count;
      centerId = id;
    }
  });

  // Center node at origin
  positions.set(centerId, new THREE.Vector3(0, 0, 0));

  // Build distance map: how many hops from center
  const hopDistance = new Map();
  hopDistance.set(centerId, 0);
  const adjacency = buildAdjacency(nodes, edges);
  const queue = [centerId];
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!hopDistance.has(neighbor)) {
        hopDistance.set(neighbor, hopDistance.get(current) + 1);
        queue.push(neighbor);
      }
    }
  }

  // Place non-center nodes on sphere, distance = hop distance
  const maxHop = Math.max(...hopDistance.values(), 1);
  const otherNodes = nodes.filter(n => n.id !== centerId);

  otherNodes.forEach((node, i) => {
    const hops = hopDistance.get(node.id) || maxHop;
    const radius = SPHERE_RADIUS * (hops / maxHop) * 0.8 + SPHERE_RADIUS * 0.2;

    // Golden angle distribution on sphere
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const theta = goldenAngle * i;
    const phi = Math.acos(1 - 2 * (i + 0.5) / otherNodes.length);

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    positions.set(node.id, new THREE.Vector3(x, y, z));
  });

  return positions;
}

// ============================================================
// DECENTRALIZED: K-means clustering → Fibonacci sphere hubs
// ============================================================
export function computeDecentralized(nodes, edges) {
  const positions = new Map();

  // Group nodes by category (history, land, future)
  const clusters = new Map();
  nodes.forEach(node => {
    const cat = node.category || 'other';
    if (!clusters.has(cat)) clusters.set(cat, []);
    clusters.get(cat).push(node);
  });

  const clusterKeys = [...clusters.keys()];
  const numClusters = clusterKeys.length;

  // Place cluster centers on Fibonacci sphere
  const clusterCenters = [];
  for (let i = 0; i < numClusters; i++) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const theta = goldenAngle * i;
    const phi = Math.acos(1 - 2 * (i + 0.5) / numClusters);
    const r = SPHERE_RADIUS * 0.9;

    clusterCenters.push(new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    ));
  }

  // Place nodes orbiting their cluster center
  clusterKeys.forEach((key, clusterIdx) => {
    const clusterNodes = clusters.get(key);
    const center = clusterCenters[clusterIdx];

    clusterNodes.forEach((node, nodeIdx) => {
      if (clusterNodes.length === 1) {
        positions.set(node.id, center.clone());
        return;
      }

      // Distribute around cluster center
      const angle = (nodeIdx / clusterNodes.length) * Math.PI * 2;
      const layerRadius = CLUSTER_RADIUS * (0.4 + 0.6 * (nodeIdx % 3) / 2);
      const yOffset = (nodeIdx % 2 === 0 ? 1 : -1) * (nodeIdx / clusterNodes.length) * 2;

      const offset = new THREE.Vector3(
        layerRadius * Math.cos(angle),
        yOffset,
        layerRadius * Math.sin(angle)
      );

      positions.set(node.id, center.clone().add(offset));
    });
  });

  return positions;
}

// ============================================================
// DISTRIBUTED: K-nearest neighbors, force-directed, no center
// ============================================================
export function computeDistributed(nodes, edges) {
  const positions = new Map();
  const K = 3; // nearest neighbors

  // Start with random positions
  nodes.forEach(node => {
    positions.set(node.id, new THREE.Vector3(
      (Math.random() - 0.5) * SPHERE_RADIUS * 2,
      (Math.random() - 0.5) * SPHERE_RADIUS * 2,
      (Math.random() - 0.5) * SPHERE_RADIUS * 2
    ));
  });

  // Build adjacency with weights
  const adjacency = buildAdjacency(nodes, edges);

  // Simple force-directed simulation (pre-computed, not live)
  const iterations = 120;
  const repulsion = 8.0;
  const attraction = 0.05;
  const damping = 0.92;

  const velocities = new Map();
  nodes.forEach(n => velocities.set(n.id, new THREE.Vector3()));

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // cooling

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const posA = positions.get(nodes[i].id);
        const posB = positions.get(nodes[j].id);
        const delta = new THREE.Vector3().subVectors(posA, posB);
        const dist = Math.max(delta.length(), 0.5);
        const force = (repulsion * temp) / (dist * dist);
        const repulsionForce = delta.normalize().multiplyScalar(force);

        velocities.get(nodes[i].id).add(repulsionForce);
        velocities.get(nodes[j].id).sub(repulsionForce);
      }
    }

    // Attraction along edges
    edges.forEach(edge => {
      const posA = positions.get(edge.source);
      const posB = positions.get(edge.target);
      if (!posA || !posB) return;

      const delta = new THREE.Vector3().subVectors(posB, posA);
      const dist = delta.length();
      const force = dist * attraction * temp;
      const attractionForce = delta.normalize().multiplyScalar(force);

      velocities.get(edge.source).add(attractionForce);
      velocities.get(edge.target).sub(attractionForce);
    });

    // Apply velocities with damping
    nodes.forEach(node => {
      const vel = velocities.get(node.id);
      vel.multiplyScalar(damping);
      positions.get(node.id).add(vel);
    });
  }

  // Center the result
  const centroid = new THREE.Vector3();
  positions.forEach(pos => centroid.add(pos));
  centroid.divideScalar(positions.size);
  positions.forEach(pos => pos.sub(centroid));

  // Scale to fit sphere
  let maxDist = 0;
  positions.forEach(pos => {
    maxDist = Math.max(maxDist, pos.length());
  });
  if (maxDist > 0) {
    const scale = SPHERE_RADIUS / maxDist;
    positions.forEach(pos => pos.multiplyScalar(scale));
  }

  return positions;
}

// ============================================================
// HELPERS
// ============================================================
function buildAdjacency(nodes, edges) {
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    if (adj.has(e.source)) adj.get(e.source).push(e.target);
    if (adj.has(e.target)) adj.get(e.target).push(e.source);
  });
  return adj;
}
