/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Hand Pose Classifier (js/handpose.js)
 * ============================================================================
 * Pipeline:  MediaPipe landmarks -> per-finger extension (0..1)
 *            -> pose scores vs. Gestures.DEFINITIONS -> raw gesture / UNKNOWN
 *            -> GestureStabilizer (hold, confirm, latch, cooldown)
 *
 * Every measurement is rotation-, scale- and handedness-invariant: finger
 * extension comes from 3D joint bend angles and wrist-distance ratios, all
 * normalized by palm size. Only thumbs up/down use image "up".
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG.GESTURE_RECOGNITION;
  const Gestures = window.Aetherward.Gestures;

  const FINGERS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20]
  };
  const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

  const clamp01 = x => Math.max(0, Math.min(1, x));
  const ramp = (x, lo, hi) => clamp01((x - lo) / (hi - lo));

  // Landmark x/y are normalized by image width/height; z shares the x scale.
  // Multiplying x and z by the aspect ratio makes distances isotropic.
  function vec(a, b, ax) {
    return [(b.x - a.x) * ax, b.y - a.y, ((b.z || 0) - (a.z || 0)) * ax];
  }
  function len(v) {
    return Math.hypot(v[0], v[1], v[2]);
  }
  function dist(a, b, ax) {
    return len(vec(a, b, ax));
  }
  function angleDeg(u, v) {
    const lu = len(u), lv = len(v);
    if (lu < 1e-9 || lv < 1e-9) return 0;
    const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  }

  /**
   * Raw geometric measurements for one frame.
   */
  function measureHand(lm, ax) {
    const wrist = lm[0];
    const palm = Math.max(1e-4, dist(wrist, lm[9], ax), dist(lm[5], lm[17], ax) * 1.3);

    // Palm center (wrist + 4 knuckles)
    const idx = [0, 5, 9, 13, 17];
    const center = { x: 0, y: 0, z: 0 };
    for (const i of idx) {
      center.x += lm[i].x / idx.length;
      center.y += lm[i].y / idx.length;
      center.z += (lm[i].z || 0) / idx.length;
    }

    const ext = {};
    const curl = {};
    for (const name of ['index', 'middle', 'ring', 'pinky']) {
      const [m, p, d, t] = FINGERS[name].map(i => lm[i]);
      const c =
        angleDeg(vec(wrist, m, ax), vec(m, p, ax)) +
        angleDeg(vec(m, p, ax), vec(p, d, ax)) +
        angleDeg(vec(p, d, ax), vec(d, t, ax));
      const reach = dist(wrist, t, ax) / Math.max(1e-4, dist(wrist, p, ax));
      // Straight finger: total bend ~0-50°, reach ~1.4. Folded: bend > 180°, reach < 1.0
      const eAngle = 1 - ramp(c, 70, 185);
      const eReach = ramp(reach, 0.95, 1.3);
      ext[name] = 0.55 * eAngle + 0.45 * eReach;
      curl[name] = c;
    }

    // Thumb: how far the tip sits from the palm center, plus how straight the thumb is
    const [tc, tm, ti, tt] = FINGERS.thumb.map(i => lm[i]);
    const thumbCurl = angleDeg(vec(tc, tm, ax), vec(tm, ti, ax)) + angleDeg(vec(tm, ti, ax), vec(ti, tt, ax));
    const thumbOut = dist(tt, center, ax) / palm;
    ext.thumb = 0.7 * ramp(thumbOut, 0.45, 0.7) + 0.3 * (1 - ramp(thumbCurl, 35, 90));
    curl.thumb = thumbCurl;

    // Thumb direction in the image (y grows downward): +1 = straight up, -1 = straight down
    const tdx = (tt.x - tm.x) * ax;
    const tdy = tt.y - tm.y;
    const thumbUp = -tdy / Math.max(1e-6, Math.hypot(tdx, tdy));

    const pinch = dist(tt, lm[8], ax) / palm;

    return { palm, ext, curl, thumbOut, thumbUp, pinch };
  }

  // Extended is forgiving (a slightly bent finger still counts); folded must be clearly
  // folded, so a relaxed half-curled hand reads as UNKNOWN instead of a random gesture.
  function fingerMatch(e, want) {
    if (want === 'ext') return ramp(e, 0.35, 0.65);
    if (want === 'fold') return ramp(1 - e, 0.55, 0.8);
    return 1;
  }

  function scorePose(pose, m) {
    let s = 1;
    for (const name of FINGER_NAMES) {
      s = Math.min(s, fingerMatch(m.ext[name], pose[name] || 'any'));
    }
    if (pose.pinch === true) s = Math.min(s, 1 - ramp(m.pinch, 0.28, 0.45));
    if (pose.pinch === false) s = Math.min(s, ramp(m.pinch, 0.3, 0.5));
    if (pose.thumbDir === 'up') s = Math.min(s, ramp(m.thumbUp, 0.3, 0.6));
    if (pose.thumbDir === 'down') s = Math.min(s, ramp(-m.thumbUp, 0.3, 0.6));
    if (pose.thumbNotPointing) {
      const pointing = fingerMatch(m.ext.thumb, 'ext') * ramp(Math.abs(m.thumbUp), 0.35, 0.65);
      s = Math.min(s, 1 - pointing);
    }
    return s;
  }

  function fingerState(e) {
    if (e >= 0.65) return 'extended';
    if (e <= 0.35) return 'folded';
    return 'partial';
  }

  // ==========================================================================
  // CLASSIFIER (stateful: smooths finger values and applies hysteresis)
  // ==========================================================================
  class HandPoseClassifier {
    constructor(definitions = Gestures.DEFINITIONS) {
      this.definitions = definitions;
      this.reset();
    }

    reset() {
      this.smoothedExt = null;
      this.lastId = 'UNKNOWN';
    }

    /**
     * @param {Array<{x,y,z}>} lm - 21 MediaPipe landmarks (raw, un-mirrored)
     * @param {{aspect?: number, allowedIds?: Set<string>}} opts
     * @returns {{ id, score, margin, reason, fingers, scores, measures }}
     */
    classify(lm, opts = {}) {
      const ax = opts.aspect || 4 / 3;

      // Hand partly outside the frame -> don't guess
      for (const p of lm) {
        if (p.x < 0.005 || p.x > 0.995 || p.y < 0.005 || p.y > 0.995) {
          this.lastId = 'UNKNOWN';
          return { id: 'UNKNOWN', score: 0, margin: 0, reason: 'partial', fingers: null, scores: [] };
        }
      }

      const m = measureHand(lm, ax);
      if (m.palm < 0.035) {
        this.lastId = 'UNKNOWN';
        return { id: 'UNKNOWN', score: 0, margin: 0, reason: 'too_far', fingers: null, scores: [], measures: m };
      }

      // Temporal smoothing of per-finger extension (kills single-frame landmark jitter)
      const a = CFG.FINGER_SMOOTHING;
      if (!this.smoothedExt) {
        this.smoothedExt = { ...m.ext };
      } else {
        for (const name of FINGER_NAMES) {
          this.smoothedExt[name] = this.smoothedExt[name] * (1 - a) + m.ext[name] * a;
        }
      }
      const measures = { ...m, ext: { ...this.smoothedExt } };

      const scores = [];
      for (const [id, def] of Object.entries(this.definitions)) {
        if (opts.allowedIds && !opts.allowedIds.has(id)) continue;
        let s = scorePose(def.pose, measures);
        if (id === this.lastId) s = Math.min(1, s + CFG.STICKY_BONUS);
        scores.push({ id, score: s });
      }
      scores.sort((x, y) => y.score - x.score);

      const best = scores[0] || { id: 'UNKNOWN', score: 0 };
      const second = scores[1] || { score: 0 };
      const margin = best.score - second.score;

      let id = best.id;
      let reason = 'ok';
      if (best.score < CFG.MIN_SCORE) {
        id = 'UNKNOWN';
        reason = 'low_score';
      } else if (margin < CFG.MIN_MARGIN) {
        id = 'UNKNOWN';
        reason = 'ambiguous';
      }
      this.lastId = id;

      const fingers = {};
      for (const name of FINGER_NAMES) {
        fingers[name] = { ext: measures.ext[name], state: fingerState(measures.ext[name]) };
      }

      return { id, score: best.score, margin, reason, fingers, scores, measures };
    }
  }

  // ==========================================================================
  // TEMPORAL STABILIZER: candidate -> hold -> confirm -> latch until released
  // ==========================================================================
  class GestureStabilizer {
    constructor() {
      this.reset();
    }

    reset() {
      this.candidateId = null;
      this.holdMs = 0;
      this.graceMs = 0;
      this.latchedId = null;   // Confirmed pose that must be released before it can fire again
      this.releaseMs = 0;
      this.cooldownMs = 0;
    }

    /**
     * Feed one raw classification per camera frame.
     * @returns {{ phase: 'idle'|'verifying'|'latched', candidateId, progress, confirmedId }}
     */
    update(rawId, dtMs) {
      const dt = Math.max(0, Math.min(200, dtMs));
      this.cooldownMs = Math.max(0, this.cooldownMs - dt);
      const holdMs = CFG.HOLD_SECONDS * 1000;
      let confirmedId = null;

      // Release the latch once the player has clearly left the confirmed pose
      if (this.latchedId) {
        if (rawId === this.latchedId) {
          this.releaseMs = 0;
        } else {
          this.releaseMs += dt;
          if (this.releaseMs >= CFG.RELEASE_MS) {
            this.latchedId = null;
            this.releaseMs = 0;
          }
        }
      }

      if (rawId === 'UNKNOWN' || rawId === this.latchedId) {
        // Tolerate brief flickers without losing hold progress
        if (this.candidateId) {
          this.graceMs += dt;
          if (this.graceMs > CFG.GRACE_MS) {
            this.candidateId = null;
            this.holdMs = 0;
            this.graceMs = 0;
          }
        }
      } else if (rawId === this.candidateId) {
        this.graceMs = 0;
        this.holdMs += dt;
      } else if (this.candidateId && this.graceMs + dt <= CFG.GRACE_MS && this.holdMs > 0) {
        // A different pose for a moment: treat as flicker first
        this.graceMs += dt;
      } else {
        this.candidateId = rawId;
        this.holdMs = dt;
        this.graceMs = 0;
      }

      if (this.candidateId && this.holdMs >= holdMs && this.cooldownMs <= 0) {
        confirmedId = this.candidateId;
        this.latchedId = this.candidateId;
        this.releaseMs = 0;
        this.candidateId = null;
        this.holdMs = 0;
        this.graceMs = 0;
        this.cooldownMs = CFG.COOLDOWN_SECONDS * 1000;
      }

      let phase = 'idle';
      if (this.candidateId) phase = 'verifying';
      else if (this.latchedId) phase = 'latched';

      return {
        phase,
        candidateId: this.candidateId,
        latchedId: this.latchedId,
        progress: this.candidateId ? Math.min(1, this.holdMs / holdMs) : 0,
        confirmedId
      };
    }
  }

  window.Aetherward.HandPose = {
    HandPoseClassifier,
    GestureStabilizer,
    measureHand,
    FINGER_NAMES
  };
})();
