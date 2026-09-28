/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Hybrid Gesture Recognizer (js/recognizer.js)
 * ============================================================================
 * Combines normalized $1/Protractor template matching with geometric feature
 * extraction (Ramer-Douglas-Peucker vertex detection, winding number, closure,
 * self-intersection count, and aspect ratio analysis) for fast, forgiving,
 * arcade-grade symbol recognition on both mouse and touch devices.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG.RECOGNIZER;
  const Symbols = window.Aetherward.Symbols;

  // --------------------------------------------------------------------------
  // GEOMETRY UTILITIES
  // --------------------------------------------------------------------------
  function dist(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return Math.hypot(dx, dy);
  }

  function pathLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += dist(pts[i - 1], pts[i]);
    }
    return len;
  }

  function getBoundingBox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    return {
      minX, minY, maxX, maxY,
      width, height,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      diagonal: Math.hypot(width, height)
    };
  }

  /**
   * Resamples a polyline into `n` evenly spaced points.
   */
  function resample(points, n) {
    if (points.length === 0) return [];
    if (points.length === 1) return Array(n).fill(points[0]);

    const totalLen = pathLength(points);
    if (totalLen < 1e-5) return Array(n).fill(points[0]);

    const interval = totalLen / (n - 1);
    let D = 0;
    const src = points.map(p => [p[0], p[1]]);
    const out = [[src[0][0], src[0][1]]];

    for (let i = 1; i < src.length; i++) {
      const d = dist(src[i - 1], src[i]);
      if (D + d >= interval) {
        const t = (interval - D) / d;
        const nx = src[i - 1][0] + t * (src[i][0] - src[i - 1][0]);
        const ny = src[i - 1][1] + t * (src[i][1] - src[i - 1][1]);
        const q = [nx, ny];
        out.push(q);
        src.splice(i, 0, q);
        D = 0;
      } else {
        D += d;
      }
    }

    while (out.length < n) {
      const last = src[src.length - 1];
      out.push([last[0], last[1]]);
    }
    return out.slice(0, n);
  }

  /**
   * Normalizes points into a [0..1] x [0..1] box.
   * Preserves aspect ratio if one dimension is much smaller than the other
   * (e.g. straight horizontal or vertical lines).
   */
  function normalizePoints(pts) {
    const bb = getBoundingBox(pts);
    const aspect = bb.width / bb.height;
    const preserveAspect = aspect > 2.4 || aspect < (1 / 2.4);
    const scaleX = preserveAspect ? Math.max(bb.width, bb.height) : bb.width;
    const scaleY = preserveAspect ? Math.max(bb.width, bb.height) : bb.height;

    return pts.map(([x, y]) => [
      0.5 + (x - bb.cx) / scaleX,
      0.5 + (y - bb.cy) / scaleY
    ]);
  }

  /**
   * Ramer-Douglas-Peucker polyline simplification for corner/vertex extraction.
   */
  function simplifyRDP(pts, epsilon) {
    if (pts.length <= 2) return pts.slice();

    let maxDist = 0;
    let index = 0;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const magSq = dx * dx + dy * dy;

    for (let i = 1; i < pts.length - 1; i++) {
      let d;
      if (magSq < 1e-6) {
        d = dist(pts[i], start);
      } else {
        const t = Math.max(0, Math.min(1, ((pts[i][0] - start[0]) * dx + (pts[i][1] - start[1]) * dy) / magSq));
        const proj = [start[0] + t * dx, start[1] + t * dy];
        d = dist(pts[i], proj);
      }
      if (d > maxDist) {
        index = i;
        maxDist = d;
      }
    }

    if (maxDist > epsilon) {
      const left = simplifyRDP(pts.slice(0, index + 1), epsilon);
      const right = simplifyRDP(pts.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    }
    return [start, end];
  }

  /**
   * Counts self-intersections along a resampled polyline.
   */
  function countSelfIntersections(pts) {
    let intersections = 0;
    const n = pts.length;
    for (let i = 0; i < n - 3; i++) {
      const a1 = pts[i], a2 = pts[i + 1];
      for (let j = i + 2; j < n - 1; j++) {
        // Ignore closing segment touching start
        if (i === 0 && j === n - 2) continue;
        const b1 = pts[j], b2 = pts[j + 1];
        if (segmentsIntersect(a1, a2, b1, b2)) {
          intersections++;
        }
      }
    }
    return intersections;
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  /**
   * Extracts rich geometric features from a normalized stroke.
   */
  function extractFeatures(rawPoints, normPoints) {
    const rawBB = getBoundingBox(rawPoints);
    const totalLen = pathLength(rawPoints);
    const endToEnd = dist(rawPoints[0], rawPoints[rawPoints.length - 1]);
    const straightness = endToEnd / Math.max(1, totalLen);
    const closureRatio = endToEnd / Math.max(1, rawBB.diagonal);

    // Compute total winding angle & absolute turning angle
    let signedTurn = 0;
    let absTurn = 0;
    let sharpCorners = 0;

    // Sample every 2nd point on normalized path for smooth angle integration
    const step = 2;
    for (let i = step; i < normPoints.length - step; i += step) {
      const pPrev = normPoints[i - step];
      const pCurr = normPoints[i];
      const pNext = normPoints[i + step];
      const a1 = Math.atan2(pCurr[1] - pPrev[1], pCurr[0] - pPrev[0]);
      const a2 = Math.atan2(pNext[1] - pCurr[1], pNext[0] - pCurr[0]);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      signedTurn += diff;
      absTurn += Math.abs(diff);
      if (Math.abs(diff) > 0.85) sharpCorners++;
    }

    // Simplify normalized path to detect primary polygon vertices
    const simplified = simplifyRDP(normPoints, 0.11);
    const segmentCount = simplified.length - 1;
    const intersections = countSelfIntersections(resample(normPoints, 24));

    // Measure radial roundness around centroid
    let meanRadius = 0;
    for (let i = 0; i < normPoints.length; i++) {
      meanRadius += dist(normPoints[i], [0.5, 0.5]);
    }
    meanRadius /= normPoints.length;
    let radialVariance = 0;
    for (let i = 0; i < normPoints.length; i++) {
      const dr = dist(normPoints[i], [0.5, 0.5]) - meanRadius;
      radialVariance += dr * dr;
    }
    radialVariance = Math.sqrt(radialVariance / normPoints.length) / Math.max(0.05, meanRadius);

    return {
      rawBB,
      totalLen,
      endToEnd,
      straightness,
      closureRatio,
      isClosed: closureRatio < 0.44,
      signedTurn,
      absTurn,
      sharpCorners,
      simplified,
      segmentCount,
      intersections,
      radialVariance,
      aspectRatio: rawBB.width / rawBB.height,
    };
  }

  // --------------------------------------------------------------------------
  // PRE-NORMALIZE TEMPLATES
  // --------------------------------------------------------------------------
  const compiledTemplates = {};

  function compileAllTemplates() {
    const n = CFG.RESAMPLE_POINTS;
    for (const [id, sym] of Object.entries(Symbols.DEFINITIONS)) {
      compiledTemplates[id] = sym.templates.map(tpl => {
        const resampled = resample(tpl, n);
        return normalizePoints(resampled);
      });
    }
  }
  compileAllTemplates();

  /**
   * Computes template match similarity in [0..1] against a symbol's templates.
   */
  function computeTemplateScore(symbolId, normStroke, isDirectional) {
    const templates = compiledTemplates[symbolId];
    if (!templates || templates.length === 0) return 0;

    let bestDist = Infinity;
    for (let t = 0; t < templates.length; t++) {
      const tpl = templates[t];
      // Forward match
      let sumF = 0;
      for (let i = 0; i < normStroke.length; i++) {
        sumF += dist(normStroke[i], tpl[i]);
      }
      const avgF = sumF / normStroke.length;
      if (avgF < bestDist) bestDist = avgF;

      // Also check reversed stroke order unless directional
      if (!isDirectional) {
        let sumR = 0;
        const len = normStroke.length;
        for (let i = 0; i < len; i++) {
          sumR += dist(normStroke[len - 1 - i], tpl[i]);
        }
        const avgR = sumR / len;
        if (avgR < bestDist) bestDist = avgR;
      }
    }

    // Map average point distance (typically 0.04 to 0.45) to a [0..1] score
    return Math.max(0, Math.min(1, 1 - bestDist / 0.44));
  }

  /**
   * Applies geometric domain knowledge per symbol to boost clear structural
   * matches and filter out look-alike false positives.
   */
  function computeGeometricAdjustment(symbolId, f, normPts, rawPts) {
    const start = normPts[0];
    const end = normPts[normPts.length - 1];
    const mid = normPts[Math.floor(normPts.length / 2)];
    const simp = f.simplified;

    switch (symbolId) {
      case 'horizontal': {
        if (f.straightness < 0.78) return -0.5;
        const dx = Math.abs(rawPts[rawPts.length - 1][0] - rawPts[0][0]);
        const dy = Math.abs(rawPts[rawPts.length - 1][1] - rawPts[0][1]);
        if (dx > dy * 1.65 && f.straightness > 0.82) return 0.35;
        return -0.4;
      }

      case 'vertical': {
        if (f.straightness < 0.78) return -0.5;
        const dx = Math.abs(rawPts[rawPts.length - 1][0] - rawPts[0][0]);
        const dy = Math.abs(rawPts[rawPts.length - 1][1] - rawPts[0][1]);
        if (dy > dx * 1.65 && f.straightness > 0.82) return 0.35;
        return -0.4;
      }

      case 'v_down': {
        if (f.straightness > 0.84 || f.isClosed) return -0.35;
        if (f.segmentCount >= 2 && f.segmentCount <= 3) {
          // Both ends near top, middle vertex near bottom
          const endsHigh = start[1] < 0.55 && end[1] < 0.55;
          let lowestY = 0;
          for (const p of simp) if (p[1] > lowestY) lowestY = p[1];
          if (endsHigh && lowestY > 0.72) return 0.26;
        }
        return -0.15;
      }

      case 'v_up': {
        if (f.straightness > 0.84 || f.isClosed) return -0.35;
        if (f.segmentCount >= 2 && f.segmentCount <= 3) {
          // Both ends near bottom, middle vertex near top
          const endsLow = start[1] > 0.45 && end[1] > 0.45;
          let highestY = 1;
          for (const p of simp) if (p[1] < highestY) highestY = p[1];
          if (endsLow && highestY < 0.28) return 0.26;
        }
        return -0.15;
      }

      case 'circle': {
        if (f.straightness > 0.65) return -0.5;
        const turns = Math.abs(f.signedTurn) / (Math.PI * 2);
        // Must be roughly 1 full loop (not 1.6+ turns which is a spiral)
        if (turns >= 0.68 && turns <= 1.38 && f.closureRatio < 0.52) {
          if (f.sharpCorners >= 3) return -0.18; // Polygon with sharp corners
          if (f.radialVariance < 0.16 && f.sharpCorners <= 1) return 0.26;
          return 0.08;
        }
        if (turns > 1.45) return -0.35; // Spiral, not circle
        return -0.2;
      }

      case 'triangle': {
        if (f.straightness > 0.65) return -0.5;
        if (f.closureRatio < 0.52 && f.segmentCount >= 3 && f.segmentCount <= 4) {
          if (f.sharpCorners >= 2 && f.radialVariance >= 0.14) return 0.24;
          return 0.12;
        }
        return -0.15;
      }

      case 'square': {
        if (f.straightness > 0.65) return -0.5;
        if (f.closureRatio < 0.52 && f.segmentCount >= 4 && f.segmentCount <= 5 && f.intersections === 0) {
          // Check axis alignment of segments compared to diamond
          let axisAlignedEdges = 0;
          for (let i = 1; i < simp.length; i++) {
            const ang = Math.abs(Math.atan2(simp[i][1] - simp[i - 1][1], simp[i][0] - simp[i - 1][0]));
            const mod90 = Math.min(ang % (Math.PI / 2), (Math.PI / 2) - (ang % (Math.PI / 2)));
            if (mod90 < 0.36) axisAlignedEdges++;
          }
          if (axisAlignedEdges >= 3) return 0.28;
        }
        return -0.15;
      }

      case 'diamond': {
        if (f.straightness > 0.65) return -0.5;
        if (f.closureRatio < 0.52 && f.segmentCount >= 4 && f.segmentCount <= 5 && f.intersections === 0) {
          let diagEdges = 0;
          for (let i = 1; i < simp.length; i++) {
            const ang = Math.abs(Math.atan2(simp[i][1] - simp[i - 1][1], simp[i][0] - simp[i - 1][0]));
            const distFrom45 = Math.abs((ang % (Math.PI / 2)) - Math.PI / 4);
            if (distFrom45 < 0.36) diagEdges++;
          }
          if (diagEdges >= 3) return 0.28;
        }
        return -0.15;
      }

      case 'zigzag': {
        if (f.isClosed || f.straightness > 0.78) return -0.35;
        if (f.segmentCount === 3 && f.sharpCorners >= 2) return 0.26;
        return -0.1;
      }

      case 'spiral': {
        const turns = Math.abs(f.signedTurn) / (Math.PI * 2);
        if (turns >= 1.38) return 0.34;
        if (f.absTurn / (Math.PI * 2) >= 1.55 && !f.isClosed) return 0.22;
        return -0.35;
      }

      case 'star': {
        if (f.segmentCount >= 4 && (f.intersections >= 2 || f.sharpCorners >= 3)) {
          return 0.28;
        }
        return -0.2;
      }

      case 'double_zigzag': {
        if (f.isClosed || f.straightness > 0.75) return -0.35;
        if (f.segmentCount >= 4 && f.sharpCorners >= 3 && f.intersections === 0) {
          return 0.28;
        }
        return -0.15;
      }

      case 'hourglass': {
        if (f.intersections >= 1 && f.closureRatio < 0.58 && f.segmentCount >= 4 && f.segmentCount <= 5) {
          return 0.28;
        }
        return -0.15;
      }

      case 'loop_line': {
        if (!f.isClosed && f.intersections >= 1 && f.absTurn > Math.PI * 1.1) {
          return 0.30;
        }
        return -0.20;
      }

      case 'cross_rune': {
        if (f.intersections >= 1 && f.segmentCount >= 3) {
          return 0.22;
        }
        return -0.15;
      }

      case 'c_left': {
        // Open curve bowing left (midpoint X < average of start/end X)
        if (f.isClosed || f.straightness > 0.82) return -0.4;
        const avgEndX = (start[0] + end[0]) / 2;
        const endVertSpan = Math.abs(end[1] - start[1]);
        if (mid[0] < avgEndX - 0.22 && endVertSpan > 0.45 && f.sharpCorners <= 2) {
          return 0.30;
        }
        return -0.25;
      }

      case 'c_right': {
        // Open curve bowing right (midpoint X > average of start/end X)
        if (f.isClosed || f.straightness > 0.82) return -0.4;
        const avgEndX = (start[0] + end[0]) / 2;
        const endVertSpan = Math.abs(end[1] - start[1]);
        if (mid[0] > avgEndX + 0.22 && endVertSpan > 0.45 && f.sharpCorners <= 2) {
          return 0.30;
        }
        return -0.25;
      }

      case 's_curve': {
        if (f.isClosed || f.straightness > 0.80) return -0.35;
        // S-curve has low net signed turn (turns left then right) but high absolute turn
        if (Math.abs(f.signedTurn) < Math.PI * 0.9 && f.absTurn > Math.PI * 1.15 && f.sharpCorners <= 2) {
          return 0.25;
        }
        return -0.1;
      }

      case 'omega': {
        // Starts and ends low (y > 0.60), arches high in the middle (y < 0.30), no self-intersection
        if (start[1] > 0.60 && end[1] > 0.60 && mid[1] < 0.30 && !f.isClosed && f.intersections === 0) {
          return 0.28;
        }
        return -0.20;
      }

      default:
        return 0;
    }
  }

  // ==========================================================================
  // PUBLIC RECOGNIZER CLASS
  // ==========================================================================
  class GestureRecognizer {
    constructor() {
      this.previousStroke = null; // Stores recent stroke for 2-stroke '+' cross combos
    }

    /**
     * Recognizes a player's drawn stroke.
     * @param {Array<[number, number]>} rawPoints - Array of [x, y] canvas coordinates
     * @param {Object} options
     * @param {Set<string>} options.activeSymbols - Symbol IDs currently active on balloons
     * @param {boolean} options.isTouch - Whether input came from touch/pen
     * @param {boolean} options.extraForgiving - Accessibility setting for lenient matching
     * @returns {{ symbolId: string|null, confidence: number, candidates: Array, isMultiStroke: boolean }}
     */
    recognize(rawPoints, options = {}) {
      const {
        activeSymbols = new Set(),
        isTouch = false,
        extraForgiving = false,
      } = options;

      if (!rawPoints || rawPoints.length < CFG.MIN_POINTS) {
        return { symbolId: null, confidence: 0, candidates: [], tooShort: true };
      }

      const len = pathLength(rawPoints);
      if (len < CFG.MIN_PATH_LENGTH) {
        return { symbolId: null, confidence: 0, candidates: [], tooShort: true };
      }

      const now = performance.now();

      // Check if this stroke completes a 2-stroke `cross_rune` (+) with the previous stroke
      if (
        this.previousStroke &&
        (activeSymbols.size === 0 || activeSymbols.has('cross_rune')) &&
        now - this.previousStroke.timestamp <= CFG.MULTI_STROKE_WINDOW_MS
      ) {
        const prev = this.previousStroke;
        const currResampled = resample(rawPoints, CFG.RESAMPLE_POINTS);
        const currNorm = normalizePoints(currResampled);
        const currFeat = extractFeatures(rawPoints, currNorm);

        const prevIsH = prev.topSymbol === 'horizontal';
        const prevIsV = prev.topSymbol === 'vertical';
        const currIsH = computeGeometricAdjustment('horizontal', currFeat, currNorm, rawPoints) > 0.2;
        const currIsV = computeGeometricAdjustment('vertical', currFeat, currNorm, rawPoints) > 0.2;

        if ((prevIsH && currIsV) || (prevIsV && currIsH)) {
          // Verify that their bounding boxes overlap/intersect in screen space
          const b1 = prev.rawBB;
          const b2 = currFeat.rawBB;
          const overlapX = b1.minX <= b2.maxX + 40 && b1.maxX >= b2.minX - 40;
          const overlapY = b1.minY <= b2.maxY + 40 && b1.maxY >= b2.minY - 40;
          if (overlapX && overlapY) {
            this.previousStroke = null;
            return {
              symbolId: 'cross_rune',
              confidence: 0.96,
              candidates: [{ symbolId: 'cross_rune', score: 0.96 }],
              isMultiStroke: true
            };
          }
        }
      }

      // Standard single-stroke hybrid recognition
      const resampled = resample(rawPoints, CFG.RESAMPLE_POINTS);
      const normPts = normalizePoints(resampled);
      const features = extractFeatures(rawPoints, normPts);

      const candidates = [];
      for (const [id, sym] of Object.entries(Symbols.DEFINITIONS)) {
        const tplScore = computeTemplateScore(id, normPts, Boolean(sym.directional));
        const geoBonus = computeGeometricAdjustment(id, features, normPts, rawPoints);
        const activeBoost = activeSymbols.has(id) ? CFG.ACTIVE_ON_SCREEN_BOOST : 0;

        const unclamped = tplScore + geoBonus + activeBoost;
        const totalScore = Math.max(0, Math.min(1, unclamped));
        candidates.push({
          symbolId: id,
          name: sym.name,
          score: totalScore,
          unclamped,
          rawScore: tplScore + geoBonus,
          isActive: activeSymbols.has(id)
        });
      }

      candidates.sort((a, b) => b.unclamped - a.unclamped);
      const best = candidates[0];

      // Determine threshold based on input type & settings
      let threshold = CFG.BASE_MATCH_THRESHOLD;
      if (isTouch) threshold -= CFG.TOUCH_FORGIVENESS_BONUS;
      if (extraForgiving) threshold -= 0.06;

      const matchedId = best && best.score >= threshold ? best.symbolId : null;

      // Record stroke if it's a horizontal or vertical line so user can cross it into '+'
      if (matchedId === 'horizontal' || matchedId === 'vertical') {
        this.previousStroke = {
          topSymbol: matchedId,
          rawBB: features.rawBB,
          timestamp: now,
        };
      } else {
        this.previousStroke = null;
      }

      return {
        symbolId: matchedId,
        confidence: best ? best.score : 0,
        candidates: candidates.slice(0, 4),
        isMultiStroke: false,
        features,
      };
    }
  }

  window.Aetherward.GestureRecognizer = GestureRecognizer;
})();
