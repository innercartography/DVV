import * as THREE from 'three';

/**
 * XR Layer State Machine
 *
 * States: DESKTOP → AR_HOME → VR_TRANSITION → VR_WORLD
 *
 * Manages session lifecycle, scene visibility, and transitions
 * between the AR graph layer and VR world layer.
 */

export const XR_STATES = {
  DESKTOP: 'DESKTOP',
  AR_HOME: 'AR_HOME',
  VR_TRANSITION: 'VR_TRANSITION',
  VR_WORLD: 'VR_WORLD',
};

export class XRLayerStateMachine {
  constructor(renderer) {
    this.renderer = renderer;
    this.state = XR_STATES.DESKTOP;
    this.currentSession = null;
    this.listeners = {};
    this._pendingVRNode = null;
  }

  // ---- Event system ----
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // ---- State transitions ----

  /**
   * Enter AR Home layer — graph orbs in real space.
   */
  async enterARHome() {
    if (this.state !== XR_STATES.DESKTOP && this.state !== XR_STATES.VR_WORLD) {
      console.warn(`Cannot enter AR_HOME from state: ${this.state}`);
      return;
    }

    // End any existing session first
    if (this.currentSession) {
      try { await this.currentSession.end(); } catch (e) { /* ok */ }
      this.currentSession = null;
    }

    if (!navigator.xr) {
      console.warn('WebXR not available');
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local'],
        optionalFeatures: ['hit-test', 'anchors', 'hand-tracking', 'dom-overlay'],
        domOverlay: { root: document.body },
      });
      this._activateSession(session, XR_STATES.AR_HOME);
    } catch (e) {
      console.error('Failed to start AR session:', e);
    }
  }

  /**
   * Transition from AR → VR world via video + splat.
   * @param {Object} nodeData - graph node with xr metadata
   */
  async enterVRWorld(nodeData) {
    if (this.state !== XR_STATES.AR_HOME && this.state !== XR_STATES.DESKTOP) {
      console.warn(`Cannot enter VR from state: ${this.state}`);
      return;
    }

    this._pendingVRNode = nodeData;

    // End AR session first
    if (this.currentSession) {
      try { await this.currentSession.end(); } catch (e) { /* ok */ }
      this.currentSession = null;
    }

    // Transition state — video plays, splat loads
    this.state = XR_STATES.VR_TRANSITION;
    this._emit('stateChange', { state: XR_STATES.VR_TRANSITION, node: nodeData });

    console.log(`VR_TRANSITION: starting for node "${nodeData?.label || nodeData?.id}"`);
  }

  /**
   * Called by VRWorldLoader when video + splat are ready.
   * Starts the immersive-vr session.
   */
  async startVRSession() {
    if (this.state !== XR_STATES.VR_TRANSITION) {
      console.warn(`Cannot start VR session from state: ${this.state}`);
      return;
    }

    if (!navigator.xr) {
      console.warn('WebXR not available');
      this.exitToDesktop();
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['hand-tracking'],
      });
      this._activateSession(session, XR_STATES.VR_WORLD);
    } catch (e) {
      console.error('Failed to start VR session:', e);
      this.exitToDesktop();
    }
  }

  /**
   * Exit VR → restart AR home.
   */
  async exitToAR() {
    console.log('Exiting VR, returning to AR home');

    if (this.currentSession) {
      try { await this.currentSession.end(); } catch (e) { /* ok */ }
      this.currentSession = null;
    }

    this._pendingVRNode = null;

    // Small delay before restarting AR
    await new Promise(resolve => setTimeout(resolve, 500));

    this.state = XR_STATES.DESKTOP;
    this._emit('stateChange', { state: XR_STATES.DESKTOP });

    // Auto-restart AR
    await this.enterARHome();
  }

  /**
   * Exit to desktop (no XR session).
   */
  async exitToDesktop() {
    console.log('Exiting to desktop');

    if (this.currentSession) {
      try { await this.currentSession.end(); } catch (e) { /* ok */ }
      this.currentSession = null;
    }

    this._pendingVRNode = null;
    this.state = XR_STATES.DESKTOP;
    this._emit('stateChange', { state: XR_STATES.DESKTOP });
  }

  /**
   * Direct VR entry (fallback, no AR transition).
   */
  async enterVRDirect() {
    this._pendingVRNode = null; // no portal — keep graph visible

    if (this.currentSession) {
      try { await this.currentSession.end(); } catch (e) { /* ok */ }
      this.currentSession = null;
    }

    if (!navigator.xr) return;

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['hand-tracking'],
      });
      this._activateSession(session, XR_STATES.VR_WORLD);
    } catch (e) {
      console.error('Failed to start VR session:', e);
    }
  }

  // ---- Internal ----

  _activateSession(session, targetState) {
    this.currentSession = session;

    this.renderer.xr.setReferenceSpaceType('local');
    this.renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      const prevState = this.state;
      this.currentSession = null;

      // Only update state if we didn't already transition
      if (this.state === targetState) {
        this.state = XR_STATES.DESKTOP;
        this._emit('stateChange', { state: XR_STATES.DESKTOP, previousState: prevState });
      }
    });

    this.state = targetState;
    this._emit('stateChange', {
      state: targetState,
      node: this._pendingVRNode,
    });

    console.log(`XR state → ${targetState}`);
  }
}
