import * as THREE from 'three';

/**
 * XR Hand Input — pinch detection and fist exit gesture.
 *
 * Reads hand joints from XRHand API each frame:
 * - Pinch: index-finger-tip to thumb-tip distance < 0.03m → fires select
 * - Fist: all finger tips curled toward wrist center → fires exit
 */

const PINCH_THRESHOLD = 0.03;   // meters
const FIST_THRESHOLD  = 0.06;   // max distance from palm to fingertip for fist
const DOUBLE_FIST_DURATION = 2.0; // seconds both fists must hold

const _indexPos = new THREE.Vector3();
const _thumbPos = new THREE.Vector3();
const _wristPos = new THREE.Vector3();
const _fingerPos = new THREE.Vector3();
const _pinchMid = new THREE.Vector3();
const _tempDir = new THREE.Vector3();

const FINGER_TIPS = [
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

export class XRHandInput {
  constructor() {
    this.selectCallbacks = [];
    this.exitCallbacks = [];
    this.doubleFistExitCallbacks = [];

    // Per-hand state for debouncing
    this.handState = {
      left:  { pinching: false, fisting: false },
      right: { pinching: false, fisting: false },
    };

    // Double-fist tracking
    this._doubleFistStartTime = null;
    this._doubleFistFired = false;
  }

  onSelect(cb) { this.selectCallbacks.push(cb); }
  onExit(cb)   { this.exitCallbacks.push(cb); }
  onDoubleFistExit(cb) { this.doubleFistExitCallbacks.push(cb); }

  /**
   * Call each frame.
   * Returns per-hand data: { left: { pinchPoint, isPinching }, right: { ... } }
   */
  update(frame, renderer) {
    const result = {
      left:  { pinchPoint: null, isPinching: false },
      right: { pinchPoint: null, isPinching: false },
    };

    if (!frame || !renderer.xr.isPresenting) return result;

    const session = renderer.xr.getSession();
    if (!session) return result;

    const refSpace = renderer.xr.getReferenceSpace();

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand) continue;

      const handedness = inputSource.handedness;
      if (handedness !== 'left' && handedness !== 'right') continue;

      const hand = inputSource.hand;
      const state = this.handState[handedness];

      // Read joint poses
      const indexTip = this._getJointPos(frame, hand, 'index-finger-tip', refSpace, _indexPos);
      const thumbTip = this._getJointPos(frame, hand, 'thumb-tip', refSpace, _thumbPos);

      if (!indexTip || !thumbTip) continue;

      // ---- PINCH DETECTION ----
      const pinchDist = _indexPos.distanceTo(_thumbPos);
      const isPinching = pinchDist < PINCH_THRESHOLD;

      _pinchMid.lerpVectors(_indexPos, _thumbPos, 0.5);
      result[handedness].pinchPoint = _pinchMid.clone();
      result[handedness].isPinching = isPinching;

      if (isPinching && !state.pinching) {
        // Pinch started — fire select
        state.pinching = true;
        this.selectCallbacks.forEach(cb => cb(handedness, _pinchMid.clone()));
      } else if (!isPinching) {
        state.pinching = false;
      }

      // ---- FIST DETECTION (for exit) ----
      const wrist = this._getJointPos(frame, hand, 'wrist', refSpace, _wristPos);
      if (wrist) {
        let allCurled = true;
        for (const tipName of FINGER_TIPS) {
          const tip = this._getJointPos(frame, hand, tipName, refSpace, _fingerPos);
          if (!tip) { allCurled = false; break; }
          if (_fingerPos.distanceTo(_wristPos) > FIST_THRESHOLD) {
            allCurled = false;
            break;
          }
        }

        if (allCurled && !state.fisting) {
          state.fisting = true;
          console.log(`Fist detected on ${handedness} hand`);
          this.exitCallbacks.forEach(cb => cb(handedness));
        } else if (!allCurled) {
          state.fisting = false;
        }
      }
    }

    // ---- DOUBLE-FIST TIMED EXIT ----
    const leftFist = this.handState.left.fisting;
    const rightFist = this.handState.right.fisting;

    if (leftFist && rightFist) {
      const now = performance.now() / 1000;
      if (this._doubleFistStartTime === null) {
        this._doubleFistStartTime = now;
        console.log('Double-fist hold started...');
      } else if (!this._doubleFistFired && (now - this._doubleFistStartTime) >= DOUBLE_FIST_DURATION) {
        this._doubleFistFired = true;
        console.log('Double-fist 2s hold — firing exit!');
        this.doubleFistExitCallbacks.forEach(cb => cb());
      }
    } else {
      this._doubleFistStartTime = null;
      this._doubleFistFired = false;
    }

    return result;
  }

  /**
   * Get raycasting ray from a pinching hand (index-to-thumb direction).
   */
  getPinchRay(frame, renderer, handedness) {
    if (!frame || !renderer.xr.isPresenting) return null;

    const session = renderer.xr.getSession();
    if (!session) return null;

    const refSpace = renderer.xr.getReferenceSpace();

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand || inputSource.handedness !== handedness) continue;

      const hand = inputSource.hand;
      const indexTip = this._getJointPos(frame, hand, 'index-finger-tip', refSpace, _indexPos);
      const thumbTip = this._getJointPos(frame, hand, 'thumb-tip', refSpace, _thumbPos);

      if (!indexTip || !thumbTip) return null;

      const origin = new THREE.Vector3().lerpVectors(_indexPos, _thumbPos, 0.5);

      // Direction: from wrist through pinch point
      const wrist = this._getJointPos(frame, hand, 'wrist', refSpace, _wristPos);
      if (!wrist) return null;

      _tempDir.subVectors(origin, _wristPos).normalize();

      return { origin, direction: _tempDir.clone() };
    }
    return null;
  }

  /**
   * Get spread distance between left and right hands (for zoom gesture).
   */
  getHandSpread(frame, renderer) {
    if (!frame || !renderer.xr.isPresenting) return null;

    const session = renderer.xr.getSession();
    if (!session) return null;

    const refSpace = renderer.xr.getReferenceSpace();
    let leftWrist = null;
    let rightWrist = null;

    for (const inputSource of session.inputSources) {
      if (!inputSource.hand) continue;
      const hand = inputSource.hand;
      const h = inputSource.handedness;

      if (h === 'left') {
        leftWrist = this._getJointPos(frame, hand, 'wrist', refSpace, new THREE.Vector3());
        if (leftWrist) leftWrist = leftWrist.clone();
      } else if (h === 'right') {
        rightWrist = this._getJointPos(frame, hand, 'wrist', refSpace, new THREE.Vector3());
        if (rightWrist) rightWrist = rightWrist.clone();
      }
    }

    if (leftWrist && rightWrist) {
      return leftWrist.distanceTo(rightWrist);
    }
    return null;
  }

  _getJointPos(frame, hand, jointName, refSpace, target) {
    const joint = hand.get(jointName);
    if (!joint) return null;

    try {
      const pose = frame.getJointPose(joint, refSpace);
      if (pose) {
        const p = pose.transform.position;
        target.set(p.x, p.y, p.z);
        return target;
      }
    } catch { /* joint unavailable */ }
    return null;
  }
}
