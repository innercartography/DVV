import * as THREE from 'three';
import { createNodeMesh, createNodeLabel, setNodeHovered, setNodeSelected, setNodeDimmed } from './NodeMeshFactory.js';
import { EdgeRenderer } from './EdgeRenderer.js';
import { computeCentralized, computeDecentralized, computeDistributed } from './TopologyLayouts.js';

/**
 * Core graph rendering engine.
 * Manages nodes, edges, topology transitions, and interaction.
 */

const TOPOLOGIES = {
  centralized: computeCentralized,
  decentralized: computeDecentralized,
  distributed: computeDistributed,
};

export class GraphRenderer {
  constructor(scene) {
    this.scene = scene;
    this.nodeGroup = new THREE.Group();
    this.nodeGroup.name = 'nodes';
    this.labelGroup = new THREE.Group();
    this.labelGroup.name = 'labels';
    this.scene.add(this.nodeGroup);
    this.scene.add(this.labelGroup);

    this.edgeRenderer = new EdgeRenderer(scene);

    this.nodeMeshes = new Map();      // nodeId → mesh
    this.nodeLabels = new Map();      // nodeId → sprite
    this.nodeDataMap = new Map();     // nodeId → node data
    this.currentPositions = new Map(); // nodeId → Vector3
    this.targetPositions = new Map();  // nodeId → Vector3

    this.nodes = [];
    this.edges = [];
    this.currentTopology = 'centralized';
    this.isTransitioning = false;
    this.transitionProgress = 0;
    this.transitionDuration = 1.5; // seconds

    this.selectedNodeId = null;
    this.hoveredNodeId = null;

    // Animation
    this.time = 0;
  }

  loadData(graphData) {
    this.nodes = graphData.nodes;
    this.edges = graphData.edges;

    // Build node data map
    this.nodes.forEach(node => {
      this.nodeDataMap.set(node.id, node);
    });

    // Create meshes
    this.nodes.forEach(node => {
      const mesh = createNodeMesh(node);
      this.nodeGroup.add(mesh);
      this.nodeMeshes.set(node.id, mesh);

      const label = createNodeLabel(node);
      this.labelGroup.add(label);
      this.nodeLabels.set(node.id, label);
    });

    // Compute initial layout
    this.setTopology('centralized', false);
  }

  setTopology(topologyName, animate = true) {
    const computeLayout = TOPOLOGIES[topologyName];
    if (!computeLayout) return;

    this.currentTopology = topologyName;

    // Compute new target positions
    this.targetPositions = computeLayout(this.nodes, this.edges);

    if (animate && this.currentPositions.size > 0) {
      // Start transition
      this.isTransitioning = true;
      this.transitionProgress = 0;
      this.transitionStartPositions = new Map();
      this.currentPositions.forEach((pos, id) => {
        this.transitionStartPositions.set(id, pos.clone());
      });
    } else {
      // Snap to positions
      this.targetPositions.forEach((pos, id) => {
        this.currentPositions.set(id, pos.clone());
      });
      this.applyPositions();
      this.edgeRenderer.buildEdges(this.edges, this.currentPositions, this.nodeDataMap);
    }
  }

  applyPositions() {
    this.currentPositions.forEach((pos, id) => {
      const mesh = this.nodeMeshes.get(id);
      const label = this.nodeLabels.get(id);
      if (mesh) {
        mesh.position.copy(pos);
      }
      if (label) {
        label.position.copy(pos);
        label.position.y += 0.75;
      }
    });
  }

  selectNode(nodeId) {
    const prevSelected = this.selectedNodeId;
    this.selectedNodeId = nodeId;

    // Reset previous selection
    if (prevSelected) {
      const prevMesh = this.nodeMeshes.get(prevSelected);
      if (prevMesh) setNodeSelected(prevMesh, false);
    }

    // Apply new selection
    if (nodeId) {
      const mesh = this.nodeMeshes.get(nodeId);
      if (mesh) setNodeSelected(mesh, true);

      // Highlight connected edges
      this.edgeRenderer.highlightEdgesForNode(nodeId);

      // Dim non-connected nodes
      const connectedIds = this.getConnectedNodeIds(nodeId);
      connectedIds.add(nodeId);
      this.nodeMeshes.forEach((m, id) => {
        setNodeDimmed(m, !connectedIds.has(id));
        const label = this.nodeLabels.get(id);
        if (label) {
          label.material.opacity = connectedIds.has(id) ? 0.9 : 0.15;
        }
      });
    } else {
      // Clear selection
      this.edgeRenderer.resetHighlight();
      this.nodeMeshes.forEach((m) => setNodeDimmed(m, false));
      this.nodeLabels.forEach((l) => { l.material.opacity = 0.7; });
    }

    // Update detail panel
    this.updateDetailPanel(nodeId);
  }

  hoverNode(nodeId) {
    if (nodeId === this.hoveredNodeId) return;

    // Unhover previous
    if (this.hoveredNodeId) {
      const prevMesh = this.nodeMeshes.get(this.hoveredNodeId);
      if (prevMesh) setNodeHovered(prevMesh, false);
    }

    this.hoveredNodeId = nodeId;

    if (nodeId) {
      const mesh = this.nodeMeshes.get(nodeId);
      if (mesh) setNodeHovered(mesh, true);
      document.body.style.cursor = 'pointer';
    } else {
      document.body.style.cursor = 'default';
    }
  }

  getConnectedNodeIds(nodeId) {
    const connected = new Set();
    this.edges.forEach(edge => {
      if (edge.source === nodeId) connected.add(edge.target);
      if (edge.target === nodeId) connected.add(edge.source);
    });
    return connected;
  }

  updateDetailPanel(nodeId) {
    const panel = document.getElementById('detail-panel');
    if (!nodeId) {
      panel.classList.add('hidden');
      return;
    }

    const node = this.nodeDataMap.get(nodeId);
    if (!node) return;

    // Type badge
    const badge = document.getElementById('detail-type-badge');
    badge.textContent = `${node.category} · ${node.type}`;
    badge.className = node.category;

    // Title & description
    document.getElementById('detail-title').textContent = node.label;
    document.getElementById('detail-description').textContent = node.description;

    // Metadata
    const metaDiv = document.getElementById('detail-metadata');
    metaDiv.innerHTML = '';
    if (node.metadata) {
      Object.entries(node.metadata).forEach(([key, value]) => {
        const row = document.createElement('div');
        row.className = 'meta-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'meta-key';
        keyEl.textContent = key.replace(/_/g, ' ');
        const valEl = document.createElement('span');
        valEl.className = 'meta-value';
        valEl.textContent = Array.isArray(value) ? value.join(', ') : String(value);
        row.appendChild(keyEl);
        row.appendChild(valEl);
        metaDiv.appendChild(row);
      });
    }

    // Connections
    const connList = document.getElementById('detail-connections-list');
    connList.innerHTML = '';
    const connectedEdges = this.edges.filter(e => e.source === nodeId || e.target === nodeId);
    connectedEdges.forEach(edge => {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = this.nodeDataMap.get(otherId);
      if (!otherNode) return;

      const li = document.createElement('li');
      li.innerHTML = `${otherNode.label} <span class="conn-label">${edge.label || edge.type}</span>`;
      li.addEventListener('click', () => this.selectNode(otherId));
      connList.appendChild(li);
    });

    panel.classList.remove('hidden');
  }

  update(deltaTime) {
    this.time += deltaTime;

    // Topology transition animation
    if (this.isTransitioning) {
      this.transitionProgress += deltaTime / this.transitionDuration;

      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.isTransitioning = false;
      }

      // Smooth ease: cubic ease-in-out
      const t = this.transitionProgress;
      const ease = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Lerp positions
      this.targetPositions.forEach((targetPos, id) => {
        const startPos = this.transitionStartPositions.get(id);
        if (!startPos) return;

        const currentPos = new THREE.Vector3().lerpVectors(startPos, targetPos, ease);
        this.currentPositions.set(id, currentPos);
      });

      this.applyPositions();
      this.edgeRenderer.updatePositions(this.currentPositions);

      // Rebuild edges on completion
      if (!this.isTransitioning) {
        this.edgeRenderer.buildEdges(this.edges, this.currentPositions, this.nodeDataMap);
        if (this.selectedNodeId) {
          this.edgeRenderer.highlightEdgesForNode(this.selectedNodeId);
        }
      }
    }

    // Gentle floating animation for nodes
    this.nodeMeshes.forEach((mesh, id) => {
      const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const floatY = Math.sin(this.time * 0.5 + hash * 0.1) * 0.08;
      const floatX = Math.cos(this.time * 0.3 + hash * 0.15) * 0.04;
      mesh.position.y += floatY * 0.02;
      mesh.position.x += floatX * 0.02;

      // Slow rotation
      mesh.rotation.y += deltaTime * 0.2;
      mesh.rotation.x += deltaTime * 0.05;
    });
  }

  getNodeMeshes() {
    return [...this.nodeMeshes.values()];
  }

  dispose() {
    this.nodeGroup.children.forEach(child => {
      child.geometry?.dispose();
      child.material?.dispose();
    });
    this.labelGroup.children.forEach(child => {
      child.material?.map?.dispose();
      child.material?.dispose();
    });
    this.edgeRenderer.dispose();
    this.scene.remove(this.nodeGroup);
    this.scene.remove(this.labelGroup);
  }
}
