/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Camera Recognition & Hand Tracking (js/camera.js)
 * ============================================================================
 * Provides local in-browser webcam hand & index-fingertip tracking using
 * MediaPipe Hands (with automatic local computer-vision fallback), velocity-
 * adaptive coordinate smoothing, multi-hand consistency locking, and a full
 * pre-game Setup -> Hand Detection -> Calibration -> 3-2-1-GO state machine.
 *
 * PRIVACY: All video processing happens 100% locally in the browser memory.
 * No video frames are ever recorded, stored, or transmitted externally.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  // MediaPipe Hands 21-landmark connections for skeleton visualization
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index finger (8 = Index Tip)
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17]             // Palm knuckles
  ];

  class CameraController {
    constructor(audio) {
      this.audio = audio;

      // Control mode flag ('standard' | 'camera')
      this.controlMode = 'standard';
      this.isRunning = false;
      this.stream = null;
      this.videoEl = null;
      this.mpHands = null;
      this.mpLoaded = false;
      this.mpLoading = false;
      this.processingFrame = false;

      // User-configurable Camera Settings
      this.settings = {
        showWebcamPreview: true,
        showSkeletonOverlay: true,
        pauseOnHandLost: true,     // Freezes enemies/timer if hand is lost > 0.55s
        gestureMode: 'point_dwell' // 'point_dwell' (Point & pause/curl) | 'pinch' (Thumb-index pinch)
      };

      // Hand & Index Fingertip Tracking State
      this.handDetected = false;
      this.confidence = 0;
      this.handLostSeconds = 0;
      this.stableDetectionSeconds = 0;
      this.lastDetectionTime = 0;

      // Normalized mirrored coordinates [0..1] in camera space
      this.rawTipX = 0.5;
      this.rawTipY = 0.5;
      this.lockedWrist = null; // Used to maintain consistency when multiple hands appear
      this.landmarks = null;

      // Mapped & smoothed game-screen coordinates [0..width, 0..height]
      this.screenX = window.innerWidth / 2;
      this.screenY = window.innerHeight / 2;
      this.velocity = 0;

      // Explicit Hand-Gesture State Machine:
      // 'READY'       -> Index finger extended, waiting to begin a new stroke (active path is empty)
      // 'DRAWING'     -> Index finger extended & recording trajectory into airStrokePoints
      // 'FINALIZING'  -> Transient state that submits completed path and clears airStrokePoints
      // 'CLOSED_HAND' -> Hand closed into a fist; stops recording and ignores all movement until index re-opens
      this.gestureState = 'READY';
      this.isFingerDrawing = false;
      this.isPointingGesture = true;

      // Debounce / State-Stability Filter for Hand Posture ('INDEX_EXTENDED' vs 'CLOSED_HAND')
      this.rawPosture = 'INDEX_EXTENDED';
      this.confirmedPosture = 'INDEX_EXTENDED';
      this.candidatePosture = null;
      this.candidatePostureFrames = 0;
      this.CLOSE_DEBOUNCE_FRAMES = 3; // Consecutive closed-hand frames required to confirm CLOSED_HAND
      this.OPEN_DEBOUNCE_FRAMES = 3;  // Consecutive open-index frames required to confirm INDEX_EXTENDED

      // Fallback Dwell / Pause Completion & Thresholds
      this.dwellTimer = 0;
      this.DWELL_FINALIZE_SECONDS = 0.48; // Fallback pause duration if player holds finger still
      this.MIN_DRAW_SPEED = 36;           // Pixels/sec movement to transition READY -> DRAWING
      this.STILL_SPEED_THRESHOLD = 60;    // Pixels/sec below which fallback dwell timer accumulates
      this.airStrokePoints = [];
      this.cooldownAfterCast = 0;
      this.awaitingFreshMoveAfterFallback = false;

      // Visual Feedback State for "Gesture Submitted" / State Indicator
      this.submittedFeedbackTimer = 0;
      this.submittedFeedbackPos = null;
      this.lastSubmittedPointCount = 0;

      // Setup & Calibration State Machine
      // 'idle' | 'permission' | 'detect_hand' | 'calibrate' | 'countdown' | 'ready' | 'error'
      this.setupStage = 'idle';
      this.calibrationWaypoints = [];
      this.calibrationTrail = [];
      this.countdownRemaining = 3.0;
      this.onSetupCompleteCallback = null;

      // Callbacks into Game
      this.onAirStrokeCompleted = null;

      this._initDOMReferences();
    }

    _initDOMReferences() {
      this.videoEl = document.getElementById('camera-hidden-video');
      this.setupModal = document.getElementById('modal-camera-setup');
      this.setupCanvas = document.getElementById('camera-setup-canvas');
      this.setupCtx = this.setupCanvas ? this.setupCanvas.getContext('2d') : null;
      this.setupStatusBadge = document.getElementById('camera-setup-stage-badge');
      this.setupHeadline = document.getElementById('camera-setup-headline');
      this.setupSubtext = document.getElementById('camera-setup-subtext');
      this.setupProgressFill = document.getElementById('camera-setup-progress-fill');
      this.setupCountdownOverlay = document.getElementById('camera-countdown-overlay');

      // In-Game PiP Widget
      this.pipContainer = document.getElementById('hud-camera-pip');
      this.pipCanvas = document.getElementById('camera-pip-canvas');
      this.pipCtx = this.pipCanvas ? this.pipCanvas.getContext('2d') : null;
      this.pipConfidenceText = document.getElementById('pip-confidence-text');
      this.pipStateDot = document.getElementById('pip-state-dot');
      this.handLostBanner = document.getElementById('hud-hand-lost-banner');

      // Bind PiP & Setup UI buttons
      const btnCancelSetup = document.getElementById('btn-cancel-camera-setup');
      if (btnCancelSetup) {
        btnCancelSetup.addEventListener('click', () => {
          this.audio.playUIClick();
          this.closeSetupModal();
        });
      }

      const btnSkipCalib = document.getElementById('btn-skip-calibration');
      if (btnSkipCalib) {
        btnSkipCalib.addEventListener('click', () => {
          if (this.handDetected && this.setupStage === 'calibrate') {
            this.audio.playUIClick();
            this._enterCountdownStage();
          }
        });
      }

      const btnTogglePipVideo = document.getElementById('btn-pip-toggle-video');
      if (btnTogglePipVideo) {
        btnTogglePipVideo.addEventListener('click', e => {
          e.stopPropagation();
          this.settings.showWebcamPreview = !this.settings.showWebcamPreview;
          btnTogglePipVideo.classList.toggle('active', this.settings.showWebcamPreview);
        });
      }

      const btnTogglePipOverlay = document.getElementById('btn-pip-toggle-skeleton');
      if (btnTogglePipOverlay) {
        btnTogglePipOverlay.addEventListener('click', e => {
          e.stopPropagation();
          this.settings.showSkeletonOverlay = !this.settings.showSkeletonOverlay;
          btnTogglePipOverlay.classList.toggle('active', this.settings.showSkeletonOverlay);
          if (this.pipCanvas) {
            this.pipCanvas.classList.toggle('hidden', !this.settings.showSkeletonOverlay);
          }
        });
      }
    }

    isCameraModeEnabled() {
      return this.controlMode === 'camera';
    }

    setControlMode(mode) {
      this.controlMode = mode === 'camera' ? 'camera' : 'standard';
      if (this.controlMode === 'standard') {
        this.stopCamera();
        if (this.pipContainer) this.pipContainer.classList.add('hidden');
        if (this.handLostBanner) this.handLostBanner.classList.add('hidden');
      }
    }

    // ------------------------------------------------------------------------
    // 1. CAMERA & MEDIAPIPE INITIALIZATION
    // ------------------------------------------------------------------------
    async startCameraAndSetupFlow(onReadyToStartGame) {
      this.onSetupCompleteCallback = onReadyToStartGame;
      this.setupStage = 'permission';
      this.stableDetectionSeconds = 0;
      this.handDetected = false;
      this._resetGestureStateMachine('READY');

      if (this.setupModal) {
        this.setupModal.classList.remove('hidden');
      }
      this._updateSetupUI(
        'STEP 1 OF 3 • CAMERA PERMISSION',
        'ALLOW CAMERA ACCESS',
        'Please grant webcam permission in your browser. Video is processed 100% locally for hand tracking.',
        10
      );

      try {
        if (!this.stream) {
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 480 },
              height: { ideal: 360 },
              frameRate: { ideal: 30, max: 60 },
              facingMode: 'user'
            },
            audio: false
          });
          this.videoEl.srcObject = this.stream;
          await this.videoEl.play();
        }

        this._updateSetupUI(
          'INITIALIZING HAND TRACKER...',
          'LOADING ARCANE VISION MODEL',
          'Preparing real-time 21-point hand landmark detector...',
          25
        );

        await this._ensureMediaPipeHandsLoaded();

        this.isRunning = true;
        this._enterDetectHandStage();
        this._pumpDetectionLoop();
      } catch (err) {
        this.setupStage = 'error';
        this._updateSetupUI(
          'CAMERA UNAVAILABLE',
          'CAMERA ACCESS DENIED OR NOT FOUND',
          'Could not access a webcam. Please check browser permissions or switch to Standard (Mouse / Touch) control.',
          0
        );
      }
    }

    async _ensureMediaPipeHandsLoaded() {
      if (this.mpLoaded && this.mpHands) return;
      if (this.mpLoading) {
        while (this.mpLoading) {
          await new Promise(r => setTimeout(r, 80));
        }
        return;
      }

      this.mpLoading = true;
      try {
        if (!window.Hands) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
            script.crossOrigin = 'anonymous';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        if (window.Hands) {
          this.mpHands = new window.Hands({
            locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
          });
          this.mpHands.setOptions({
            maxNumHands: 2,
            modelComplexity: 0, // Lite model for ultra-fast 60fps arcade responsiveness
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55
          });
          this.mpHands.onResults(results => this._onMediaPipeResults(results));
          this.mpLoaded = true;
        }
      } catch (err) {
        // If CDN is unreachable offline, we fall back to our built-in local motion/color tracker
        console.warn('MediaPipe Hands CDN unreachable, using built-in local motion tracker fallback.', err);
        this.mpLoaded = false;
      } finally {
        this.mpLoading = false;
      }
    }

    stopCamera() {
      this.isRunning = false;
      this.handDetected = false;
      this._resetGestureStateMachine('READY');
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      if (this.videoEl) {
        this.videoEl.srcObject = null;
      }
    }

    closeSetupModal() {
      if (this.setupModal) {
        this.setupModal.classList.add('hidden');
      }
      if (this.setupCountdownOverlay) {
        this.setupCountdownOverlay.classList.add('hidden');
      }
      this.setupStage = 'idle';
    }

    // ------------------------------------------------------------------------
    // 2. SETUP & CALIBRATION STATE MACHINE
    // ------------------------------------------------------------------------
    _enterDetectHandStage() {
      this.setupStage = 'detect_hand';
      this.stableDetectionSeconds = 0;
      if (this.setupCountdownOverlay) {
        this.setupCountdownOverlay.classList.add('hidden');
      }
      const skipBtn = document.getElementById('btn-skip-calibration');
      if (skipBtn) skipBtn.classList.add('hidden');

      this._updateSetupUI(
        'STEP 2 OF 3 • HAND DETECTION',
        'SHOW YOUR HAND TO THE CAMERA',
        'Hold your hand up in front of the camera and point with your index finger.',
        30
      );
    }

    _enterCalibrationStage() {
      this.setupStage = 'calibrate';
      this.audio.playBalloonPop(3);

      // Create 3 calibration waypoints arranged in a comfortable triangle/circle
      this.calibrationWaypoints = [
        { nx: 0.50, ny: 0.25, label: '1', reached: false },
        { nx: 0.74, ny: 0.65, label: '2', reached: false },
        { nx: 0.26, ny: 0.65, label: '3', reached: false }
      ];
      this.calibrationTrail = [];

      const skipBtn = document.getElementById('btn-skip-calibration');
      if (skipBtn) skipBtn.classList.remove('hidden');

      this._updateSetupUI(
        'STEP 3 OF 3 • FINGER CALIBRATION',
        'HAND DETECTED — MOVE YOUR INDEX FINGER',
        'Guide your glowing index fingertip through the 3 arcane targets (1 → 2 → 3) to verify smooth tracking!',
        65
      );
    }

    _enterCountdownStage() {
      this.setupStage = 'countdown';
      this.countdownRemaining = 3.2;
      this.lastCountdownBeepInt = 4;
      const skipBtn = document.getElementById('btn-skip-calibration');
      if (skipBtn) skipBtn.classList.add('hidden');

      this._updateSetupUI(
        'CALIBRATION COMPLETE',
        'CAMERA READY!',
        'Open index finger to draw • Close hand into a fist to submit each rune! Starting in 3, 2, 1, GO!',
        100
      );

      if (this.setupCountdownOverlay) {
        this.setupCountdownOverlay.classList.remove('hidden');
        this.setupCountdownOverlay.textContent = '3';
      }
    }

    _updateSetupUI(badgeText, headline, subtext, progressPct) {
      if (this.setupStatusBadge) this.setupStatusBadge.textContent = badgeText;
      if (this.setupHeadline) this.setupHeadline.textContent = headline;
      if (this.setupSubtext) this.setupSubtext.textContent = subtext;
      if (this.setupProgressFill) this.setupProgressFill.style.width = `${progressPct}%`;
    }

    // ------------------------------------------------------------------------
    // 3. REAL-TIME LANDMARK DETECTION, POSTURE CLASSIFICATION & DEBOUNCE
    // ------------------------------------------------------------------------
    async _pumpDetectionLoop() {
      if (!this.isRunning) return;

      if (
        this.videoEl &&
        this.videoEl.readyState >= 2 &&
        !this.processingFrame
      ) {
        this.processingFrame = true;
        try {
          if (this.mpLoaded && this.mpHands) {
            await this.mpHands.send({ image: this.videoEl });
          } else {
            this._runFallbackMotionTracker();
          }
        } catch (_) {
          // Ignore transient frame errors
        }
        this.processingFrame = false;
      }

      if (this.isRunning) {
        requestAnimationFrame(() => this._pumpDetectionLoop());
      }
    }

    _onMediaPipeResults(results) {
      const hands = results.multiHandLandmarks;
      if (!hands || hands.length === 0) {
        this._markHandLost();
        return;
      }

      // Select primary hand consistently:
      // Prefer the hand closest to our previously tracked wrist, or closest to center (0.5, 0.5)
      let chosenHand = hands[0];
      let chosenIdx = 0;

      if (hands.length > 1) {
        let bestScore = Infinity;
        for (let i = 0; i < hands.length; i++) {
          const wrist = hands[i][0];
          const wx = 1 - wrist.x; // Mirrored X
          const wy = wrist.y;
          let d;
          if (this.lockedWrist && this.handDetected) {
            d = Math.hypot(wx - this.lockedWrist.x, wy - this.lockedWrist.y);
          } else {
            d = Math.hypot(wx - 0.5, wy - 0.5);
          }
          if (d < bestScore) {
            bestScore = d;
            chosenHand = hands[i];
            chosenIdx = i;
          }
        }
      }

      const handednessScore =
        results.multiHandedness &&
        results.multiHandedness[chosenIdx] &&
        results.multiHandedness[chosenIdx].score
          ? results.multiHandedness[chosenIdx].score
          : 0.92;

      this.confidence = handednessScore;
      this.landmarks = chosenHand;
      this.lockedWrist = { x: 1 - chosenHand[0].x, y: chosenHand[0].y };

      // Classify raw hand posture ('INDEX_EXTENDED' vs 'CLOSED_HAND') and pass through debounce filter
      const wasHandDetected = this.handDetected;
      const detectedPosture = this._classifyRawHandPosture(chosenHand);
      const prevConfirmedPosture = this.confirmedPosture;
      this._updatePostureDebounce(detectedPosture);

      // During candidate-closed debounce frames (while confirmedPosture is still INDEX_EXTENDED
      // but rawPosture is CLOSED_HAND), freeze coordinate updates so the physical curling of
      // the index finger into a fist never pulls the cursor or distorts the stroke path!
      if (this.confirmedPosture === 'INDEX_EXTENDED' && detectedPosture === 'CLOSED_HAND') {
        this.handDetected = true;
        this.handLostSeconds = 0;
        this.lastDetectionTime = performance.now();
        return;
      }

      // Track landmark 8 (index tip) when extended, or landmark 5 (index knuckle) when fist is closed
      const trackedLandmark =
        this.confirmedPosture === 'CLOSED_HAND' ? chosenHand[5] : chosenHand[8];
      const mirroredX = 1 - trackedLandmark.x;
      const mirroredY = trackedLandmark.y;

      // Snap cursor cleanly when hand first appears or when transitioning CLOSED_HAND -> INDEX_EXTENDED
      const snapToNewPosition =
        !wasHandDetected ||
        (prevConfirmedPosture === 'CLOSED_HAND' && this.confirmedPosture === 'INDEX_EXTENDED');

      this._updateTrackedCoordinates(mirroredX, mirroredY, snapToNewPosition);
    }

    /**
     * Classifies the raw single-frame hand posture into:
     * - 'INDEX_EXTENDED': Index finger is open/extended for drawing
     * - 'CLOSED_HAND':    Hand is closed into a fist (or index finger curled), signaling "end drawing"
     */
    _classifyRawHandPosture(lm) {
      const wrist = lm[0];
      const thumbTip = lm[4];
      const indexMCP = lm[5];
      const indexPIP = lm[6];
      const indexDIP = lm[7] || lm[6];
      const indexTip = lm[8];

      if (this.settings.gestureMode === 'pinch') {
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        return pinchDist < 0.075 ? 'INDEX_EXTENDED' : 'CLOSED_HAND';
      }

      // Scale-invariant reference: distance from wrist to index MCP knuckle
      const palmSize = Math.max(0.04, Math.hypot(indexMCP.x - wrist.x, indexMCP.y - wrist.y));
      const tipToWrist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      const pipToWrist = Math.hypot(indexPIP.x - wrist.x, indexPIP.y - wrist.y);
      const dipToWrist = Math.hypot(indexDIP.x - wrist.x, indexDIP.y - wrist.y);
      const tipToMcp = Math.hypot(indexTip.x - indexMCP.x, indexTip.y - indexMCP.y);

      // Index finger is extended if its tip extends clearly beyond its PIP/DIP joints and knuckle
      const indexExtended =
        tipToWrist > pipToWrist * 1.05 &&
        tipToWrist >= dipToWrist * 1.01 &&
        tipToWrist > palmSize * 1.24 &&
        tipToMcp > palmSize * 0.48;

      return indexExtended ? 'INDEX_EXTENDED' : 'CLOSED_HAND';
    }

    /**
     * Debounces raw posture classifications across consecutive frames so single-frame
     * landmark jitter never prematurely ends or starts a gesture.
     */
    _updatePostureDebounce(rawPosture) {
      this.rawPosture = rawPosture;

      if (rawPosture === this.confirmedPosture) {
        this.candidatePosture = null;
        this.candidatePostureFrames = 0;
        this.isPointingGesture = this.confirmedPosture === 'INDEX_EXTENDED';
        return;
      }

      if (this.candidatePosture === rawPosture) {
        this.candidatePostureFrames++;
      } else {
        this.candidatePosture = rawPosture;
        this.candidatePostureFrames = 1;
      }

      const requiredFrames =
        rawPosture === 'CLOSED_HAND' ? this.CLOSE_DEBOUNCE_FRAMES : this.OPEN_DEBOUNCE_FRAMES;

      if (this.candidatePostureFrames >= requiredFrames) {
        this.confirmedPosture = rawPosture;
        this.candidatePosture = null;
        this.candidatePostureFrames = 0;
      }

      this.isPointingGesture = this.confirmedPosture === 'INDEX_EXTENDED';
    }

    /**
     * Built-in fallback tracker if offline / CDN blocked: tracks the highest
     * moving bright/skin-toned fingertip blob in the webcam feed.
     */
    _runFallbackMotionTracker() {
      if (!this._fallbackCanvas) {
        this._fallbackCanvas = document.createElement('canvas');
        this._fallbackCanvas.width = 80;
        this._fallbackCanvas.height = 60;
        this._fallbackCtx = this._fallbackCanvas.getContext('2d', { willReadFrequently: true });
      }
      const w = 80, h = 60;
      const ctx = this._fallbackCtx;
      ctx.drawImage(this.videoEl, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h).data;

      let count = 0;
      let topY = h, topX = w / 2;
      let minY = h, maxY = 0;

      for (let y = 4; y < h - 4; y++) {
        for (let x = 4; x < w - 4; x++) {
          const i = (y * w + x) * 4;
          const r = frame[i], g = frame[i + 1], b = frame[i + 2];
          if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - Math.min(g, b)) > 18) {
            count++;
            if (y < topY) {
              topY = y;
              topX = x;
            }
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (count > 28) {
        const mx = 1 - (topX / w);
        const my = topY / h;
        this.confidence = 0.82;
        // Aspect heuristic for fallback: tall contour = extended finger, compact = closed fist
        const verticalSpan = maxY - minY;
        const rawPosture = verticalSpan >= 14 ? 'INDEX_EXTENDED' : 'CLOSED_HAND';
        this._updatePostureDebounce(rawPosture);
        this.landmarks = null;
        this._updateTrackedCoordinates(mx, my, false);
      } else {
        this._markHandLost();
      }
    }

    _markHandLost() {
      this.handDetected = false;
      this.confidence = 0;
      this.landmarks = null;
      // Discard incomplete stroke without penalty if hand leaves camera view mid-drawing
      this._resetGestureStateMachine('READY');
    }

    _resetGestureStateMachine(targetState = 'READY') {
      this.gestureState = targetState;
      this.isFingerDrawing = targetState === 'DRAWING';
      this.airStrokePoints = [];
      this.dwellTimer = 0;
      this.candidatePosture = null;
      this.candidatePostureFrames = 0;
      this.awaitingFreshMoveAfterFallback = false;
    }

    _updateTrackedCoordinates(mirroredNormX, mirroredNormY, snapImmediately = false) {
      this.handDetected = true;
      this.handLostSeconds = 0;
      this.lastDetectionTime = performance.now();

      this.rawTipX = mirroredNormX;
      this.rawTipY = mirroredNormY;

      // Map comfortable inner camera box [0.14..0.86] x [0.15..0.85] to full screen [0..W, 0..H]
      const marginX = 0.14;
      const marginY = 0.15;
      const clampedX = Math.max(0, Math.min(1, (mirroredNormX - marginX) / (1 - marginX * 2)));
      const clampedY = Math.max(0, Math.min(1, (mirroredNormY - marginY) / (1 - marginY * 2)));

      const targetX = clampedX * window.innerWidth;
      const targetY = clampedY * window.innerHeight;

      if (snapImmediately) {
        this.screenX = targetX;
        this.screenY = targetY;
        this.velocity = 0;
        return;
      }

      // Velocity-adaptive exponential smoothing (reduces jitter when still, ultra-snappy when moving)
      const distDelta = Math.hypot(targetX - this.screenX, targetY - this.screenY);
      const alpha = distDelta > 28 ? 0.68 : (distDelta > 10 ? 0.48 : 0.28);

      const prevX = this.screenX;
      const prevY = this.screenY;
      this.screenX = prevX + (targetX - prevX) * alpha;
      this.screenY = prevY + (targetY - prevY) * alpha;

      this.velocity = Math.hypot(this.screenX - prevX, this.screenY - prevY) * 30;
    }

    // ------------------------------------------------------------------------
    // 4. PER-FRAME UPDATE (Setup Calibration + Explicit Hand-State Machine)
    // ------------------------------------------------------------------------
    update(dt, isGameplayActive) {
      if (!this.isRunning) return;

      if (this.submittedFeedbackTimer > 0) {
        this.submittedFeedbackTimer = Math.max(0, this.submittedFeedbackTimer - dt);
      }

      // Check if detector hasn't reported a hand in >260ms
      if (this.handDetected && performance.now() - this.lastDetectionTime > 260) {
        this._markHandLost();
      }

      if (!this.handDetected) {
        this.handLostSeconds += dt;
      }

      // A. Update Setup & Calibration Modal if open
      if (this.setupStage !== 'idle' && this.setupStage !== 'ready') {
        this._updateSetupStateMachine(dt);
        this._renderSetupCanvas();
        return;
      }

      // B. Update In-Game PiP Overlay & Air-Drawing State Machine
      if (isGameplayActive && this.controlMode === 'camera') {
        if (this.pipContainer) {
          this.pipContainer.classList.remove('hidden');
        }
        if (this.handLostBanner) {
          this.handLostBanner.classList.toggle('hidden', this.handDetected);
        }

        this._updateInGameAirDrawing(dt);
        this._renderPipCanvas();
      }
    }

    _updateSetupStateMachine(dt) {
      if (this.setupStage === 'detect_hand') {
        if (this.handDetected) {
          this.stableDetectionSeconds += dt;
          const pct = Math.min(100, Math.round((this.stableDetectionSeconds / 0.9) * 100));
          this._updateSetupUI(
            'STEP 2 OF 3 • CONFIRMING STABILITY',
            `HAND DETECTED (${pct}%)`,
            'Hold steady for a brief moment to lock onto your index fingertip...',
            30 + pct * 0.35
          );
          if (this.stableDetectionSeconds >= 0.9) {
            this._enterCalibrationStage();
          }
        } else {
          this.stableDetectionSeconds = Math.max(0, this.stableDetectionSeconds - dt * 1.5);
          this._updateSetupUI(
            'STEP 2 OF 3 • HAND DETECTION',
            'SHOW YOUR HAND TO THE CAMERA',
            'Raise one hand clearly in front of the webcam so your index fingertip can be tracked.',
            30
          );
        }
      } else if (this.setupStage === 'calibrate') {
        if (!this.handDetected) {
          this._updateSetupUI(
            'STEP 3 OF 3 • HAND LOST',
            'SHOW YOUR HAND TO CONTINUE CALIBRATION',
            'Keep your hand within the camera frame and touch the 3 glowing targets.',
            55
          );
          return;
        }

        const nx = this.screenX / Math.max(1, window.innerWidth);
        const ny = this.screenY / Math.max(1, window.innerHeight);

        this.calibrationTrail.push([nx, ny]);
        if (this.calibrationTrail.length > 36) {
          this.calibrationTrail.shift();
        }

        let reachedCount = 0;
        for (const wp of this.calibrationWaypoints) {
          if (!wp.reached && Math.hypot(nx - wp.nx, ny - wp.ny) < 0.13) {
            wp.reached = true;
            this.audio.playBalloonPop(reachedCount + 2);
          }
          if (wp.reached) reachedCount++;
        }

        this._updateSetupUI(
          `STEP 3 OF 3 • CALIBRATION (${reachedCount}/3 TARGETS)`,
          'HAND DETECTED — MOVE YOUR INDEX FINGER',
          'Move your index fingertip through the glowing targets to verify smooth tracking!',
          65 + (reachedCount / 3) * 30
        );

        if (reachedCount === this.calibrationWaypoints.length) {
          this._enterCountdownStage();
        }
      } else if (this.setupStage === 'countdown') {
        // Crucial requirement: If hand is lost during 3-2-1 countdown, pause countdown!
        if (!this.handDetected) {
          if (this.setupCountdownOverlay) {
            this.setupCountdownOverlay.textContent = '🖐️';
          }
          this._updateSetupUI(
            'COUNTDOWN PAUSED • HAND LOST',
            'SHOW YOUR HAND TO RESUME COUNTDOWN',
            'The game will not start until your hand is visible again!',
            92
          );
          return;
        }

        this._updateSetupUI(
          'CAMERA READY',
          'CAMERA READY — GET SET!',
          'Open index finger to draw • Close hand into a fist to submit each rune!',
          100
        );

        this.countdownRemaining -= dt;
        const ceilSec = Math.ceil(this.countdownRemaining);

        if (this.setupCountdownOverlay) {
          this.setupCountdownOverlay.textContent = ceilSec > 0 ? String(ceilSec) : 'GO!';
        }

        if (ceilSec > 0 && ceilSec < this.lastCountdownBeepInt) {
          this.lastCountdownBeepInt = ceilSec;
          this.audio.playUIClick();
        }

        if (this.countdownRemaining <= -0.25) {
          this.setupStage = 'ready';
          this._resetGestureStateMachine(
            this.confirmedPosture === 'CLOSED_HAND' ? 'CLOSED_HAND' : 'READY'
          );
          this.closeSetupModal();
          if (this.onSetupCompleteCallback) {
            const cb = this.onSetupCompleteCallback;
            this.onSetupCompleteCallback = null;
            cb();
          }
        }
      }
    }

    /**
     * Explicit 4-State Gesture Machine:
     *   READY -> DRAWING -> FINALIZING -> CLOSED_HAND -> READY
     *
     * Flow:
     *   Open index finger (READY)
     *   -> Move index finger to draw (DRAWING)
     *   -> Close hand into a fist (FINALIZING -> submits & clears path -> CLOSED_HAND)
     *   -> Open index finger again (READY for a brand-new disconnected gesture)
     *
     * Also keeps pause-based dwell completion (DRAWING -> FINALIZING -> READY) as a fallback.
     */
    _updateInGameAirDrawing(dt) {
      if (this.cooldownAfterCast > 0) {
        this.cooldownAfterCast = Math.max(0, this.cooldownAfterCast - dt);
      }

      if (!this.handDetected) {
        return;
      }

      const pt = [this.screenX, this.screenY];

      switch (this.gestureState) {
        case 'CLOSED_HAND': {
          // Strictly guarantee no points are ever recorded while hand remains closed
          this.isFingerDrawing = false;
          if (this.airStrokePoints.length > 0) {
            this.airStrokePoints = [];
          }
          this.dwellTimer = 0;

          // Transition CLOSED_HAND -> READY only when index finger is stably extended again
          if (this.confirmedPosture === 'INDEX_EXTENDED') {
            this.gestureState = 'READY';
            this.airStrokePoints = [];
            this.dwellTimer = 0;
            this.awaitingFreshMoveAfterFallback = false;
          }
          break;
        }

        case 'READY': {
          this.isFingerDrawing = false;
          if (this.airStrokePoints.length > 0) {
            this.airStrokePoints = [];
          }

          // If player closes their hand while in READY, enter CLOSED_HAND immediately
          if (this.confirmedPosture === 'CLOSED_HAND') {
            this.gestureState = 'CLOSED_HAND';
            this.awaitingFreshMoveAfterFallback = false;
            break;
          }

          // If we just completed a fallback pause-cast while keeping the finger extended,
          // wait for the player to briefly pause or begin a fresh movement before starting a new stroke
          if (this.awaitingFreshMoveAfterFallback) {
            if (this.velocity < this.STILL_SPEED_THRESHOLD * 0.7) {
              this.awaitingFreshMoveAfterFallback = false;
            }
            break;
          }

          // When index finger is stably extended and moving (beyond cooldown), start a brand-new stroke!
          if (
            this.confirmedPosture === 'INDEX_EXTENDED' &&
            this.rawPosture === 'INDEX_EXTENDED' &&
            this.cooldownAfterCast <= 0 &&
            this.velocity >= this.MIN_DRAW_SPEED
          ) {
            this.gestureState = 'DRAWING';
            this.isFingerDrawing = true;
            this.airStrokePoints = [pt];
            this.dwellTimer = 0;
          }
          break;
        }

        case 'DRAWING': {
          this.isFingerDrawing = true;

          // 1. PRIMARY TRIGGER: Explicit Hand-State Transition (Index Extended -> Closed Fist)
          if (this.confirmedPosture === 'CLOSED_HAND') {
            this._transitionToFinalizing('CLOSED_HAND');
            break;
          }

          // Only append trajectory points while rawPosture is INDEX_EXTENDED.
          // If rawPosture is CLOSED_HAND (during the 1-2 debounce frames as the player curls
          // their finger into a fist), we freeze point recording so the curling motion never
          // distorts the end of the drawn shape!
          if (this.rawPosture === 'INDEX_EXTENDED') {
            const last = this.airStrokePoints[this.airStrokePoints.length - 1];
            const moveDist = last ? Math.hypot(pt[0] - last[0], pt[1] - last[1]) : 0;

            if (!last || moveDist >= 4) {
              this.airStrokePoints.push(pt);
            }

            // 2. FALLBACK TRIGGER: Pause-based completion if player holds finger still at end of stroke
            if (
              this.velocity < this.STILL_SPEED_THRESHOLD &&
              this.airStrokePoints.length >= 6 &&
              this._computeStrokeLength(this.airStrokePoints) >= 36
            ) {
              this.dwellTimer += dt;
              if (this.dwellTimer >= this.DWELL_FINALIZE_SECONDS) {
                this.awaitingFreshMoveAfterFallback = true;
                this._transitionToFinalizing('READY');
                break;
              }
            } else {
              this.dwellTimer = Math.max(0, this.dwellTimer - dt * 2.2);
            }
          }
          break;
        }

        case 'FINALIZING': {
          // Safety transition in case update is called while in FINALIZING
          this.gestureState =
            this.confirmedPosture === 'CLOSED_HAND' ? 'CLOSED_HAND' : 'READY';
          this.isFingerDrawing = false;
          this.airStrokePoints = [];
          break;
        }

        default:
          this._resetGestureStateMachine('READY');
          break;
      }
    }

    /**
     * Enters the FINALIZING state, copies and submits the recorded gesture path,
     * immediately clears the active path so two gestures can never merge, and
     * transitions to nextState ('CLOSED_HAND' or 'READY').
     */
    _transitionToFinalizing(nextState) {
      this.gestureState = 'FINALIZING';

      const completedPoints = this.airStrokePoints.slice();
      const totalLength = this._computeStrokeLength(completedPoints);

      // Immediately clear active drawing path & state
      this.airStrokePoints = [];
      this.isFingerDrawing = false;
      this.dwellTimer = 0;
      this.cooldownAfterCast = 0.14;

      // Submit to GestureRecognizer if the path represents an intentional drawing
      if (completedPoints.length >= 3 && totalLength >= 20) {
        this.submittedFeedbackTimer = 0.75;
        this.submittedFeedbackPos = completedPoints[completedPoints.length - 1] || [
          this.screenX,
          this.screenY
        ];
        this.lastSubmittedPointCount = completedPoints.length;

        if (this.onAirStrokeCompleted) {
          this.onAirStrokeCompleted(completedPoints);
        }
      }

      // Transition cleanly to the target post-finalization state ('CLOSED_HAND' or 'READY')
      this.gestureState = nextState;
    }

    _computeStrokeLength(points) {
      let len = 0;
      for (let i = 1; i < points.length; i++) {
        len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      }
      return len;
    }

    /**
     * Legacy alias kept for compatibility.
     */
    _finalizeAirStroke() {
      const nextState = this.confirmedPosture === 'CLOSED_HAND' ? 'CLOSED_HAND' : 'READY';
      this._transitionToFinalizing(nextState);
    }

    /**
     * Returns true if gameplay enemy movement should be paused due to lost hand tracking.
     */
    shouldPauseGameplayForHandLoss() {
      return (
        this.controlMode === 'camera' &&
        this.settings.pauseOnHandLost &&
        !this.handDetected &&
        this.handLostSeconds > 0.55
      );
    }

    // ------------------------------------------------------------------------
    // 5. VISUALIZATION (Setup Canvas, In-Game PiP, and Game Screen Cursor)
    // ------------------------------------------------------------------------
    _renderSetupCanvas() {
      if (!this.setupCtx || !this.setupCanvas) return;
      const ctx = this.setupCtx;
      const w = this.setupCanvas.width;
      const h = this.setupCanvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Draw Mirrored Webcam Video Feed
      if (this.videoEl && this.videoEl.readyState >= 2) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.videoEl, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#090d1a';
        ctx.fillRect(0, 0, w, h);
      }

      // Dark translucent tint for high-contrast overlays
      ctx.fillStyle = 'rgba(9, 13, 26, 0.32)';
      ctx.fillRect(0, 0, w, h);

      // 2. Draw Calibration Waypoints & Trail during Calibration Stage
      if (this.setupStage === 'calibrate') {
        if (this.calibrationTrail.length >= 2) {
          ctx.save();
          ctx.strokeStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          this.calibrationTrail.forEach(([nx, ny], i) => {
            if (i === 0) ctx.moveTo(nx * w, ny * h);
            else ctx.lineTo(nx * w, ny * h);
          });
          ctx.stroke();
          ctx.restore();
        }

        // Draw target rings 1 -> 2 -> 3
        this.calibrationWaypoints.forEach(wp => {
          const cx = wp.nx * w;
          const cy = wp.ny * h;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 24, 0, Math.PI * 2);
          ctx.fillStyle = wp.reached ? 'rgba(74, 222, 128, 0.35)' : 'rgba(56, 189, 248, 0.22)';
          ctx.strokeStyle = wp.reached ? '#4ade80' : '#fde047';
          ctx.lineWidth = 3;
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '800 16px Fredoka, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wp.reached ? '✓' : wp.label, cx, cy);
          ctx.restore();
        });
      }

      // 3. Draw Hand Skeleton & Index Fingertip Marker
      this._drawHandOverlayOnCanvas(ctx, w, h, true);
    }

    _renderPipCanvas() {
      if (!this.pipCtx || !this.pipCanvas) return;

      // Update status badge on PiP header with explicit gesture state feedback
      if (this.pipConfidenceText && this.pipStateDot) {
        if (this.handDetected) {
          const pct = Math.round(this.confidence * 100);
          if (this.submittedFeedbackTimer > 0) {
            this.pipConfidenceText.textContent = `SUBMITTED ✓ (${pct}%)`;
            this.pipStateDot.style.background = '#4ade80';
          } else if (this.gestureState === 'DRAWING') {
            this.pipConfidenceText.textContent = `DRAWING (${pct}%)`;
            this.pipStateDot.style.background = '#fde047';
          } else if (this.gestureState === 'CLOSED_HAND') {
            this.pipConfidenceText.textContent = `CLOSED HAND (${pct}%)`;
            this.pipStateDot.style.background = '#f59e0b';
          } else {
            this.pipConfidenceText.textContent = `READY (${pct}%)`;
            this.pipStateDot.style.background = '#38bdf8';
          }
        } else {
          this.pipConfidenceText.textContent = 'HAND LOST';
          this.pipStateDot.style.background = '#ef4444';
        }
      }

      if (!this.settings.showSkeletonOverlay) return;

      const ctx = this.pipCtx;
      const w = this.pipCanvas.width;
      const h = this.pipCanvas.height;
      ctx.clearRect(0, 0, w, h);

      if (this.settings.showWebcamPreview && this.videoEl && this.videoEl.readyState >= 2) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.videoEl, 0, 0, w, h);
        ctx.restore();
        ctx.fillStyle = 'rgba(9, 13, 26, 0.28)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = 'rgba(9, 13, 26, 0.92)';
        ctx.fillRect(0, 0, w, h);
      }

      this._drawHandOverlayOnCanvas(ctx, w, h, false);
    }

    _drawHandOverlayOnCanvas(ctx, w, h, isLargeSetup) {
      if (!this.handDetected) return;

      ctx.save();

      const isClosed = this.gestureState === 'CLOSED_HAND';
      const skeletonColor = isClosed
        ? 'rgba(245, 158, 11, 0.82)'
        : 'rgba(56, 189, 248, 0.78)';

      // Draw 21-point hand skeleton if landmarks are available
      if (this.landmarks) {
        ctx.strokeStyle = skeletonColor;
        ctx.lineWidth = isLargeSetup ? 2.8 : 1.8;

        for (const [i, j] of HAND_CONNECTIONS) {
          const a = this.landmarks[i];
          const b = this.landmarks[j];
          ctx.beginPath();
          ctx.moveTo((1 - a.x) * w, a.y * h);
          ctx.lineTo((1 - b.x) * w, b.y * h);
          ctx.stroke();
        }

        for (let i = 0; i < this.landmarks.length; i++) {
          const lm = this.landmarks[i];
          const lx = (1 - lm.x) * w;
          const ly = lm.y * h;
          ctx.fillStyle = i === 8 ? (isClosed ? '#f59e0b' : '#fde047') : '#38bdf8';
          ctx.beginPath();
          ctx.arc(
            lx,
            ly,
            i === 8 ? (isLargeSetup ? 7 : 4.5) : (isLargeSetup ? 3.5 : 2),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      // Highlight mapped cursor position
      const nx = this.screenX / Math.max(1, window.innerWidth);
      const ny = this.screenY / Math.max(1, window.innerHeight);
      const cx = nx * w;
      const cy = ny * h;

      ctx.strokeStyle = isClosed ? '#f59e0b' : '#fde047';
      ctx.shadowColor = isClosed ? '#f59e0b' : '#fde047';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, isLargeSetup ? 12 : 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    /**
     * Renders the real-time index fingertip cursor, active air-drawn stroke,
     * and explicit hand-state indicator (DRAWING / CLOSED HAND / READY)
     * directly onto the main fullscreen game canvas.
     */
    renderOnGameCanvas(ctx) {
      if (this.controlMode !== 'camera' || !this.isRunning) return;

      // 1. Render active air-drawn stroke trail ONLY when in DRAWING state
      if (this.gestureState === 'DRAWING' && this.airStrokePoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 20;
        ctx.lineWidth = 8.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < this.airStrokePoints.length; i++) {
          const [x, y] = this.airStrokePoints[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Render expanding "Gesture Submitted" pulse ring when a gesture is finalized
      if (this.submittedFeedbackTimer > 0 && this.submittedFeedbackPos) {
        const [sx, sy] = this.submittedFeedbackPos;
        const progress = 1 - this.submittedFeedbackTimer / 0.75;
        const radius = 16 + progress * 38;
        const alpha = Math.max(0, 1 - progress);

        ctx.save();
        ctx.strokeStyle = `rgba(74, 222, 128, ${alpha.toFixed(2)})`;
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 16;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Render Index Fingertip Arcane Cursor Reticle & State Pill
      if (!this.handDetected) return;

      ctx.save();
      const x = this.screenX;
      const y = this.screenY;

      let ringColor = '#38bdf8'; // READY (cyan)
      let statusLabel = '☝️ READY — DRAW WITH INDEX FINGER';
      let pillBg = 'rgba(15, 23, 42, 0.82)';
      let pillBorder = '#38bdf8';

      if (this.gestureState === 'DRAWING') {
        ringColor = '#fde047'; // DRAWING (gold)
        statusLabel = '✏️ DRAWING — CLOSE FIST ✊ TO SUBMIT';
        pillBorder = '#fde047';
      } else if (this.gestureState === 'CLOSED_HAND') {
        if (this.submittedFeedbackTimer > 0) {
          ringColor = '#4ade80'; // Just submitted!
          statusLabel = '✓ GESTURE SUBMITTED — OPEN FINGER ☝️';
          pillBorder = '#4ade80';
        } else {
          ringColor = '#f59e0b'; // Holding closed fist (repositioning without drawing)
          statusLabel = '✊ HAND CLOSED — OPEN FINGER ☝️ TO DRAW';
          pillBorder = '#f59e0b';
        }
      } else if (this.submittedFeedbackTimer > 0) {
        ringColor = '#4ade80';
        statusLabel = '✓ GESTURE SUBMITTED — READY';
        pillBorder = '#4ade80';
      }

      // Outer glowing cursor ring (dashed/compact when CLOSED_HAND, solid when READY/DRAWING)
      ctx.strokeStyle = ringColor;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      if (this.gestureState === 'CLOSED_HAND') {
        ctx.setLineDash([4, 4]);
      }
      ctx.beginPath();
      ctx.arc(x, y, this.gestureState === 'CLOSED_HAND' ? 11 : 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner fingertip dot
      ctx.fillStyle = this.gestureState === 'CLOSED_HAND' ? ringColor : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Fallback dwell progress arc when pausing finger to finalize stroke
      if (this.gestureState === 'DRAWING' && this.dwellTimer > 0.04) {
        const progress = Math.min(1, this.dwellTimer / this.DWELL_FINALIZE_SECONDS);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 21, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
      }

      // Floating State Badge Pill near the cursor (clamped inside screen bounds)
      ctx.shadowBlur = 0;
      ctx.font = '700 11.5px Nunito, system-ui, sans-serif';
      const textWidth = ctx.measureText(statusLabel).width;
      const padX = 10;
      const pillW = textWidth + padX * 2;
      const pillH = 22;
      const pillX = Math.max(8, Math.min(window.innerWidth - pillW - 8, x - pillW / 2));
      const pillY = y > 55 ? y - 38 : y + 22;

      ctx.fillStyle = pillBg;
      ctx.strokeStyle = pillBorder;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(pillX, pillY, pillW, pillH, 11);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusLabel, pillX + pillW / 2, pillY + pillH / 2 + 0.5);

      ctx.restore();
    }
  }

  window.Aetherward.CameraController = CameraController;
})();
