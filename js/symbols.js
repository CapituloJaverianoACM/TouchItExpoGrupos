/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Symbol Catalog & Renderer (js/symbols.js)
 * ============================================================================
 * Defines all 19 magical runes across 4 difficulty tiers (Easy, Medium, Hard,
 * Expert), their canonical stroke templates, recognition hints, and high-contrast
 * Canvas 2D icon rendering routines.
 *
 * HOW TO ADD A NEW SYMBOL:
 * 1. Add an entry to `SYMBOL_DEFINITIONS` below with `id`, `name`, `tier`,
 *    `color`, `hint`, and `templates` (arrays of [x,y] points in 0..1 space).
 * 2. Optionally add custom geometric rules in `js/recognizer.js`.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  // Helper to generate dense circle/arc/spiral points for templates & rendering
  function makeArcPoints(cx, cy, rx, ry, startAngle, endAngle, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + (endAngle - startAngle) * t;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }

  function makeSpiralPoints(turns, inward, clockwise, startAngle = -Math.PI / 2) {
    const pts = [];
    const steps = Math.max(48, Math.round(turns * 32));
    const dir = clockwise ? 1 : -1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = inward ? (0.48 * (1 - 0.82 * t)) : (0.08 + 0.40 * t);
      const a = startAngle + dir * turns * Math.PI * 2 * t;
      pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    return pts;
  }

  function makeSpiralTemplateSet() {
    const out = [];
    for (const turns of [1.5, 2.1, 2.8]) {
      for (let k = 0; k < 8; k++) {
        const start = -Math.PI / 2 + (k * Math.PI) / 4;
        out.push(makeSpiralPoints(turns, true, true, start));
        out.push(makeSpiralPoints(turns, true, false, start));
      }
    }
    return out;
  }

  function makeStarPoints(startIdx, reverse) {
    // 5-pointed star vertices on a circle
    const outer = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      outer.push([0.5 + 0.46 * Math.cos(a), 0.5 + 0.46 * Math.sin(a)]);
    }
    // Classic 5-stroke continuous star order: 0 -> 2 -> 4 -> 1 -> 3 -> 0
    const order = [0, 2, 4, 1, 3, 0];
    const pts = [];
    for (let i = 0; i < order.length; i++) {
      const idx = (order[i] + startIdx) % 5;
      pts.push(outer[idx]);
    }
    return reverse ? pts.slice().reverse() : pts;
  }

  // ==========================================================================
  // SYMBOL DEFINITIONS (4 Tiers: easy, medium, hard, expert)
  // ==========================================================================
  const SYMBOL_DEFINITIONS = {
    // ------------------------------------------------------------------------
    // TIER 1: EASY SYMBOLS (0s+)
    // ------------------------------------------------------------------------
    horizontal: {
      id: 'horizontal',
      name: 'Horizon Slash',
      tier: 'easy',
      color: '#38bdf8', // Bright Cyan
      scoreBonus: 1.0,
      hint: 'Draw a straight horizontal line (left-to-right or right-to-left).',
      displayPath: [[0.12, 0.5], [0.88, 0.5]],
      templates: [
        [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5]],
        [[0.9, 0.5], [0.5, 0.5], [0.1, 0.5]],
      ]
    },

    vertical: {
      id: 'vertical',
      name: 'Pillar Beam',
      tier: 'easy',
      color: '#facc15', // Bright Gold
      scoreBonus: 1.0,
      hint: 'Draw a straight vertical line (top-to-bottom or bottom-to-top).',
      displayPath: [[0.5, 0.12], [0.5, 0.88]],
      templates: [
        [[0.5, 0.1], [0.5, 0.5], [0.5, 0.9]],
        [[0.5, 0.9], [0.5, 0.5], [0.5, 0.1]],
      ]
    },

    v_down: {
      id: 'v_down',
      name: 'Valley Chevron',
      tier: 'easy',
      color: '#4ade80', // Vibrant Emerald
      scoreBonus: 1.05,
      hint: 'Draw a V-shape pointing downward.',
      displayPath: [[0.16, 0.22], [0.5, 0.82], [0.84, 0.22]],
      templates: [
        [[0.15, 0.2], [0.5, 0.85], [0.85, 0.2]],
        [[0.85, 0.2], [0.5, 0.85], [0.15, 0.2]],
      ]
    },

    v_up: {
      id: 'v_up',
      name: 'Peak Chevron',
      tier: 'easy',
      color: '#fb923c', // Bright Orange
      scoreBonus: 1.05,
      hint: 'Draw an inverted V (caret ^) pointing upward.',
      displayPath: [[0.16, 0.78], [0.5, 0.18], [0.84, 0.78]],
      templates: [
        [[0.15, 0.8], [0.5, 0.15], [0.85, 0.8]],
        [[0.85, 0.8], [0.5, 0.15], [0.15, 0.8]],
      ]
    },

    circle: {
      id: 'circle',
      name: 'Solar Orb',
      tier: 'easy',
      color: '#60a5fa', // Sky Blue
      scoreBonus: 1.1,
      hint: 'Draw a closed circle or oval in either direction.',
      displayPath: makeArcPoints(0.5, 0.5, 0.36, 0.36, -Math.PI / 2, Math.PI * 1.5, 32),
      templates: [
        makeArcPoints(0.5, 0.5, 0.4, 0.4, -Math.PI / 2, Math.PI * 1.5, 28),
        makeArcPoints(0.5, 0.5, 0.4, 0.4, Math.PI * 1.5, -Math.PI / 2, 28),
        makeArcPoints(0.5, 0.5, 0.4, 0.4, Math.PI, Math.PI * 3, 28),
      ]
    },

    triangle: {
      id: 'triangle',
      name: 'Triad Delta',
      tier: 'easy',
      color: '#a3e635', // Lime Green
      scoreBonus: 1.15,
      hint: 'Draw a closed 3-sided triangle starting from any corner.',
      displayPath: [[0.5, 0.15], [0.85, 0.80], [0.15, 0.80], [0.5, 0.15]],
      templates: [
        [[0.5, 0.15], [0.85, 0.82], [0.15, 0.82], [0.5, 0.15]],
        [[0.5, 0.15], [0.15, 0.82], [0.85, 0.82], [0.5, 0.15]],
        [[0.15, 0.82], [0.5, 0.15], [0.85, 0.82], [0.15, 0.82]],
        [[0.85, 0.82], [0.5, 0.15], [0.15, 0.82], [0.85, 0.82]],
      ]
    },

    // ------------------------------------------------------------------------
    // TIER 2: MEDIUM SYMBOLS (30s+)
    // ------------------------------------------------------------------------
    square: {
      id: 'square',
      name: 'Bastion Square',
      tier: 'medium',
      color: '#fbbf24', // Warm Amber
      scoreBonus: 1.25,
      hint: 'Draw a closed 4-cornered box.',
      displayPath: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]],
      templates: [
        [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]],
        [[0.2, 0.2], [0.2, 0.8], [0.8, 0.8], [0.8, 0.2], [0.2, 0.2]],
        [[0.8, 0.2], [0.2, 0.2], [0.2, 0.8], [0.8, 0.8], [0.8, 0.2]],
      ]
    },

    diamond: {
      id: 'diamond',
      name: 'Astral Diamond',
      tier: 'medium',
      color: '#f472b6', // Hot Pink
      scoreBonus: 1.25,
      hint: 'Draw a tilted 4-point diamond (top, right, bottom, left).',
      displayPath: [[0.5, 0.12], [0.86, 0.5], [0.5, 0.88], [0.14, 0.5], [0.5, 0.12]],
      templates: [
        [[0.5, 0.12], [0.86, 0.5], [0.5, 0.88], [0.14, 0.5], [0.5, 0.12]],
        [[0.5, 0.12], [0.14, 0.5], [0.5, 0.88], [0.86, 0.5], [0.5, 0.12]],
        [[0.14, 0.5], [0.5, 0.12], [0.86, 0.5], [0.5, 0.88], [0.14, 0.5]],
      ]
    },

    zigzag: {
      id: 'zigzag',
      name: 'Storm Bolt (Z)',
      tier: 'medium',
      color: '#fde047', // Electric Yellow
      scoreBonus: 1.3,
      hint: 'Draw a sharp Z-shape or 3-segment lightning bolt.',
      displayPath: [[0.18, 0.22], [0.82, 0.22], [0.18, 0.78], [0.82, 0.78]],
      templates: [
        // Z-shape
        [[0.16, 0.22], [0.84, 0.22], [0.16, 0.78], [0.84, 0.78]],
        [[0.84, 0.78], [0.16, 0.78], [0.84, 0.22], [0.16, 0.22]],
        // Vertical lightning bolt
        [[0.62, 0.12], [0.24, 0.50], [0.76, 0.50], [0.38, 0.88]],
        // N-shape variant
        [[0.20, 0.82], [0.20, 0.18], [0.80, 0.82], [0.80, 0.18]],
      ]
    },

    spiral: {
      id: 'spiral',
      name: 'Vortex Coil',
      tier: 'medium',
      color: '#c084fc', // Vivid Purple
      scoreBonus: 1.35,
      hint: 'Swirl around at least 1.5 times (inward or outward).',
      displayPath: makeSpiralPoints(1.85, true, true),
      // Inward spirals with varied turn counts, start angles and directions
      // (outward spirals are covered by the recognizer's reversed-stroke matching)
      templates: makeSpiralTemplateSet()
    },

    star: {
      id: 'star',
      name: 'Pentagram Star',
      tier: 'medium',
      color: '#fb7185', // Rose Coral
      scoreBonus: 1.4,
      hint: 'Draw a 5-pointed star in one continuous crisscross stroke.',
      displayPath: makeStarPoints(0, false),
      templates: [
        makeStarPoints(0, false),
        makeStarPoints(0, true),
        makeStarPoints(3, false),
        makeStarPoints(4, false),
      ]
    },

    // ------------------------------------------------------------------------
    // TIER 3: HARD SYMBOLS (90s+)
    // ------------------------------------------------------------------------
    double_zigzag: {
      id: 'double_zigzag',
      name: 'Twin Serpent (W)',
      tier: 'hard',
      color: '#f87171', // Crimson Red
      scoreBonus: 1.5,
      hint: 'Draw a 4-segment W or M wave with three sharp turns.',
      displayPath: [[0.10, 0.24], [0.30, 0.78], [0.50, 0.28], [0.70, 0.78], [0.90, 0.24]],
      templates: [
        // W shape
        [[0.10, 0.24], [0.30, 0.80], [0.50, 0.28], [0.70, 0.80], [0.90, 0.24]],
        [[0.90, 0.24], [0.70, 0.80], [0.50, 0.28], [0.30, 0.80], [0.10, 0.24]],
        // M shape
        [[0.10, 0.78], [0.30, 0.22], [0.50, 0.72], [0.70, 0.22], [0.90, 0.78]],
        [[0.90, 0.78], [0.70, 0.22], [0.50, 0.72], [0.30, 0.22], [0.10, 0.78]],
      ]
    },

    hourglass: {
      id: 'hourglass',
      name: 'Chrono Hourglass',
      tier: 'hard',
      color: '#e879f9', // Neon Fuchsia
      scoreBonus: 1.55,
      hint: 'Draw a crossed hourglass or figure-8 shape.',
      displayPath: [[0.20, 0.18], [0.80, 0.18], [0.20, 0.82], [0.80, 0.82], [0.20, 0.18]],
      templates: [
        [[0.20, 0.18], [0.80, 0.18], [0.20, 0.82], [0.80, 0.82], [0.20, 0.18]],
        [[0.80, 0.18], [0.20, 0.18], [0.80, 0.82], [0.20, 0.82], [0.80, 0.18]],
        [[0.20, 0.18], [0.80, 0.82], [0.80, 0.18], [0.20, 0.82], [0.20, 0.18]],
      ]
    },

    loop_line: {
      id: 'loop_line',
      name: 'Aether Ribbon',
      tier: 'hard',
      color: '#2dd4bf', // Bright Teal
      scoreBonus: 1.55,
      hint: 'Start from a bottom tail, loop over the top, and cross down to the other corner.',
      displayPath: [
        [0.20, 0.84],
        [0.56, 0.46],
        ...makeArcPoints(0.50, 0.34, 0.24, 0.20, 0.2, -Math.PI * 1.2, 16),
        [0.44, 0.46],
        [0.80, 0.84]
      ],
      templates: [
        [
          [0.20, 0.84],
          [0.56, 0.46],
          ...makeArcPoints(0.50, 0.34, 0.24, 0.20, 0.2, -Math.PI * 1.2, 14),
          [0.44, 0.46],
          [0.80, 0.84]
        ],
        [
          [0.80, 0.84],
          [0.44, 0.46],
          ...makeArcPoints(0.50, 0.34, 0.24, 0.20, Math.PI - 0.2, Math.PI * 2.2, 14),
          [0.56, 0.46],
          [0.20, 0.84]
        ]
      ]
    },

    cross_rune: {
      id: 'cross_rune',
      name: 'Templar Cross (+)',
      tier: 'hard',
      color: '#f1f5f9', // Radiant Silver-White
      scoreBonus: 1.6,
      isMultiStrokeCapable: true,
      hint: 'Draw a + cross (either two quick intersecting lines OR one looped cross stroke).',
      displayPath: [[0.5, 0.14], [0.5, 0.86]],
      secondaryDisplayPath: [[0.14, 0.5], [0.86, 0.5]],
      templates: [
        // Single-stroke continuous cross (vertical then loop to horizontal)
        [[0.5, 0.14], [0.5, 0.86], [0.14, 0.5], [0.86, 0.5]],
        [[0.14, 0.5], [0.86, 0.5], [0.5, 0.14], [0.5, 0.86]],
        [[0.5, 0.86], [0.5, 0.14], [0.14, 0.5], [0.86, 0.5]],
      ]
    },

    // ------------------------------------------------------------------------
    // TIER 4: EXPERT SYMBOLS (180s+ Precision & Directional)
    // ------------------------------------------------------------------------
    c_left: {
      id: 'c_left',
      name: 'Waxing Crescent (C)',
      tier: 'expert',
      color: '#93c5fd', // Ice Blue
      scoreBonus: 1.7,
      directional: true,
      hint: 'Draw an open C-curve bowing to the LEFT (opening faces right).',
      displayPath: makeArcPoints(0.58, 0.5, 0.36, 0.36, -Math.PI * 0.68, -Math.PI * 1.32, 22),
      templates: [
        makeArcPoints(0.58, 0.5, 0.36, 0.36, -Math.PI * 0.65, -Math.PI * 1.35, 22),
        makeArcPoints(0.58, 0.5, 0.36, 0.36, -Math.PI * 1.35, -Math.PI * 0.65, 22),
      ]
    },

    c_right: {
      id: 'c_right',
      name: 'Waning Crescent (⊃)',
      tier: 'expert',
      color: '#fdba74', // Solar Peach
      scoreBonus: 1.7,
      directional: true,
      hint: 'Draw a mirrored C-curve bowing to the RIGHT (opening faces left).',
      displayPath: makeArcPoints(0.42, 0.5, 0.36, 0.36, -Math.PI * 0.32, Math.PI * 0.32, 22),
      templates: [
        makeArcPoints(0.42, 0.5, 0.36, 0.36, -Math.PI * 0.35, Math.PI * 0.35, 22),
        makeArcPoints(0.42, 0.5, 0.36, 0.36, Math.PI * 0.35, -Math.PI * 0.35, 22),
      ]
    },

    s_curve: {
      id: 's_curve',
      name: 'Serpent Wave (S)',
      tier: 'expert',
      color: '#6ee7b7', // Mint Jade
      scoreBonus: 1.75,
      hint: 'Draw a smooth S-curve weaving left then right.',
      displayPath: [
        ...makeArcPoints(0.50, 0.31, 0.25, 0.18, -Math.PI * 0.15, -Math.PI * 1.45, 14),
        ...makeArcPoints(0.50, 0.69, 0.25, 0.18, -Math.PI * 0.55, Math.PI * 0.85, 14)
      ],
      templates: [
        [
          ...makeArcPoints(0.50, 0.31, 0.25, 0.18, -Math.PI * 0.15, -Math.PI * 1.45, 14),
          ...makeArcPoints(0.50, 0.69, 0.25, 0.18, -Math.PI * 0.55, Math.PI * 0.85, 14)
        ],
        [
          ...makeArcPoints(0.50, 0.69, 0.25, 0.18, Math.PI * 0.85, -Math.PI * 0.55, 14),
          ...makeArcPoints(0.50, 0.31, 0.25, 0.18, -Math.PI * 1.45, -Math.PI * 0.15, 14)
        ]
      ]
    },

    omega: {
      id: 'omega',
      name: 'Omega Arch (Ω)',
      tier: 'expert',
      color: '#fde68a', // Royal Gold
      scoreBonus: 1.8,
      hint: 'Draw a horizontal foot, arch up and around the dome, and finish with a right foot.',
      displayPath: [
        [0.14, 0.80],
        [0.35, 0.80],
        ...makeArcPoints(0.50, 0.46, 0.32, 0.30, Math.PI * 0.75, Math.PI * 2.25, 18),
        [0.65, 0.80],
        [0.86, 0.80]
      ],
      templates: [
        [
          [0.14, 0.80],
          [0.35, 0.80],
          ...makeArcPoints(0.50, 0.46, 0.32, 0.30, Math.PI * 0.75, Math.PI * 2.25, 18),
          [0.65, 0.80],
          [0.86, 0.80]
        ],
        [
          [0.86, 0.80],
          [0.65, 0.80],
          ...makeArcPoints(0.50, 0.46, 0.32, 0.30, Math.PI * 2.25, Math.PI * 0.75, 18),
          [0.35, 0.80],
          [0.14, 0.80]
        ]
      ]
    }
  };

  // ==========================================================================
  // HELPER FUNCTIONS FOR QUERYING & RENDERING SYMBOLS
  // ==========================================================================
  /**
   * @param {string[]} allowedTiers
   * @param {'rune'|'gesture'} symbolSet - drawn runes (mouse/touch) or hand gestures (camera)
   */
  function getSymbolsByTiers(allowedTiers, symbolSet = 'rune') {
    const tierSet = new Set(allowedTiers);
    const wantGesture = symbolSet === 'gesture';
    return Object.values(SYMBOL_DEFINITIONS).filter(
      sym => tierSet.has(sym.tier) && Boolean(sym.isGesture) === wantGesture
    );
  }

  // Alternate icon renderers (e.g. hand gestures registered by js/gestures.js)
  const iconRenderers = {};
  function registerIconRenderer(kind, fn) {
    iconRenderers[kind] = fn;
  }

  /**
   * Renders a crisp, high-contrast symbol icon centered at (cx, cy) within a
   * square box of `size` pixels. Supports optional animated progress (0..1)
   * for tutorial demonstrations!
   */
  function drawSymbolIcon(ctx, symbolId, cx, cy, size, options = {}) {
    const sym = SYMBOL_DEFINITIONS[symbolId];
    if (!sym) return;
    if (sym.isGesture && iconRenderers.gesture) {
      // Hand silhouettes need more room than thin rune strokes to stay legible in a balloon
      iconRenderers.gesture(ctx, symbolId, cx, cy, size * 1.3, options);
      return;
    }

    const {
      color = '#ffffff',
      glowColor = sym.color,
      lineWidth = Math.max(3, size * 0.115),
      progress = 1.0,
      highContrast = true,
      showDirectionDot = false,
      isDecoy = false
    } = options;

    const half = size / 2;
    const left = cx - half;
    const top = cy - half;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const strokePath = (pts, maxFrac) => {
      if (!pts || pts.length < 2) return;
      const count = Math.max(2, Math.ceil(pts.length * maxFrac));
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const px = left + pts[i][0] * size;
        const py = top + pts[i][1] * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    // 1. Dark high-contrast outline backing so symbol pops on any balloon color
    if (highContrast) {
      ctx.strokeStyle = 'rgba(8, 10, 22, 0.88)';
      ctx.lineWidth = lineWidth + 4.5;
      if (isDecoy) ctx.setLineDash([4, 4]);
      strokePath(sym.displayPath, progress);
      if (sym.secondaryDisplayPath && progress > 0.5) {
        strokePath(sym.secondaryDisplayPath, (progress - 0.5) * 2);
      }
    }

    // 2. Colored outer glow
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isDecoy ? 3 : 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (isDecoy) ctx.setLineDash([4, 4]);
    strokePath(sym.displayPath, progress);
    if (sym.secondaryDisplayPath && progress > 0.5) {
      strokePath(sym.secondaryDisplayPath, (progress - 0.5) * 2);
    }

    // 3. Optional starting dot for tutorial / Grimoire animations
    if (showDirectionDot && sym.displayPath.length > 0) {
      const startPt = sym.displayPath[0];
      const sx = left + startPt[0] * size;
      const sy = top + startPt[1] * size;
      ctx.fillStyle = glowColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(sx, sy, lineWidth * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  window.Aetherward.Symbols = {
    DEFINITIONS: SYMBOL_DEFINITIONS,
    getSymbolsByTiers,
    drawSymbolIcon,
    registerIconRenderer,
  };
})();
