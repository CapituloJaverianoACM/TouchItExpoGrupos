/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Hand Gesture Catalog & Icons (js/gestures.js)
 * ============================================================================
 * Camera Mode replaces drawn runes with static hand poses. Each gesture is
 * defined by the state of every finger (extended / folded / don't-care) plus
 * optional constraints (thumb direction, thumb-index pinch). The classifier in
 * js/handpose.js scores live MediaPipe landmarks against these specs.
 *
 * Gestures are registered into Symbols.DEFINITIONS (flagged `isGesture`) so
 * balloons, orbs, scoring and targeting reuse the existing symbol pipeline.
 *
 * HOW TO ADD A GESTURE:
 * 1. Add an entry below with a `pose` spec and an `icon` spec.
 * 2. Make sure its pose differs from every other gesture by at least one
 *    clearly visible finger (the thumb alone is the least reliable signal).
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const Symbols = window.Aetherward.Symbols;

  // pose: finger -> 'ext' | 'fold' | 'any'
  //   pinch: true/false          -> thumb tip touching index tip (or clearly apart)
  //   thumbDir: 'up' | 'down'    -> extended thumb must point up/down in the image
  //   thumbNotPointing: true     -> reject a clearly extended, vertical thumb (keeps ✊ apart from 👍/👎)
  // icon: how the procedural hand illustration is drawn
  const GESTURE_DEFINITIONS = {
    // ---------------------------------------------------------------- EASY
    open_palm: {
      id: 'open_palm',
      name: 'Open Palm',
      emoji: '🖐️',
      tier: 'easy',
      color: '#38bdf8',
      scoreBonus: 1.0,
      hint: 'Spread all five fingers wide.',
      pose: { thumb: 'ext', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'ext', pinch: false },
      icon: { fingers: [1, 1, 1, 1], thumb: 'out' }
    },
    fist: {
      id: 'fist',
      name: 'Fist',
      emoji: '✊',
      tier: 'easy',
      color: '#f59e0b',
      scoreBonus: 1.0,
      hint: 'Close all fingers into a fist.',
      pose: { thumb: 'any', index: 'fold', middle: 'fold', ring: 'fold', pinky: 'fold', thumbNotPointing: true },
      icon: { fingers: [0, 0, 0, 0], thumb: 'wrap' }
    },
    point: {
      id: 'point',
      name: 'Point Up',
      emoji: '☝️',
      tier: 'easy',
      color: '#fde047',
      scoreBonus: 1.0,
      hint: 'Raise only your index finger.',
      pose: { thumb: 'any', index: 'ext', middle: 'fold', ring: 'fold', pinky: 'fold' },
      icon: { fingers: [1, 0, 0, 0], thumb: 'wrap' }
    },
    peace: {
      id: 'peace',
      name: 'Peace',
      emoji: '✌️',
      tier: 'easy',
      color: '#4ade80',
      scoreBonus: 1.0,
      hint: 'Raise your index and middle fingers.',
      pose: { thumb: 'any', index: 'ext', middle: 'ext', ring: 'fold', pinky: 'fold' },
      icon: { fingers: [1, 1, 0, 0], thumb: 'wrap', spread: true }
    },

    // -------------------------------------------------------------- MEDIUM
    three: {
      id: 'three',
      name: 'Three',
      emoji: '3️⃣',
      tier: 'medium',
      color: '#a78bfa',
      scoreBonus: 1.2,
      hint: 'Raise index, middle and ring fingers (pinky down).',
      pose: { thumb: 'any', index: 'ext', middle: 'ext', ring: 'ext', pinky: 'fold' },
      icon: { fingers: [1, 1, 1, 0], thumb: 'wrap' }
    },
    thumbs_up: {
      id: 'thumbs_up',
      name: 'Thumbs Up',
      emoji: '👍',
      tier: 'medium',
      color: '#22d3ee',
      scoreBonus: 1.2,
      hint: 'Make a fist with your thumb pointing up.',
      pose: { thumb: 'ext', index: 'fold', middle: 'fold', ring: 'fold', pinky: 'fold', thumbDir: 'up' },
      icon: { fingers: [0, 0, 0, 0], thumb: 'up' }
    },
    rock: {
      id: 'rock',
      name: 'Rock On',
      emoji: '🤘',
      tier: 'medium',
      color: '#f472b6',
      scoreBonus: 1.25,
      hint: 'Raise index and pinky; fold middle and ring.',
      pose: { thumb: 'any', index: 'ext', middle: 'fold', ring: 'fold', pinky: 'ext' },
      icon: { fingers: [1, 0, 0, 1], thumb: 'wrap' }
    },
    middle_finger: {
      id: 'middle_finger',
      name: 'Middle Finger',
      emoji: '🖕',
      tier: 'medium',
      color: '#ef4444',
      scoreBonus: 1.25,
      hint: 'Raise only your middle finger.',
      pose: { thumb: 'any', index: 'fold', middle: 'ext', ring: 'fold', pinky: 'fold' },
      icon: { fingers: [0, 1, 0, 0], thumb: 'wrap' }
    },

    // ---------------------------------------------------------------- HARD
    thumbs_down: {
      id: 'thumbs_down',
      name: 'Thumbs Down',
      emoji: '👎',
      tier: 'hard',
      color: '#fb7185',
      scoreBonus: 1.35,
      hint: 'Make a fist with your thumb pointing down.',
      pose: { thumb: 'ext', index: 'fold', middle: 'fold', ring: 'fold', pinky: 'fold', thumbDir: 'down' },
      icon: { fingers: [0, 0, 0, 0], thumb: 'up', flip: true }
    },
    ok: {
      id: 'ok',
      name: 'OK Sign',
      emoji: '👌',
      tier: 'hard',
      color: '#34d399',
      scoreBonus: 1.35,
      hint: 'Touch thumb and index tips into a ring; other fingers up.',
      pose: { thumb: 'any', index: 'any', middle: 'ext', ring: 'ext', pinky: 'ext', pinch: true },
      icon: { fingers: ['ring', 1, 1, 1], thumb: 'ring' }
    },
    call_me: {
      id: 'call_me',
      name: 'Call Me',
      emoji: '🤙',
      tier: 'hard',
      color: '#fb923c',
      scoreBonus: 1.35,
      hint: 'Stick out thumb and pinky; fold the middle three.',
      pose: { thumb: 'ext', index: 'fold', middle: 'fold', ring: 'fold', pinky: 'ext' },
      icon: { fingers: [0, 0, 0, 1], thumb: 'out' }
    }
  };

  for (const g of Object.values(GESTURE_DEFINITIONS)) {
    g.isGesture = true;
    g.templates = [];
    g.displayPath = [];
  }

  // --------------------------------------------------------------------------
  // PROCEDURAL HAND ICON (upright hand, palm facing the viewer)
  // Coordinates are in a 0..1 box. Drawn as a silhouette: dark outline pass,
  // then a white fill pass, so it reads clearly inside dark balloons.
  // --------------------------------------------------------------------------
  const FINGER_X = [0.355, 0.465, 0.57, 0.665];
  const FINGER_TOP = [0.15, 0.09, 0.13, 0.24];
  const FINGER_W = [0.1, 0.105, 0.1, 0.085];
  const PALM = { x0: 0.29, x1: 0.715, y0: 0.47, y1: 0.86 };

  function buildHandShapes(spec) {
    const caps = []; // capsules: [x0, y0, x1, y1, width]
    const lines = []; // dark detail lines
    const rings = []; // [cx, cy, r, width]
    const knuckleY = PALM.y0 + 0.02;

    spec.fingers.forEach((state, i) => {
      let x = FINGER_X[i];
      if (spec.spread && state === 1) x += i === 0 ? -0.04 : i === 1 ? 0.03 : 0;
      const w = FINGER_W[i];
      if (state === 1) {
        caps.push([x, FINGER_TOP[i] + w / 2, FINGER_X[i], knuckleY + 0.06, w]);
      } else if (state === 0) {
        // Folded finger: short knuckle bump on top of the palm
        caps.push([FINGER_X[i], knuckleY - 0.015, FINGER_X[i], knuckleY + 0.06, w]);
        if (i > 0) lines.push([FINGER_X[i] - w / 2 - 0.004, knuckleY - 0.03, FINGER_X[i] - w / 2 - 0.004, knuckleY + 0.07]);
      }
    });
    // Curled-fingers crease across the palm when any finger is folded
    const folded = spec.fingers.map((s, i) => (s === 0 ? i : -1)).filter(i => i >= 0);
    if (folded.length > 0) {
      const a = FINGER_X[folded[0]] - 0.05;
      const b = FINGER_X[folded[folded.length - 1]] + 0.05;
      lines.push([a, knuckleY + 0.1, b, knuckleY + 0.1]);
    }

    let palm = { ...PALM };

    if (spec.thumb === 'up') {
      // 👍: fist turned sideways (curled fingers stacked on the right), thumb pointing up
      const pcx = (PALM.x0 + PALM.x1) / 2;
      const pcy = (PALM.y0 + PALM.y1) / 2;
      const rot = ([x, y]) => [pcx - (y - pcy), pcy + (x - pcx)]; // 90° clockwise
      for (const c of caps) {
        const [a0, b0] = rot([c[0], c[1]]);
        const [a1, b1] = rot([c[2], c[3]]);
        c[0] = a0 - 0.04; c[1] = b0 + 0.06; c[2] = a1 - 0.04; c[3] = b1 + 0.06;
      }
      for (const l of lines) {
        const [a0, b0] = rot([l[0], l[1]]);
        const [a1, b1] = rot([l[2], l[3]]);
        l[0] = a0 - 0.04; l[1] = b0 + 0.06; l[2] = a1 - 0.04; l[3] = b1 + 0.06;
      }
      const hw = (PALM.y1 - PALM.y0) / 2;
      const hh = (PALM.x1 - PALM.x0) / 2;
      palm = { x0: pcx - hw - 0.04, x1: pcx + hw - 0.04, y0: pcy - hh + 0.06, y1: pcy + hh + 0.06 };
      caps.push([palm.x0 + 0.1, palm.y0 + 0.08, palm.x0 + 0.1, 0.12, 0.13]);
      return { caps, lines, rings, palm };
    }

    switch (spec.thumb) {
      case 'out':
        caps.push([0.33, 0.78, 0.13, 0.5, 0.11]);
        break;
      case 'wrap':
        caps.push([0.31, 0.8, 0.28, 0.66, 0.11]);
        caps.push([0.3, 0.66, 0.5, 0.62, 0.1]);
        lines.push([0.36, 0.7, 0.52, 0.67]);
        break;
      case 'ring': {
        // Thumb & index meet in a ring
        rings.push([0.27, 0.38, 0.1, 0.075]);
        caps.push([0.31, 0.8, 0.24, 0.5, 0.11]);
        break;
      }
      default:
        break;
    }
    return { caps, lines, rings, palm };
  }

  function drawGestureIcon(ctx, gestureId, cx, cy, size, options = {}) {
    const g = GESTURE_DEFINITIONS[gestureId];
    if (!g) return;
    const {
      color = '#ffffff',
      glowColor = g.color,
      highContrast = true,
      isDecoy = false
    } = options;

    const { caps, lines, rings, palm } = buildHandShapes(g.icon);
    ctx.save();
    ctx.translate(cx, cy);
    if (g.icon.flip) ctx.rotate(Math.PI);
    ctx.scale(size, size);
    ctx.translate(-0.5, -0.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const px = 1 / size; // one screen pixel in icon units
    const drawSilhouette = (extra, fill) => {
      ctx.strokeStyle = fill;
      ctx.fillStyle = fill;
      for (const [x0, y0, x1, y1, w] of caps) {
        ctx.lineWidth = w + extra;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      for (const [rx, ry, r, w] of rings) {
        ctx.lineWidth = w + extra;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const r = 0.07 + extra / 2;
      const x0 = palm.x0 - extra / 2, y0 = palm.y0 - extra / 2;
      const w = palm.x1 - palm.x0 + extra, h = palm.y1 - palm.y0 + extra;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r);
      else ctx.rect(x0, y0, w, h);
      ctx.fill();
    };

    if (isDecoy) ctx.globalAlpha *= 0.8;
    if (highContrast) drawSilhouette(px * 6, 'rgba(8, 10, 22, 0.9)');

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isDecoy ? 3 : 8;
    drawSilhouette(0, color);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = Math.max(px * 1.2, 0.018);
    for (const [x0, y0, x1, y1] of lines) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Colored accent ring around the silhouette base so each gesture keeps its color identity
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = Math.max(px * 1.5, 0.03);
    if (isDecoy) ctx.setLineDash([0.06, 0.05]);
    ctx.beginPath();
    ctx.moveTo(palm.x0 + 0.05, palm.y1 + 0.05);
    ctx.lineTo(palm.x1 - 0.05, palm.y1 + 0.05);
    ctx.stroke();

    ctx.restore();
  }

  // Register gestures in the shared symbol table so entities/scoring can look them up
  Object.assign(Symbols.DEFINITIONS, GESTURE_DEFINITIONS);
  Symbols.registerIconRenderer('gesture', drawGestureIcon);

  window.Aetherward.Gestures = {
    DEFINITIONS: GESTURE_DEFINITIONS,
    ONBOARDING_ORDER: ['open_palm', 'fist', 'point', 'peace', 'fist', 'open_palm'],
    drawGestureIcon,
  };
})();
