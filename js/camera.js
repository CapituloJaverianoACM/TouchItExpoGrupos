/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Camera Hand-Gesture Control (js/camera.js)
 * ============================================================================
 * Camera Mode pipeline:
 *
 *   CAMERA -> MediaPipe HAND LANDMARKS -> HAND POSE CLASSIFICATION (handpose.js)
 *          -> TEMPORAL VALIDATION (hold ~0.3 s) -> GESTURE CONFIRMED -> game action
 *
 * Also runs the short pre-game flow (permission -> gesture guide + hand
 * detection -> 3-2-1 countdown) and the in-game PiP preview / feedback.
 *
 * PRIVACY: All video processing happens 100% locally in the browser memory.
 * No video frames are ever recorded, stored, or transmitted externally.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG;
  const Gestures = window.Aetherward.Gestures;
  const { HandPoseClassifier, GestureStabilizer, FINGER_NAMES } = window.Aetherward.HandPose;

  // MediaPipe Hands 21-landmark connections for skeleton visualization
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index finger
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle finger
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring finger
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17]             // Palm knuckles
  ];

  const HOLD_PRESETS = { fast: 0.2, normal: 0.3, relaxed: 0.45 };
  const HAND_STABLE_SECONDS = 0.8;

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
        pauseOnHandLost: true, // Freezes enemies/timer if hand is lost > 0.55s
        holdTime: 'normal'     // 'fast' | 'normal' | 'relaxed' -> seconds a pose must be held
      };

      // Debug overlay (finger states & pose scores): press "G" in Camera Mode or add ?gesturedebug=1
      this.debugMode = /[?&]gesturedebug=1/.test(window.location.search);

      // Hand tracking state
      this.handDetected = false;
      this.confidence = 0;
      this.handLostSeconds = 0;
      this.stableDetectionSeconds = 0;
      this.lastDetectionTime = 0;
      this.lastResultTime = 0;
      this.lockedWrist = null; // Keeps the same hand when several are visible
      this.landmarks = null;
      this.HAND_LOST_TIMEOUT_MS = 420;

      // Gesture pipeline
      this.classifier = new HandPoseClassifier();
      this.stabilizer = new GestureStabilizer();
      this.rawGesture = { id: 'UNKNOWN', score: 0, reason: 'no_hand', fingers: null, scores: [] };
      this.gestureStatus = { phase: 'idle', candidateId: null, latchedId: null, progress: 0 };
      this.confirmFlash = null; // { id, timer, matched }

      // Setup state machine: 'idle' | 'permission' | 'detect_hand' | 'countdown' | 'ready' | 'error'
      this.setupStage = 'idle';
      this.countdownRemaining = 3.0;
      this.onSetupCompleteCallback = null;

      // Callbacks into Game
      this.onGestureConfirmed = null; // (gestureId) => boolean (true if it hit something)

      this._initDOMReferences();
      window.addEventListener('keydown', e => {
        if (e.code === 'KeyG' && this.isRunning && this.controlMode === 'camera') {
          this.debugMode = !this.debugMode;
        }
      });
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
      this.gestureGuideEl = document.getElementById('camera-gesture-guide');

      // In-Game PiP Widget
      this.pipContainer = document.getElementById('hud-camera-pip');
      this.pipCanvas = document.getElementById('camera-pip-canvas');
      this.pipCtx = this.pipCanvas ? this.pipCanvas.getContext('2d') : null;
      this.pipConfidenceText = document.getElementById('pip-confidence-text');
      this.pipStateDot = document.getElementById('pip-state-dot');
      this.pipGestureLabel = document.getElementById('pip-gesture-label');
      this.pipHoldFill = document.getElementById('pip-hold-fill');
      this.handLostBanner = document.getElementById('hud-hand-lost-banner');

      const btnCancelSetup = document.getElementById('btn-cancel-camera-setup');
      if (btnCancelSetup) {
        btnCancelSetup.addEventListener('click', () => {
          this.audio.playUIClick();
          this.closeSetupModal();
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

      this._renderGestureGuide();
    }

    /**
     * Builds the gesture reference panel shown during camera setup.
     */
    _renderGestureGuide() {
      if (!this.gestureGuideEl) return;
      this.gestureGuideEl.innerHTML = '';
      const tierLabel = { easy: 'Start', medium: '30s+', hard: '90s+', expert: '180s+' };
      for (const g of Object.values(Gestures.DEFINITIONS)) {
        const card = document.createElement('div');
        card.className = 'gesture-guide-card';
        card.title = g.hint;
        card.innerHTML = `
          <canvas width="56" height="56"></canvas>
          <strong>${g.emoji} ${g.name}</strong>
          <span>${tierLabel[g.tier] || ''}</span>
        `;
        this.gestureGuideEl.appendChild(card);
        const c = card.querySelector('canvas');
        Gestures.drawGestureIcon(c.getContext('2d'), g.id, 28, 28, 50, { glowColor: g.color });
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

    applyHoldTime(preset) {
      this.settings.holdTime = HOLD_PRESETS[preset] ? preset : 'normal';
      CFG.GESTURE_RECOGNITION.HOLD_SECONDS = HOLD_PRESETS[this.settings.holdTime];
    }

    // ------------------------------------------------------------------------
    // 1. CAMERA & MEDIAPIPE INITIALIZATION
    // ------------------------------------------------------------------------
    async startCameraAndSetupFlow(onReadyToStartGame) {
      this.onSetupCompleteCallback = onReadyToStartGame;
      this.setupStage = 'permission';
      this.stableDetectionSeconds = 0;
      this.handDetected = false;
      this._resetGesturePipeline();

      if (this.setupModal) {
        this.setupModal.classList.remove('hidden');
      }
      if (this.setupCountdownOverlay) {
        this.setupCountdownOverlay.classList.add('hidden');
      }
      this._updateSetupUI(
        'STEP 1 OF 2 • CAMERA PERMISSION',
        'ALLOW CAMERA ACCESS',
        'Please grant webcam permission in your browser. Video is processed 100% locally for hand tracking.',
        10
      );

      try {
        if (!this.stream) {
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
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

        if (!this.mpLoaded) {
          // Static gestures need full hand landmarks; the old color-blob fallback can't classify poses
          this.setupStage = 'error';
          this._updateSetupUI(
            'HAND MODEL UNAVAILABLE',
            'COULD NOT LOAD THE HAND TRACKER',
            'Camera gestures need an internet connection the first time (MediaPipe Hands is loaded from a CDN). Connect and try again, or switch to Standard (Mouse / Touch) control.',
            0
          );
          return;
        }

        const alreadyRunning = this.isRunning;
        this.isRunning = true;
        this._enterDetectHandStage();
        if (!alreadyRunning) this._pumpDetectionLoop(); // Avoid stacking loops on "Play Again"
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
            maxNumHands: 2,     // Lets us stay locked on the player's hand when bystanders appear
            modelComplexity: 1, // Full model: more stable finger landmarks than the lite model
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5
          });
          this.mpHands.onResults(results => this._onMediaPipeResults(results));
          this.mpLoaded = true;
        }
      } catch (err) {
        console.warn('MediaPipe Hands CDN unreachable; camera gestures unavailable.', err);
        this.mpLoaded = false;
      } finally {
        this.mpLoading = false;
      }
    }

    stopCamera() {
      this.isRunning = false;
      this.handDetected = false;
      this._resetGesturePipeline();
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

    _resetGesturePipeline() {
      this.classifier.reset();
      this.stabilizer.reset();
      this.rawGesture = { id: 'UNKNOWN', score: 0, reason: 'no_hand', fingers: null, scores: [] };
      this.gestureStatus = { phase: 'idle', candidateId: null, latchedId: null, progress: 0 };
      this.confirmFlash = null;
    }

    // ------------------------------------------------------------------------
    // 2. SETUP STATE MACHINE (guide + hand detection -> countdown)
    // ------------------------------------------------------------------------
    _enterDetectHandStage() {
      this.setupStage = 'detect_hand';
      this.stableDetectionSeconds = 0;
      if (this.setupCountdownOverlay) {
        this.setupCountdownOverlay.classList.add('hidden');
      }
      this._updateSetupUI(
        'STEP 2 OF 2 • SHOW YOUR HAND',
        'PLACE YOUR HAND INSIDE THE FRAME',
        'Hold one hand up, about an arm\'s length from the camera. Meanwhile, check the gestures below!',
        40
      );
    }

    _enterCountdownStage() {
      this.setupStage = 'countdown';
      this.countdownRemaining = 3.2;
      this.lastCountdownBeepInt = 4;
      this.audio.playBalloonPop(3);

      this._updateSetupUI(
        'HAND DETECTED',
        'CAMERA READY!',
        'Copy the hand gesture shown on a balloon and hold it for a moment to cast. Starting in 3, 2, 1...',
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

    _updateSetupStateMachine(dt) {
      if (this.setupStage === 'detect_hand') {
        if (this.handDetected) {
          this.stableDetectionSeconds += dt;
          const pct = Math.min(100, Math.round((this.stableDetectionSeconds / HAND_STABLE_SECONDS) * 100));
          this._updateSetupUI(
            'STEP 2 OF 2 • HAND DETECTED',
            `LOCKING ON… ${pct}%`,
            'Keep your hand in view for a moment.',
            40 + pct * 0.5
          );
          if (this.stableDetectionSeconds >= HAND_STABLE_SECONDS) {
            this._enterCountdownStage();
          }
        } else {
          this.stableDetectionSeconds = Math.max(0, this.stableDetectionSeconds - dt * 1.5);
          this._updateSetupUI(
            'STEP 2 OF 2 • SHOW YOUR HAND',
            'PLACE YOUR HAND INSIDE THE FRAME',
            'Hold one hand up, about an arm\'s length from the camera. Meanwhile, check the gestures below!',
            40
          );
        }
      } else if (this.setupStage === 'countdown') {
        // Countdown pauses while the hand is out of view
        if (!this.handDetected) {
          if (this.setupCountdownOverlay) {
            this.setupCountdownOverlay.textContent = '🖐️';
          }
          this._updateSetupUI(
            'COUNTDOWN PAUSED • HAND LOST',
            'SHOW YOUR HAND TO RESUME',
            'The game will not start until your hand is visible again!',
            92
          );
          return;
        }

        this._updateSetupUI(
          'CAMERA READY',
          'CAMERA READY — GET SET!',
          'Copy the hand gesture shown on a balloon and hold it for a moment to cast!',
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
          // Whatever pose the player is holding at GO must be released before it can fire
          this.stabilizer.reset();
          if (this.rawGesture.id !== 'UNKNOWN') this.stabilizer.latchedId = this.rawGesture.id;
          this.closeSetupModal();
          if (this.onSetupCompleteCallback) {
            const cb = this.onSetupCompleteCallback;
            this.onSetupCompleteCallback = null;
            cb();
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3. LANDMARKS -> POSE CLASSIFICATION -> TEMPORAL VALIDATION
    // ------------------------------------------------------------------------
    async _pumpDetectionLoop() {
      if (!this.isRunning) return;

      if (this.videoEl && this.videoEl.readyState >= 2 && !this.processingFrame && this.mpHands) {
        this.processingFrame = true;
        try {
          await this.mpHands.send({ image: this.videoEl });
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
      const now = performance.now();
      const dtMs = this.lastResultTime ? now - this.lastResultTime : 33;
      this.lastResultTime = now;

      const hands = results.multiHandLandmarks;
      if (!hands || hands.length === 0) {
        // Single missed frames are tolerated; update() declares the hand lost after a timeout
        this._feedGesture({ id: 'UNKNOWN', score: 0, reason: 'no_hand', fingers: null, scores: [] }, dtMs);
        return;
      }

      // Keep following the same hand when several are visible (closest to the last tracked wrist)
      let chosenIdx = 0;
      if (hands.length > 1) {
        let bestScore = Infinity;
        for (let i = 0; i < hands.length; i++) {
          const wx = 1 - hands[i][0].x;
          const wy = hands[i][0].y;
          const d = this.lockedWrist && this.handDetected
            ? Math.hypot(wx - this.lockedWrist.x, wy - this.lockedWrist.y)
            : Math.hypot(wx - 0.5, wy - 0.5);
          if (d < bestScore) {
            bestScore = d;
            chosenIdx = i;
          }
        }
      }
      const hand = hands[chosenIdx];

      const handedness = results.multiHandedness && results.multiHandedness[chosenIdx];
      this.confidence = handedness && handedness.score ? handedness.score : 0.92;
      this.landmarks = hand;
      this.lockedWrist = { x: 1 - hand[0].x, y: hand[0].y };
      this.handDetected = true;
      this.handLostSeconds = 0;
      this.lastDetectionTime = now;

      const aspect =
        this.videoEl && this.videoEl.videoWidth && this.videoEl.videoHeight
          ? this.videoEl.videoWidth / this.videoEl.videoHeight
          : 4 / 3;
      const result = this.classifier.classify(hand, { aspect });
      this._feedGesture(result, dtMs);
    }

    _feedGesture(result, dtMs) {
      this.rawGesture = result;
      const status = this.stabilizer.update(result.id, dtMs);
      this.gestureStatus = status;

      // Only cast outside the setup flow (setup/countdown just shows live feedback).
      // Note: closeSetupModal() moves 'ready' back to 'idle', so both mean "in game".
      const inSetup = this.setupStage !== 'idle' && this.setupStage !== 'ready';
      if (status.confirmedId && !inSetup) {
        const hit = this.onGestureConfirmed ? this.onGestureConfirmed(status.confirmedId) : false;
        this.confirmFlash = { id: status.confirmedId, timer: 0.8, matched: Boolean(hit) };
      }
    }

    // ------------------------------------------------------------------------
    // 4. PER-FRAME UPDATE
    // ------------------------------------------------------------------------
    update(dt, isGameplayActive) {
      if (!this.isRunning) return;

      if (this.confirmFlash) {
        this.confirmFlash.timer -= dt;
        if (this.confirmFlash.timer <= 0) this.confirmFlash = null;
      }

      if (this.handDetected && performance.now() - this.lastDetectionTime > this.HAND_LOST_TIMEOUT_MS) {
        this._markHandLost();
      }
      if (!this.handDetected) {
        this.handLostSeconds += dt;
      }

      if (this.setupStage !== 'idle' && this.setupStage !== 'ready') {
        this._updateSetupStateMachine(dt);
        this._renderSetupCanvas();
        return;
      }

      if (isGameplayActive && this.controlMode === 'camera') {
        if (this.pipContainer) this.pipContainer.classList.remove('hidden');
        if (this.handLostBanner) this.handLostBanner.classList.toggle('hidden', this.handDetected);
        this._updatePipStatus();
        this._renderPipCanvas();
      }
    }

    _markHandLost() {
      this.handDetected = false;
      this.confidence = 0;
      this.landmarks = null;
      this.classifier.reset();
      this.stabilizer.reset();
      this.rawGesture = { id: 'UNKNOWN', score: 0, reason: 'no_hand', fingers: null, scores: [] };
      this.gestureStatus = { phase: 'idle', candidateId: null, latchedId: null, progress: 0 };
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

    /**
     * Gesture currently being held/verified (for highlighting matching balloons).
     */
    getVerifyingGesture() {
      if (!this.isRunning || this.gestureStatus.phase !== 'verifying') return null;
      return { id: this.gestureStatus.candidateId, progress: this.gestureStatus.progress };
    }

    // ------------------------------------------------------------------------
    // 5. FEEDBACK & VISUALIZATION
    // ------------------------------------------------------------------------
    _gestureLabel(id) {
      const g = Gestures.DEFINITIONS[id];
      return g ? `${g.emoji} ${g.name}` : '';
    }

    _updatePipStatus() {
      if (!this.pipConfidenceText || !this.pipStateDot) return;
      const st = this.gestureStatus;
      let dot = '#38bdf8';
      let header = 'TRACKING';
      let label = 'Show a gesture';
      let fill = 0;
      let fillColor = '#fde047';

      if (!this.handDetected) {
        dot = '#ef4444';
        header = 'HAND LOST';
        label = 'Show your hand';
      } else if (this.confirmFlash) {
        dot = this.confirmFlash.matched ? '#4ade80' : '#94a3b8';
        header = this.confirmFlash.matched ? 'CONFIRMED ✓' : 'NO TARGET';
        label = this._gestureLabel(this.confirmFlash.id);
        fill = 1;
        fillColor = this.confirmFlash.matched ? '#4ade80' : '#64748b';
      } else if (st.phase === 'verifying') {
        dot = '#fde047';
        header = 'HOLD…';
        label = `Detected: ${this._gestureLabel(st.candidateId)}`;
        fill = st.progress;
      } else if (st.phase === 'latched') {
        dot = '#a78bfa';
        header = 'CHANGE POSE';
        label = `${this._gestureLabel(st.latchedId)} ✓`;
      } else if (this.rawGesture.reason === 'partial') {
        dot = '#f59e0b';
        label = 'Move hand fully into view';
      } else if (this.rawGesture.reason === 'too_far') {
        dot = '#f59e0b';
        label = 'Move a bit closer';
      }

      this.pipConfidenceText.textContent = header;
      this.pipStateDot.style.background = dot;
      if (this.pipGestureLabel) this.pipGestureLabel.textContent = label;
      if (this.pipHoldFill) {
        this.pipHoldFill.style.width = `${Math.round(fill * 100)}%`;
        this.pipHoldFill.style.background = fillColor;
      }
    }

    _renderSetupCanvas() {
      if (!this.setupCtx || !this.setupCanvas) return;
      const ctx = this.setupCtx;
      const w = this.setupCanvas.width;
      const h = this.setupCanvas.height;

      ctx.clearRect(0, 0, w, h);
      if (this.videoEl && this.videoEl.readyState >= 2) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1); // Mirror so the preview behaves like a mirror
        ctx.drawImage(this.videoEl, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#090d1a';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = 'rgba(9, 13, 26, 0.32)';
      ctx.fillRect(0, 0, w, h);

      // Framing guide: dashed box where the hand should be
      if (this.setupStage === 'detect_hand') {
        ctx.save();
        ctx.strokeStyle = this.handDetected ? '#4ade80' : 'rgba(253, 224, 71, 0.85)';
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 3;
        ctx.strokeRect(w * 0.2, h * 0.12, w * 0.6, h * 0.76);
        ctx.restore();
      }

      this._drawHandOverlayOnCanvas(ctx, w, h, true);

      // Live feedback so players can try gestures before the game starts
      if (this.handDetected && this.rawGesture.id !== 'UNKNOWN') {
        ctx.save();
        ctx.font = '800 20px Fredoka, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(w / 2 - 130, h - 44, 260, 32);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`Detected: ${this._gestureLabel(this.rawGesture.id)}`, w / 2, h - 21);
        ctx.restore();
      }
    }

    _renderPipCanvas() {
      if (!this.settings.showSkeletonOverlay || !this.pipCtx || !this.pipCanvas) return;
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
      if (this.debugMode) this._drawDebugOverlay(ctx, w, h);
    }

    _drawHandOverlayOnCanvas(ctx, w, h, isLargeSetup) {
      if (!this.handDetected || !this.landmarks) return;
      const lm = this.landmarks;
      const st = this.gestureStatus;

      let color = 'rgba(56, 189, 248, 0.85)';
      if (this.confirmFlash && this.confirmFlash.matched) color = 'rgba(74, 222, 128, 0.95)';
      else if (st.phase === 'verifying') color = 'rgba(253, 224, 71, 0.9)';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isLargeSetup ? 2.8 : 1.8;
      for (const [i, j] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo((1 - lm[i].x) * w, lm[i].y * h);
        ctx.lineTo((1 - lm[j].x) * w, lm[j].y * h);
        ctx.stroke();
      }

      // Fingertips colored by state (green = extended, amber = partial, red = folded)
      const fingers = this.rawGesture.fingers;
      const tips = [4, 8, 12, 16, 20];
      for (let i = 0; i < lm.length; i++) {
        let fill = '#38bdf8';
        const tipIdx = tips.indexOf(i);
        if (tipIdx >= 0 && fingers) {
          const s = fingers[FINGER_NAMES[tipIdx]].state;
          fill = s === 'extended' ? '#4ade80' : s === 'partial' ? '#f59e0b' : '#ef4444';
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc((1 - lm[i].x) * w, lm[i].y * h, tipIdx >= 0 ? (isLargeSetup ? 6 : 3.5) : (isLargeSetup ? 3.5 : 2), 0, Math.PI * 2);
        ctx.fill();
      }

      // Hold-progress ring around the palm
      if (st.phase === 'verifying' || (this.confirmFlash && this.confirmFlash.matched)) {
        const cx = (1 - (lm[0].x + lm[9].x) / 2) * w;
        const cy = ((lm[0].y + lm[9].y) / 2) * h;
        const r = Math.max(isLargeSetup ? 26 : 12, Math.hypot((lm[9].x - lm[0].x) * w, (lm[9].y - lm[0].y) * h) * 0.9);
        const p = st.phase === 'verifying' ? st.progress : 1;
        ctx.lineWidth = isLargeSetup ? 5 : 3;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = st.phase === 'verifying' ? '#fde047' : '#4ade80';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawDebugOverlay(ctx, w, h) {
      const r = this.rawGesture;
      ctx.save();
      ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '600 9.5px ui-monospace, Consolas, monospace';
      ctx.fillStyle = '#e2e8f0';
      let y = 12;
      const line = t => { ctx.fillText(t, 5, y); y += 11; };
      line(`raw: ${r.id} (${r.reason})`);
      if (r.fingers) {
        line(FINGER_NAMES.map(n => `${n[0].toUpperCase()}${r.fingers[n].ext.toFixed(2)}`).join(' '));
      }
      if (r.measures) {
        line(`pinch ${r.measures.pinch.toFixed(2)} thumbUp ${r.measures.thumbUp.toFixed(2)}`);
      }
      for (const s of (r.scores || []).slice(0, 3)) line(`${s.id.padEnd(11)} ${s.score.toFixed(2)}`);
      line(`${this.gestureStatus.phase} ${Math.round(this.gestureStatus.progress * 100)}%`);
      ctx.restore();
    }

    /**
     * Main game canvas overlay: nothing is drawn here in gesture mode (feedback
     * lives in the PiP widget and on the targeted balloons); kept for API compatibility.
     */
    renderOnGameCanvas() {}
  }

  window.Aetherward.CameraController = CameraController;
})();
