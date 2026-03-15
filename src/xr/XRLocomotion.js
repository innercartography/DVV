import * as THREE from 'three';

/**
 * XR Locomotion
 *
 * Controller-based:
 *  - Right thumbstick: smooth locomotion in the controller's pointing direction
 *  - Left thumbstick: snap/smooth rotation of the user rig
 *
 * Hand-based:
 *  - Two hands spreading apart: zoom out (move rig backward)
 *  - Two hands moving together: zoom in (move rig forward)
 *
 * Locomotion works by translating/rotating the XR camera rig (base reference space offset).
 * Since Three.js WebXR uses a camera rig group internally, we manipulate a user-space
 * Group that contains the entire scene — or we use the offsetTransform approach.
 *
 * Practical approach: we move a "dolly" Group, and parent the camera to it.
 */

const MOVE_SPEED     = 3.0;   // meters per second
const ROTATE_SPEED   = 1.5;   // radians per second
const DEADZONE       = 0.15;  // thumbstick deadzone
const ZOOM_SPEED     = 4.0;   // zoom meters per second per meter of spread change

const _moveDir = new THREE.Vector3();
const _forward = new THREE.Vector3();

export class XRLocomotion {
  constructor(dolly) {
    /**
     * The dolly is a THREE.Group that the XR camera rig is parented to.
     * Moving the dolly moves the user through the scene.
     */
    this.dolly = dolly;

    // Hand zoom state
    this.previousSpread = null;
  }

  /**
   * Controller-based locomotion.
   * @param {Object} controllerManager - XRControllerManager instance
   * @param {number} deltaTime
   */
  updateControllers(controllerManager, deltaTime) {
    if (!controllerManager) return;

    // ---- RIGHT THUMBSTICK: MOVEMENT ----
    const rightStick = controllerManager.getThumbstick(1);
    if (Math.abs(rightStick.x) > DEADZONE || Math.abs(rightStick.y) > DEADZONE) {
      // Get direction from right controller
      const dir = controllerManager.getControllerDirection(1);

      // Project onto horizontal plane for comfortable locomotion
      _forward.set(dir.x, 0, dir.z).normalize();

      // Strafe direction (perpendicular)
      const right = new THREE.Vector3().crossVectors(
        new THREE.Vector3(0, 1, 0), _forward
      ).normalize();

      _moveDir.set(0, 0, 0);

      // Forward/backward (thumbstick Y is inverted: push forward = negative Y)
      if (Math.abs(rightStick.y) > DEADZONE) {
        _moveDir.addScaledVector(_forward, -rightStick.y * MOVE_SPEED * deltaTime);
      }

      // Strafe left/right
      if (Math.abs(rightStick.x) > DEADZONE) {
        _moveDir.addScaledVector(right, rightStick.x * MOVE_SPEED * deltaTime);
      }

      this.dolly.position.add(_moveDir);
    }

    // ---- LEFT THUMBSTICK: ROTATION ----
    const leftStick = controllerManager.getThumbstick(0);
    if (Math.abs(leftStick.x) > DEADZONE) {
      this.dolly.rotation.y -= leftStick.x * ROTATE_SPEED * deltaTime;
    }
  }

  /**
   * Hand-based zoom: spread = zoom out, pinch = zoom in.
   * @param {number|null} currentSpread - distance between wrists in meters
   * @param {number} deltaTime
   */
  updateHandZoom(currentSpread, deltaTime) {
    if (currentSpread === null) {
      this.previousSpread = null;
      return;
    }

    if (this.previousSpread !== null) {
      const delta = currentSpread - this.previousSpread;

      // Only move if the change is significant (> 1mm per frame)
      if (Math.abs(delta) > 0.001) {
        // Spread apart → zoom out → move dolly backward along camera forward
        // Come together → zoom in → move dolly forward
        const camera = this.dolly.children[0]; // XR camera rig
        if (camera) {
          _forward.set(0, 0, -1).applyQuaternion(this.dolly.quaternion);
          _forward.y = 0;
          _forward.normalize();

          // Negative delta (hands coming together) = zoom in (move forward)
          this.dolly.position.addScaledVector(_forward, -delta * ZOOM_SPEED);
        }
      }
    }

    this.previousSpread = currentSpread;
  }

  /**
   * Reset dolly to origin.
   */
  reset() {
    this.dolly.position.set(0, 0, 0);
    this.dolly.rotation.set(0, 0, 0);
    this.previousSpread = null;
  }
}
