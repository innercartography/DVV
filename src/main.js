import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GraphRenderer } from './graph/GraphRenderer.js';
import { XRLayerStateMachine, XR_STATES } from './xr/XRLayerStateMachine.js';
import { VRWorldLoader } from './xr/VRWorldLoader.js';
import { HandTrackingVisualizer } from './xr/HandTrackingVisualizer.js';
import { XRControllerManager } from './xr/XRControllerManager.js';
import { XRHandInput } from './xr/XRHandInput.js';
import { XRLocomotion } from './xr/XRLocomotion.js';

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
renderer.xr.enabled = true;

const scene = new THREE.Scene();

// Fog for depth (saved so we can disable in XR)
const sceneFog = new THREE.FogExp2(0x060810, 0.012);
scene.fog = sceneFog;

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
let graphData = null;
async function init() {
  const response = await fetch('/data/dvv-graph.json');
  graphData = await response.json();
  graphRenderer.loadData(graphData);
}

init();

// ============================================================
// XR GRAPH RIG — scales graph to tabletop size in XR
// ============================================================
const XR_GRAPH_SCALE = 0.05; // 24m graph → ~1.2m across
const XR_GRAPH_POS = new THREE.Vector3(0, 1.0, -1.5); // chest height, arm's length

const xrGraphRig = new THREE.Group();
xrGraphRig.name = 'xr-graph-rig';
xrGraphRig.scale.setScalar(XR_GRAPH_SCALE);
xrGraphRig.position.copy(XR_GRAPH_POS);
scene.add(xrGraphRig);
xrGraphRig.visible = false; // only during XR

let xrGraphActive = false;

function enterXRGraphRig() {
  if (xrGraphActive) return;
  xrGraphActive = true;

  // Reparent graph groups into the scaled rig
  xrGraphRig.add(graphRenderer.nodeGroup);
  xrGraphRig.add(graphRenderer.labelGroup);
  xrGraphRig.add(graphRenderer.edgeRenderer.edgeGroup);

  xrGraphRig.visible = true;
  xrGraphRig.scale.setScalar(XR_GRAPH_SCALE);
  xrGraphRig.position.copy(XR_GRAPH_POS);
  xrGraphRig.rotation.set(0, 0, 0);

  console.log('Graph reparented into XR rig (scale:', XR_GRAPH_SCALE, ')');
}

function exitXRGraphRig() {
  if (!xrGraphActive) return;
  xrGraphActive = false;

  // Reparent back to scene root
  scene.add(graphRenderer.nodeGroup);
  scene.add(graphRenderer.labelGroup);
  scene.add(graphRenderer.edgeRenderer.edgeGroup);

  xrGraphRig.visible = false;

  console.log('Graph restored from XR rig to scene root');
}

// ============================================================
// XR HELPERS — test sphere and bright light for XR visibility
// ============================================================
const xrTestSphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
    roughness: 0.3,
  })
);
xrTestSphere.position.set(0, 0, -2);
xrTestSphere.visible = false;
xrTestSphere.name = 'xr-test-sphere';
scene.add(xrTestSphere);

const xrAmbientLight = new THREE.AmbientLight(0xffffff, 1.5);
xrAmbientLight.visible = false;
scene.add(xrAmbientLight);

// ============================================================
// XR LAYER STATE MACHINE
// ============================================================
const stateMachine = new XRLayerStateMachine(renderer);
const videoEl = document.getElementById('xr-video');
const vrWorldLoader = new VRWorldLoader(scene, videoEl);
const handTracker = new HandTrackingVisualizer(scene);

// XR Input modules
const controllerManager = new XRControllerManager(renderer, scene);
const handInput = new XRHandInput();

// Dolly for XR locomotion
const xrDolly = new THREE.Group();
xrDolly.name = 'xr-dolly';
scene.add(xrDolly);
const locomotion = new XRLocomotion(xrDolly);

// ---- Helper: find node data by ID ----
function getNodeData(nodeId) {
  if (!graphData) return null;
  return graphData.nodes.find(n => n.id === nodeId) || null;
}

// ---- Helper: check if node is an XR portal ----
function getXRMeta(nodeId) {
  const node = getNodeData(nodeId);
  if (!node?.metadata?.xr) return null;
  return { ...node.metadata.xr, node };
}

// ---- Controller select → raycast graph nodes or enter VR portal ----
const xrRaycaster = new THREE.Raycaster();
function handleXRSelect(nodeId) {
  const xrMeta = getXRMeta(nodeId);
  if (xrMeta && stateMachine.state === XR_STATES.AR_HOME) {
    // This node is a portal — enter VR world
    console.log(`Portal node selected: ${nodeId}, entering VR world`);
    stateMachine.enterVRWorld(xrMeta.node);
  } else {
    graphRenderer.selectNode(nodeId);
  }
}

controllerManager.onSelect((controller) => {
  const meshes = graphRenderer.getNodeMeshes();
  const hits = controllerManager.raycastFrom(controller, meshes);
  if (hits.length > 0) {
    handleXRSelect(hits[0].object.userData.nodeId);
  } else {
    // Empty space — deselect
    graphRenderer.selectNode(null);
  }
});

handInput.onSelect((handedness, pinchPoint) => {
  const meshes = graphRenderer.getNodeMeshes();
  xrRaycaster.set(pinchPoint, new THREE.Vector3(0, 0, -1));
  const hits = xrRaycaster.intersectObjects(meshes, false);
  if (hits.length > 0) {
    handleXRSelect(hits[0].object.userData.nodeId);
  } else {
    // Empty space — deselect
    graphRenderer.selectNode(null);
  }
});

// ---- Exit gestures ----
// Single fist: exit to desktop
controllerManager.onExit(() => stateMachine.exitToDesktop());
handInput.onExit(() => stateMachine.exitToDesktop());

// Double-fist 2s hold: exit VR → restart AR
handInput.onDoubleFistExit(() => {
  if (stateMachine.state === XR_STATES.VR_WORLD) {
    console.log('Double-fist exit: VR → AR');
    vrWorldLoader.dispose();
    stateMachine.exitToAR();
  }
});

// ---- UI buttons ----
const btnAR = document.getElementById('btn-enter-ar');
const btnVR = document.getElementById('btn-enter-vr');
const xrStatus = document.getElementById('xr-status');

if (!navigator.xr) {
  document.getElementById('xr-buttons')?.classList.add('hidden');
} else {
  navigator.xr.isSessionSupported('immersive-ar').then(s => {
    if (!s && btnAR) btnAR.classList.add('unsupported');
  }).catch(() => {});
  navigator.xr.isSessionSupported('immersive-vr').then(s => {
    if (!s && btnVR) btnVR.classList.add('unsupported');
  }).catch(() => {});
}

if (btnAR) btnAR.addEventListener('click', () => stateMachine.enterARHome());
if (btnVR) btnVR.addEventListener('click', () => stateMachine.enterVRDirect());

const xrHideEls = [
  document.getElementById('topology-selector'),
  document.getElementById('category-legend'),
  document.getElementById('title-overlay'),
  // detail-panel stays visible in XR for node info
];

// ---- State change handler ----
stateMachine.on('stateChange', ({ state, node }) => {
  console.log(`State → ${state}`);

  switch (state) {
    case XR_STATES.AR_HOME:
      // AR mode: show graph in rig, hide fog, boost lights
      scene.fog = null;
      xrTestSphere.visible = false;
      xrAmbientLight.visible = true;
      ambientLight.intensity = 2.0;
      dirLight.intensity = 1.5;
      xrHideEls.forEach(el => el?.classList.add('xr-hidden'));
      controls.enabled = false;
      locomotion.reset();
      vrWorldLoader.dispose();
      enterXRGraphRig();
      graphRenderer.nodeGroup.visible = true;
      graphRenderer.labelGroup.visible = true;
      if (btnAR) btnAR.textContent = 'Exit AR';
      if (btnVR) btnVR.textContent = 'Enter VR';
      break;

    case XR_STATES.VR_TRANSITION:
      // Video playing, splat loading
      if (btnAR) btnAR.textContent = 'Enter AR';
      graphRenderer.nodeGroup.visible = false;
      graphRenderer.labelGroup.visible = false;

      // Start the VR world load sequence
      const xrMeta = node?.metadata?.xr || {};
      vrWorldLoader.load(xrMeta, () => {
        stateMachine.startVRSession();
      });
      break;

    case XR_STATES.VR_WORLD:
      // VR mode: locomotion active, lights boosted
      scene.fog = null;
      xrAmbientLight.visible = true;
      ambientLight.intensity = 2.0;
      dirLight.intensity = 1.5;
      xrHideEls.forEach(el => el?.classList.add('xr-hidden'));
      controls.enabled = false;
      locomotion.reset();

      // If entered via portal (splat loaded), hide graph.
      if (vrWorldLoader.splatMesh || node) {
        exitXRGraphRig();
        graphRenderer.nodeGroup.visible = false;
        graphRenderer.labelGroup.visible = false;
        xrTestSphere.visible = false;
      } else {
        // Direct VR entry — show graph in rig
        enterXRGraphRig();
        graphRenderer.nodeGroup.visible = true;
        graphRenderer.labelGroup.visible = true;
        xrTestSphere.visible = false;
      }
      if (btnVR) btnVR.textContent = 'Exit VR';
      break;

    case XR_STATES.DESKTOP:
    default:
      // Desktop: restore everything
      exitXRGraphRig();
      scene.fog = sceneFog;
      xrTestSphere.visible = false;
      xrAmbientLight.visible = false;
      ambientLight.intensity = 0.8;
      dirLight.intensity = 0.6;
      renderer.setClearColor(0x060810, 1);
      xrHideEls.forEach(el => el?.classList.remove('xr-hidden'));
      controls.enabled = true;
      locomotion.reset();
      vrWorldLoader.dispose();
      graphRenderer.nodeGroup.visible = true;
      graphRenderer.labelGroup.visible = true;
      if (btnAR) btnAR.textContent = 'Enter AR';
      if (btnVR) btnVR.textContent = 'Enter VR';
      break;
  }
});

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
// ANIMATION LOOP (using setAnimationLoop for WebXR compatibility)
// ============================================================
const clock = new THREE.Clock();

function animate(timestamp, frame) {
  const deltaTime = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Only update orbit controls when not in XR
  if (!renderer.xr.isPresenting) {
    controls.update();
  }

  graphRenderer.update(deltaTime);

  // ---- XR Input Updates ----
  if (renderer.xr.isPresenting) {
    // Hand tracking visuals + pinch/fist detection
    handTracker.update(frame, renderer);
    const handData = handInput.update(frame, renderer);

    // Controller updates (menu button polling, ray visibility)
    controllerManager.update();

    // ---- XR Rig Manipulation (instead of locomotion) ----
    if (xrGraphActive) {
      // Right thumbstick: rotate the graph rig
      const rightStick = controllerManager.getThumbstick(1);
      if (Math.abs(rightStick.x) > 0.15) {
        xrGraphRig.rotation.y -= rightStick.x * 1.5 * deltaTime;
      }
      if (Math.abs(rightStick.y) > 0.15) {
        xrGraphRig.rotation.x += rightStick.y * 1.0 * deltaTime;
        xrGraphRig.rotation.x = Math.max(-1.2, Math.min(1.2, xrGraphRig.rotation.x));
      }

      // Left thumbstick Y: zoom (scale) the graph rig
      const leftStick = controllerManager.getThumbstick(0);
      if (Math.abs(leftStick.y) > 0.15) {
        const scaleDelta = -leftStick.y * 0.06 * deltaTime;
        const newScale = Math.max(0.01, Math.min(0.3, xrGraphRig.scale.x + scaleDelta));
        xrGraphRig.scale.setScalar(newScale);
      }
      // Left thumbstick X: slide rig left/right
      if (Math.abs(leftStick.x) > 0.15) {
        xrGraphRig.position.x += leftStick.x * 0.5 * deltaTime;
      }

      // Hand zoom: two-hand spread scales the rig
      const spread = handInput.getHandSpread(frame, renderer);
      if (spread !== null) {
        if (locomotion.previousSpread !== null) {
          const delta = spread - locomotion.previousSpread;
          if (Math.abs(delta) > 0.001) {
            const scaleDelta = delta * 0.3;
            const newScale = Math.max(0.01, Math.min(0.3, xrGraphRig.scale.x + scaleDelta));
            xrGraphRig.scale.setScalar(newScale);
          }
        }
        locomotion.previousSpread = spread;
      } else {
        locomotion.previousSpread = null;
      }
    } else {
      // Not in rig mode — use dolly locomotion (for VR world/splat)
      locomotion.updateControllers(controllerManager, deltaTime);
      const spread = handInput.getHandSpread(frame, renderer);
      locomotion.updateHandZoom(spread, deltaTime);
    }
  } else {
    // Non-XR: still update hand tracker (hides visuals)
    handTracker.update(frame, renderer);
  }

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

renderer.setAnimationLoop(animate);
