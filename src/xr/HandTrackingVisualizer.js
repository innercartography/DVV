import * as THREE from 'three';

/**
 * Renders small sphere indicators at index-finger-tip and thumb-tip
 * positions for both hands using the WebXR Hand Input API.
 */

const JOINT_NAMES = ['index-finger-tip', 'thumb-tip'];

const COLORS = {
  left:  0x00ffc8, // cyan
  right: 0xd4a853, // gold
};

export class HandTrackingVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.spheres = new Map(); // key → mesh

    // Pre-create 4 spheres (2 joints × 2 hands)
    const geometry = new THREE.SphereGeometry(0.012, 16, 16);

    ['left', 'right'].forEach(handedness => {
      JOINT_NAMES.forEach(joint => {
        const material = new THREE.MeshBasicMaterial({
          color: COLORS[handedness],
          transparent: true,
          opacity: 0.9,
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.visible = false;
        sphere.name = `hand-${handedness}-${joint}`;
        this.scene.add(sphere);
        this.spheres.set(`${handedness}-${joint}`, sphere);
      });
    });

    // Add glow point lights near each hand (very subtle)
    this.handLights = {};
    ['left', 'right'].forEach(handedness => {
      const light = new THREE.PointLight(COLORS[handedness], 0.3, 0.5);
      light.visible = false;
      this.scene.add(light);
      this.handLights[handedness] = light;
    });
  }

  /**
   * Call every frame from renderer.setAnimationLoop callback.
   * @param {XRFrame|null} frame - the XR frame, or null when not in XR
   * @param {THREE.WebGLRenderer} renderer
   */
  update(frame, renderer) {
    // Hide everything when not in XR
    if (!frame || !renderer.xr.isPresenting) {
      this.spheres.forEach(s => { s.visible = false; });
      Object.values(this.handLights).forEach(l => { l.visible = false; });
      return;
    }

    const session = renderer.xr.getSession();
    if (!session) return;

    const refSpace = renderer.xr.getReferenceSpace();

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand) continue;

      const handedness = inputSource.handedness; // 'left' | 'right'
      if (handedness !== 'left' && handedness !== 'right') continue;

      let anyVisible = false;

      for (const jointName of JOINT_NAMES) {
        const key = `${handedness}-${jointName}`;
        const sphere = this.spheres.get(key);
        if (!sphere) continue;

        const joint = inputSource.hand.get(jointName);
        if (!joint) {
          sphere.visible = false;
          continue;
        }

        try {
          const pose = frame.getJointPose(joint, refSpace);
          if (pose) {
            const p = pose.transform.position;
            sphere.position.set(p.x, p.y, p.z);
            sphere.visible = true;
            anyVisible = true;

            // Scale sphere based on joint radius if available
            if (pose.radius) {
              const s = pose.radius * 2;
              sphere.scale.setScalar(Math.max(s, 0.01) / 0.012);
            }
          } else {
            sphere.visible = false;
          }
        } catch {
          sphere.visible = false;
        }
      }

      // Position hand light near index finger tip
      const light = this.handLights[handedness];
      if (light) {
        const indexSphere = this.spheres.get(`${handedness}-index-finger-tip`);
        if (indexSphere && indexSphere.visible) {
          light.position.copy(indexSphere.position);
          light.visible = true;
        } else {
          light.visible = false;
        }
      }
    }
  }

  dispose() {
    this.spheres.forEach(s => {
      s.geometry.dispose();
      s.material.dispose();
      this.scene.remove(s);
    });
    Object.values(this.handLights).forEach(l => this.scene.remove(l));
  }
}
