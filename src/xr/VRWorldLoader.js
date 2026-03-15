import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

/**
 * VR World Loader
 *
 * Handles the transition sequence:
 * 1. Play establishing video (fullscreen, 10-15s max)
 * 2. Load SplatMesh from .spz URL via SparkJS
 * 3. Signal ready for VR session entry
 */

export class VRWorldLoader {
  constructor(scene, videoElement) {
    this.scene = scene;
    this.videoElement = videoElement;
    this.splatMesh = null;
    this._videoTimeout = null;
  }

  /**
   * Execute the full transition: video → splat load → ready callback.
   *
   * @param {Object} xrMeta - { videoUrl, splatUrl }
   * @param {Function} onReady - called when transition is complete and VR can start
   */
  async load(xrMeta, onReady) {
    const { videoUrl, splatUrl } = xrMeta || {};

    // ---- Step 1: Play establishing shot video ----
    if (videoUrl) {
      try {
        await this._playVideo(videoUrl);
      } catch (e) {
        console.warn('Video playback failed or skipped:', e);
      }
    } else {
      console.log('No video URL, skipping establishing shot');
      // Brief pause to let AR session fully end
      await new Promise(r => setTimeout(r, 1000));
    }

    // ---- Step 2: Load SplatMesh ----
    if (splatUrl) {
      try {
        await this._loadSplat(splatUrl);
      } catch (e) {
        console.warn('Splat load failed:', e);
        // Create a fallback visible object so VR isn't empty
        this._createFallbackWorld();
      }
    } else {
      console.log('No splat URL, creating fallback world');
      this._createFallbackWorld();
    }

    // ---- Step 3: Signal ready ----
    console.log('VR world loaded, ready for immersive session');
    if (onReady) onReady();
  }

  _playVideo(url) {
    return new Promise((resolve, reject) => {
      const video = this.videoElement;
      if (!video) {
        resolve();
        return;
      }

      video.src = url;
      video.style.display = 'block';
      video.style.position = 'fixed';
      video.style.top = '0';
      video.style.left = '0';
      video.style.width = '100vw';
      video.style.height = '100vh';
      video.style.objectFit = 'cover';
      video.style.zIndex = '9999';
      video.style.background = '#000';
      video.muted = false;
      video.playsInline = true;

      const cleanup = () => {
        clearTimeout(this._videoTimeout);
        video.style.display = 'none';
        video.pause();
        video.src = '';
        resolve();
      };

      // Max duration: 15 seconds
      this._videoTimeout = setTimeout(cleanup, 15000);

      video.onended = cleanup;
      video.onerror = () => {
        console.warn('Video error, skipping');
        cleanup();
      };

      video.play().catch(() => {
        console.warn('Video autoplay blocked, skipping');
        cleanup();
      });
    });
  }

  async _loadSplat(url) {
    console.log(`Loading splat from: ${url}`);

    return new Promise((resolve, reject) => {
      try {
        this.splatMesh = new SplatMesh({
          url: url,
          onLoad: (mesh) => {
            console.log('SplatMesh loaded successfully');
            this.scene.add(mesh);
            resolve();
          },
        });

        // If the constructor adds to scene before onLoad, scene.add is idempotent
        // Timeout fallback in case onLoad never fires (bad URL)
        setTimeout(() => {
          if (this.splatMesh) {
            this.scene.add(this.splatMesh);
          }
          resolve();
        }, 10000);
      } catch (e) {
        console.error('SplatMesh constructor error:', e);
        reject(e);
      }
    });
  }

  /**
   * Create a fallback visible environment when no splat is available.
   * Uses simple geometry so the VR session isn't empty.
   */
  _createFallbackWorld() {

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.name = 'vr-fallback-ground';
    this.scene.add(ground);

    // A few floating orbs to orient the user
    const orbGeo = new THREE.SphereGeometry(0.3, 32, 32);
    const colors = [0x00ffc8, 0xd4a853, 0xaa66ff, 0x88ff44];
    const positions = [
      [0, 1, -3],
      [-2, 1.5, -2],
      [2, 0.8, -4],
      [0, 2, -5],
    ];
    positions.forEach((pos, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i],
        emissive: colors[i],
        emissiveIntensity: 0.4,
        roughness: 0.2,
      });
      const orb = new THREE.Mesh(orbGeo, mat);
      orb.position.set(...pos);
      orb.name = `vr-fallback-orb-${i}`;
      this.scene.add(orb);
    });

    console.log('Fallback VR world created');
  }

  /**
   * Remove the splat mesh and any fallback objects from the scene.
   */
  dispose() {
    if (this.splatMesh) {
      this.scene.remove(this.splatMesh);
      if (typeof this.splatMesh.dispose === 'function') {
        this.splatMesh.dispose();
      }
      this.splatMesh = null;
    }

    // Remove fallback objects
    const toRemove = [];
    this.scene.traverse(child => {
      if (child.name && child.name.startsWith('vr-fallback-')) {
        toRemove.push(child);
      }
    });
    toRemove.forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    // Clean up video
    if (this.videoElement) {
      this.videoElement.style.display = 'none';
      this.videoElement.pause();
      this.videoElement.src = '';
    }

    clearTimeout(this._videoTimeout);
  }
}
