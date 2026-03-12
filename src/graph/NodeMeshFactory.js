import * as THREE from 'three';

/**
 * Creates node meshes with DVV aesthetic.
 * Type → geometry, Category → color.
 */

const CATEGORY_COLORS = {
  history: { main: 0xaa66ff, glow: 0xaa66ff },  // violet
  land:    { main: 0x00ffc8, glow: 0x00ffc8 },  // cyan
  future:  { main: 0x88ff44, glow: 0x88ff44 },  // lime
};

const TYPE_GEOMETRIES = {
  property:  () => new THREE.IcosahedronGeometry(0.45, 1),
  person:    () => new THREE.OctahedronGeometry(0.4, 0),
  place:     () => new THREE.SphereGeometry(0.4, 16, 12),
  concept:   () => new THREE.TorusKnotGeometry(0.25, 0.08, 48, 8, 2, 3),
  vision:    () => new THREE.TetrahedronGeometry(0.42, 0),
  event:     () => new THREE.ConeGeometry(0.3, 0.6, 6),
  legend:    () => new THREE.DodecahedronGeometry(0.38, 0),
  fact:      () => new THREE.BoxGeometry(0.5, 0.5, 0.5),
};

export function createNodeMesh(node) {
  const colors = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.land;
  const createGeometry = TYPE_GEOMETRIES[node.type] || TYPE_GEOMETRIES.fact;

  // Main mesh with emissive glow
  const geometry = createGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: colors.main,
    emissive: colors.main,
    emissiveIntensity: 0.3,
    metalness: 0.4,
    roughness: 0.5,
    transparent: true,
    opacity: 0.9,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Glow shell
  const glowGeometry = createGeometry();
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: colors.glow,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.scale.setScalar(1.6);
  mesh.add(glowMesh);

  // Store node data for raycasting
  mesh.userData = {
    nodeId: node.id,
    nodeData: node,
    baseEmissiveIntensity: 0.3,
    isHovered: false,
    isSelected: false,
    glowMesh: glowMesh,
  };

  return mesh;
}

export function createNodeLabel(node) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const text = node.label;
  const fontSize = 24;
  const padding = 20;
  const canvasHeight = 40;

  // Measure text width first
  ctx.font = `${fontSize}px 'Space Mono', monospace`;
  const textWidth = ctx.measureText(text).width;
  const canvasWidth = Math.max(128, Math.ceil(textWidth + padding * 2));

  // Power-of-two friendly (better GPU performance)
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Re-set font after canvas resize
  ctx.font = `${fontSize}px 'Space Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Text shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillText(text, canvas.width / 2 + 1, canvas.height / 2 + 1);

  // Actual text
  const colors = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.land;
  const colorHex = '#' + new THREE.Color(colors.main).getHexString();
  ctx.fillStyle = colorHex;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  // Scale proportionally to text length
  const aspect = canvasWidth / canvasHeight;
  const spriteHeight = 0.55;
  sprite.scale.set(aspect * spriteHeight, spriteHeight, 1);
  sprite.position.y = 0.75;

  sprite.userData = { isLabel: true, nodeId: node.id };

  return sprite;
}

export function setNodeHovered(mesh, hovered) {
  if (!mesh.userData) return;
  mesh.userData.isHovered = hovered;
  const intensity = hovered ? 0.8 : (mesh.userData.isSelected ? 0.6 : 0.3);
  mesh.material.emissiveIntensity = intensity;
  mesh.userData.glowMesh.material.opacity = hovered ? 0.2 : (mesh.userData.isSelected ? 0.15 : 0.08);
  const scale = hovered ? 1.15 : (mesh.userData.isSelected ? 1.1 : 1.0);
  mesh.scale.setScalar(scale);
}

export function setNodeSelected(mesh, selected) {
  if (!mesh.userData) return;
  mesh.userData.isSelected = selected;
  const intensity = selected ? 0.6 : 0.3;
  mesh.material.emissiveIntensity = intensity;
  mesh.userData.glowMesh.material.opacity = selected ? 0.15 : 0.08;
  const scale = selected ? 1.1 : 1.0;
  mesh.scale.setScalar(scale);
}

export function setNodeDimmed(mesh, dimmed) {
  if (!mesh.userData) return;
  if (dimmed) {
    mesh.material.opacity = 0.2;
    mesh.material.emissiveIntensity = 0.05;
    mesh.userData.glowMesh.material.opacity = 0.02;
  } else {
    mesh.material.opacity = 0.9;
    mesh.material.emissiveIntensity = mesh.userData.isSelected ? 0.6 : 0.3;
    mesh.userData.glowMesh.material.opacity = mesh.userData.isSelected ? 0.15 : 0.08;
  }
}
