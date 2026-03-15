import * as THREE from 'three';

/**
 * Manages WebXR session entry/exit for AR and VR modes.
 */
export class XRSessionManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.currentSession = null;
    this.onSessionStartCallbacks = [];
    this.onSessionEndCallbacks = [];
  }

  onSessionStart(cb) { this.onSessionStartCallbacks.push(cb); }
  onSessionEnd(cb)   { this.onSessionEndCallbacks.push(cb); }

  async enterAR() {
    if (this.currentSession) {
      await this.currentSession.end();
      return;
    }

    if (!navigator.xr) {
      console.warn('WebXR not available');
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        optionalFeatures: ['hit-test', 'anchors', 'hand-tracking'],
      });
      this._onSessionStarted(session, 'ar');
    } catch (e) {
      console.error('Failed to start AR session:', e);
    }
  }

  async enterVR() {
    if (this.currentSession) {
      await this.currentSession.end();
      return;
    }

    if (!navigator.xr) {
      console.warn('WebXR not available');
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['hand-tracking'],
      });
      this._onSessionStarted(session, 'vr');
    } catch (e) {
      console.error('Failed to start VR session:', e);
    }
  }

  _onSessionStarted(session, mode) {
    this.currentSession = session;

    this.renderer.xr.setReferenceSpaceType('local');
    this.renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      this.currentSession = null;
      this.onSessionEndCallbacks.forEach(cb => cb(mode));
    });

    this.onSessionStartCallbacks.forEach(cb => cb(mode));
  }

  get isPresenting() {
    return this.renderer.xr.isPresenting;
  }
}
