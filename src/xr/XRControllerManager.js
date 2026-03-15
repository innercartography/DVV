import * as THREE from 'three';

/**
 * XR Controller Manager
 * - Reads left/right controllers via renderer.xr.getController()
 * - Renders visible ray lines from each controller
 * - Fires select callbacks on trigger (selectstart/selectend)
 * - Fires exit callback on menu button (squeezestart or gamepad menu)
 */

const RAY_LENGTH = 10;

export class XRControllerManager {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.controllers = [];
    this.rayLines = [];
    this.selectCallbacks = [];
    this.exitCallbacks = [];
    this.raycaster = new THREE.Raycaster();

    // Store grip references to read gamepad
    this.controllerGrips = [];

    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      controller.userData.index = i;
      controller.userData.isSelecting = false;

      // Ray visual — thin glowing line
      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -RAY_LENGTH),
      ]);
      const rayColor = i === 0 ? 0x00ffc8 : 0xd4a853; // cyan / gold
      const rayMaterial = new THREE.LineBasicMaterial({
        color: rayColor,
        transparent: true,
        opacity: 0.6,
        linewidth: 1,
      });
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      ray.name = `controller-ray-${i}`;
      ray.visible = false;
      controller.add(ray);

      // Small dot at controller origin
      const dotGeo = new THREE.SphereGeometry(0.008, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color: rayColor });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.name = `controller-dot-${i}`;
      controller.add(dot);

      // Select events (trigger)
      controller.addEventListener('selectstart', () => {
        controller.userData.isSelecting = true;
        ray.material.opacity = 1.0;
        this._onSelect(controller);
      });

      controller.addEventListener('selectend', () => {
        controller.userData.isSelecting = false;
        ray.material.opacity = 0.6;
      });

      // Squeeze events — used as menu/exit on some controllers
      controller.addEventListener('squeezestart', () => {
        this._onMenuPress(i);
      });

      // Connected/disconnected
      controller.addEventListener('connected', (event) => {
        controller.userData.inputSource = event.data;
        ray.visible = event.data.targetRayMode === 'tracked-pointer';
        console.log(`Controller ${i} connected: ${event.data.handedness} (${event.data.targetRayMode})`);
      });

      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
        ray.visible = false;
      });

      scene.add(controller);
      this.controllers.push(controller);
      this.rayLines.push(ray);

      // Also get controller grip for gamepad access
      const grip = renderer.xr.getControllerGrip(i);
      scene.add(grip);
      this.controllerGrips.push(grip);
    }
  }

  onSelect(cb) { this.selectCallbacks.push(cb); }
  onExit(cb)   { this.exitCallbacks.push(cb); }

  _onSelect(controller) {
    this.selectCallbacks.forEach(cb => cb(controller));
  }

  _onMenuPress(controllerIndex) {
    console.log(`Menu/squeeze on controller ${controllerIndex}`);
    this.exitCallbacks.forEach(cb => cb(controllerIndex));
  }

  /**
   * Raycast from a controller into the scene and return intersections.
   */
  raycastFrom(controller, objects) {
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return this.raycaster.intersectObjects(objects, false);
  }

  /**
   * Read gamepad axes for a controller.
   * Returns { x, y } for thumbstick or { x: 0, y: 0 } if unavailable.
   */
  getThumbstick(controllerIndex) {
    const controller = this.controllers[controllerIndex];
    if (!controller) return { x: 0, y: 0 };

    const source = controller.userData.inputSource;
    if (!source || !source.gamepad) return { x: 0, y: 0 };

    const gp = source.gamepad;
    // Standard mapping: axes[2] = thumbstick X, axes[3] = thumbstick Y
    // Some controllers use axes[0], axes[1] for the primary thumbstick
    if (gp.axes.length >= 4) {
      return { x: gp.axes[2], y: gp.axes[3] };
    } else if (gp.axes.length >= 2) {
      return { x: gp.axes[0], y: gp.axes[1] };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Check if menu button is pressed on a controller gamepad.
   */
  isMenuPressed(controllerIndex) {
    const controller = this.controllers[controllerIndex];
    if (!controller) return false;

    const source = controller.userData.inputSource;
    if (!source || !source.gamepad) return false;

    const gp = source.gamepad;
    // Button index varies by controller. Common: button[3] or button[2] is menu
    // Pico 4: button[3] = menu
    for (let i = 2; i < gp.buttons.length; i++) {
      if (i === 2 || i === 3) { // likely menu/system buttons
        if (gp.buttons[i] && gp.buttons[i].pressed) return true;
      }
    }
    return false;
  }

  /**
   * Called each frame to check gamepad-based menu presses.
   */
  update() {
    if (!this.renderer.xr.isPresenting) return;

    for (let i = 0; i < 2; i++) {
      if (this.isMenuPressed(i)) {
        // Debounce — don't fire every frame
        if (!this.controllers[i].userData._menuFired) {
          this.controllers[i].userData._menuFired = true;
          this._onMenuPress(i);
        }
      } else {
        this.controllers[i].userData._menuFired = false;
      }
    }
  }

  /**
   * Get the controller direction vector (pointing direction).
   */
  getControllerDirection(controllerIndex) {
    const controller = this.controllers[controllerIndex];
    if (!controller) return new THREE.Vector3(0, 0, -1);

    const dir = new THREE.Vector3(0, 0, -1);
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    dir.applyMatrix4(tempMatrix);
    return dir;
  }

  dispose() {
    this.controllers.forEach(c => this.scene.remove(c));
    this.controllerGrips.forEach(g => this.scene.remove(g));
  }
}
