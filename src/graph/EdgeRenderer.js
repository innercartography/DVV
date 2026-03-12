import * as THREE from 'three';

/**
 * Renders edges between nodes as curved lines with animated particles.
 */

const EDGE_COLORS = {
  history: 0xaa66ff,
  land:    0x00ffc8,
  future:  0x88ff44,
  default: 0x445566,
};

export class EdgeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.edgeGroup = new THREE.Group();
    this.edgeGroup.name = 'edges';
    this.scene.add(this.edgeGroup);

    this.edgeMeshes = [];       // { line, data, sourceId, targetId }
    this.particleSystems = [];  // animated flow particles
  }

  buildEdges(edges, nodePositions, nodeDataMap) {
    // Clear existing
    this.clear();

    edges.forEach(edge => {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);
      if (!sourcePos || !targetPos) return;

      // Determine color from source node category
      const sourceNode = nodeDataMap.get(edge.source);
      const category = sourceNode ? sourceNode.category : 'default';
      const color = EDGE_COLORS[category] || EDGE_COLORS.default;

      // Create curved line via quadratic bezier
      const mid = new THREE.Vector3()
        .addVectors(sourcePos, targetPos)
        .multiplyScalar(0.5);
      // Offset the midpoint perpendicular to the line for curve
      const dir = new THREE.Vector3().subVectors(targetPos, sourcePos);
      const perpendicular = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.3).normalize();
      const curveOffset = dir.length() * 0.1;
      mid.add(perpendicular.multiplyScalar(curveOffset));

      const curve = new THREE.QuadraticBezierCurve3(sourcePos.clone(), mid, targetPos.clone());
      const points = curve.getPoints(24);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);

      const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.15,
        linewidth: 1,
      });

      const line = new THREE.Line(geometry, material);
      line.userData = { edge, sourceId: edge.source, targetId: edge.target };

      this.edgeGroup.add(line);
      this.edgeMeshes.push({
        line,
        data: edge,
        sourceId: edge.source,
        targetId: edge.target,
        material,
        baseOpacity: 0.15,
      });
    });
  }

  updatePositions(nodePositions) {
    this.edgeMeshes.forEach(({ line, sourceId, targetId }) => {
      const sourcePos = nodePositions.get(sourceId);
      const targetPos = nodePositions.get(targetId);
      if (!sourcePos || !targetPos) return;

      const mid = new THREE.Vector3()
        .addVectors(sourcePos, targetPos)
        .multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(targetPos, sourcePos);
      const perpendicular = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.3).normalize();
      const curveOffset = dir.length() * 0.1;
      mid.add(perpendicular.multiplyScalar(curveOffset));

      const curve = new THREE.QuadraticBezierCurve3(sourcePos.clone(), mid, targetPos.clone());
      const points = curve.getPoints(24);
      line.geometry.setFromPoints(points);
      line.geometry.computeBoundingSphere();
    });
  }

  highlightEdgesForNode(nodeId) {
    this.edgeMeshes.forEach(({ line, sourceId, targetId, material }) => {
      const isConnected = sourceId === nodeId || targetId === nodeId;
      material.opacity = isConnected ? 0.6 : 0.05;

      if (isConnected) {
        material.color.setHex(0x00ffc8);
      }
    });
  }

  resetHighlight() {
    this.edgeMeshes.forEach(({ material, sourceId, data }) => {
      material.opacity = 0.15;
      // Reset color to category-based
      const category = data._sourceCategory || 'default';
      material.color.setHex(EDGE_COLORS[category] || EDGE_COLORS.default);
    });
  }

  dimAll() {
    this.edgeMeshes.forEach(({ material }) => {
      material.opacity = 0.03;
    });
  }

  clear() {
    while (this.edgeGroup.children.length) {
      const child = this.edgeGroup.children[0];
      child.geometry?.dispose();
      child.material?.dispose();
      this.edgeGroup.remove(child);
    }
    this.edgeMeshes = [];
  }

  dispose() {
    this.clear();
    this.scene.remove(this.edgeGroup);
  }
}
