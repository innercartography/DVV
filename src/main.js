import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GraphRenderer } from './graph/GraphRenderer.js';

/**
 * DVV Spatial Knowledge Graph — Main Entry
 */

// ============================================================
// SCENE SETUP
// ============================================================
const canvas = document.getElementById('graph-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x060810, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();

// Fog for depth
scene.fog = new THREE.FogExp2(0x060810, 0.012);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8, 22);
camera.lookAt(0, 0, 0);

// ============================================================
// CONTROLS
// ============================================================
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.8;
controls.minDistance = 5;
controls.maxDistance = 50;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.enablePan = true;
controls.target.set(0, 0, 0);

// Stop auto-rotate on user interaction
let idleTimer = null;
canvas.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
  clearTimeout(idleTimer);
});
canvas.addEventListener('pointerup', () => {
  idleTimer = setTimeout(() => {
    controls.autoRotate = true;
  }, 8000);
});

// ============================================================
// LIGHTING
// ============================================================
const ambientLight = new THREE.AmbientLight(0x334455, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xc0dde8, 0.6);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);

const pointLight1 = new THREE.PointLight(0x00ffc8, 1, 40);
pointLight1.position.set(-8, 5, -8);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xaa66ff, 0.6, 40);
pointLight2.position.set(8, -3, 8);
scene.add(pointLight2);

const pointLight3 = new THREE.PointLight(0x88ff44, 0.4, 40);
pointLight3.position.set(0, 10, -5);
scene.add(pointLight3);

// ============================================================
// AMBIENT PARTICLES
// ============================================================
function createParticleField() {
  const count = 600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const colorPalette = [
    new THREE.Color(0x00ffc8),
    new THREE.Color(0x88ff44),
    new THREE.Color(0xaa66ff),
    new THREE.Color(0xd4a853),
    new THREE.Color(0x445566),
  ];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
}

const particleField = createParticleField();

// ============================================================
// GRAPH
// ============================================================
const graphRenderer = new GraphRenderer(scene);

// Load data
async function init() {
  const response = await fetch('/data/dvv-graph.json');
  const graphData = await response.json();
  graphRenderer.loadData(graphData);
}

init();

// ============================================================
// MR. HAPPY MASCOT
// ============================================================
let mrHappy = null;
const mascotLight = new THREE.PointLight(0xd4a853, 0.8, 12);
scene.add(mascotLight);

const gltfLoader = new GLTFLoader();
gltfLoader.load('/mr-happy.glb', (gltf) => {
  mrHappy = gltf.scene;

  // Auto-scale to fit nicely
  const box = new THREE.Box3().setFromObject(mrHappy);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const targetSize = 2.5;
  const scale = targetSize / maxDim;
  mrHappy.scale.setScalar(scale);

  // Position: lower-right, slightly behind graph
  mrHappy.position.set(14, -6, 8);

  // Add emissive glow to all meshes
  mrHappy.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone();
      child.material.emissive = new THREE.Color(0xd4a853);
      child.material.emissiveIntensity = 0.15;
    }
  });

  mrHappy.userData.isMascot = true;
  scene.add(mrHappy);

  // Position the warm light near mascot
  mascotLight.position.set(14, -4, 8);

  console.log('Mr. Happy loaded 🎉');
}, undefined, (err) => {
  console.warn('Could not load Mr. Happy:', err);
});

// ============================================================
// RAYCASTING (interaction)
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.params.Points = { threshold: 0.5 };
const mouse = new THREE.Vector2();

function onPointerMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = graphRenderer.getNodeMeshes();
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const nodeId = intersects[0].object.userData.nodeId;
    graphRenderer.hoverNode(nodeId);
  } else {
    graphRenderer.hoverNode(null);
  }
}

function onPointerClick(event) {
  if (event.detail === 0) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const meshes = graphRenderer.getNodeMeshes();
  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const nodeId = intersects[0].object.userData.nodeId;
    graphRenderer.selectNode(nodeId);
  } else {
    graphRenderer.selectNode(null);
  }
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('click', onPointerClick);

// ============================================================
// TOPOLOGY SELECTOR
// ============================================================
const topoButtons = document.querySelectorAll('.topo-btn');
topoButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const topology = btn.dataset.topology;
    topoButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    graphRenderer.setTopology(topology, true);
  });
});

// ============================================================
// DETAIL PANEL CLOSE
// ============================================================
document.getElementById('detail-close').addEventListener('click', () => {
  graphRenderer.selectNode(null);
});

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  controls.update();
  graphRenderer.update(deltaTime);

  // Animate ambient particles
  const positions = particleField.geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] += Math.sin(elapsed * 0.2 + i * 0.01) * 0.003;
    positions[i] += Math.cos(elapsed * 0.15 + i * 0.02) * 0.002;
  }
  particleField.geometry.attributes.position.needsUpdate = true;
  particleField.rotation.y = elapsed * 0.01;

  // Animate lights
  pointLight1.position.x = Math.sin(elapsed * 0.2) * 8;
  pointLight1.position.z = Math.cos(elapsed * 0.2) * 8;
  pointLight2.position.x = Math.cos(elapsed * 0.15) * 8;
  pointLight2.position.z = Math.sin(elapsed * 0.15) * 8;

  // Animate Mr. Happy — gentle bob + slow rotation
  if (mrHappy) {
    mrHappy.position.y = -6 + Math.sin(elapsed * 0.6) * 0.4;
    mrHappy.rotation.y = elapsed * 0.3;
    mascotLight.position.y = mrHappy.position.y + 2;
  }

  renderer.render(scene, camera);
}

animate();
