/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Core Game Engine & Loop (js/game.js)
 * ============================================================================
 * Orchestrates the main requestAnimationFrame loop, pointer/touch drawing
 * input, gesture matching against active enemy balloons & power-up orbs,
 * combo/score calculation, ultimate abilities, and game state transitions.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG;
  const Symbols = window.Aetherward.Symbols;
  const { Wizard } = window.Aetherward.Entities;

  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');

      this.audio = new window.Aetherward.AudioManager();
      this.recognizer = new window.Aetherward.GestureRecognizer();
      this.effects = new window.Aetherward.EffectsManager();
      this.spawner = new window.Aetherward.Spawner();
      this.wizard = new Wizard();
      this.camera = new window.Aetherward.CameraController(this.audio);
      this.ui = new window.Aetherward.UIManager(this.audio, this.recognizer);

      // Connect Camera air-drawing strokes to the main Gesture Recognizer
      this.camera.onAirStrokeCompleted = strokePoints => {
        if (this.state === 'playing') {
          this._evaluateDrawnStroke(strokePoints, true);
        }
      };

      // Sync initial settings
      this.applySettings(this.ui.saveData.settings);
      this.ui.onSettingsChanged = settings => this.applySettings(settings);

      // Game State
      this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
      this.gameMode = 'endless'; // 'endless' | 'rush' | 'daily'
      this.currentPlayerName = window.Aetherward.RushLeaderboard.getLastPlayerName() || 'PLAYER';
      this.rushOvertimeTriggered = false;

      // Match Runtime Variables
      this.score = 0;
      this.lives = CFG.PLAYER.INITIAL_LIVES;
      this.elapsedSeconds = 0;
      this.comboStreak = 0;
      this.maxCombo = 0;
      this.comboTimer = 0;
      this.ultimateCharge = 0;
      this.enemiesDefeated = 0;
      this.strokesAttempted = 0;
      this.strokesSucceeded = 0;

      this.enemies = [];
      this.powerupOrbs = [];
      this.activePowerups = {
        slow_mo: 0,
        freeze: 0,
        shield: 0
      };
      this.cinematicSlowMoTimer = 0;

      // Player Drawing Trail State
      this.isDrawing = false;
      this.activePointerId = null;
      this.currentStroke = [];
      this.fadingStrokes = []; // [{ points, color, alpha, isSuccess }]

      // Viewport metrics
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.groundY = this.height * CFG.PLAYER.GROUND_Y_RATIO;

      this._setupResize();
      this._setupInput();
      this._setupMenuButtons();

      this.lastFrameTime = performance.now();
      requestAnimationFrame(ts => this._loop(ts));
    }

    applySettings(settings) {
      this.effects.setReducedEffects(settings.reducedEffects);
      this.extraForgiving = Boolean(settings.extraForgiving);
      this.selectedTheme = settings.theme || 'dynamic';
      if (this.camera) {
        this.camera.settings.pauseOnHandLost = settings.camPauseOnLost !== false;
        this.camera.settings.gestureMode = settings.camGestureMode || 'point_dwell';
      }
    }

    _setupResize() {
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.groundY = this.height * CFG.PLAYER.GROUND_Y_RATIO;
      };
      window.addEventListener('resize', resize);
      resize();
    }

    /**
     * Launches the requested game mode. If Camera Control is enabled, always runs
     * the Camera Permission -> Hand Detection -> Calibration -> 3-2-1-GO flow
     * BEFORE starting the match or Rush Mode timer!
     */
    launchWithControlCheck(mode) {
      if (this.camera && this.camera.isCameraModeEnabled()) {
        this.camera.startCameraAndSetupFlow(() => {
          this.startNewGame(mode);
        });
      } else {
        this.startNewGame(mode);
      }
    }

    promptAndStartRushMode() {
      this.gameMode = 'rush';
      this.ui.openRushNamePrompt(enteredName => {
        this.currentPlayerName = enteredName;
        this.launchWithControlCheck('rush');
      });
    }

    _setupMenuButtons() {
      // Mode selection buttons on Main Menu
      const modeBtns = document.querySelectorAll('.js-select-mode');
      modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.audio.playUIClick();
          modeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.gameMode = btn.dataset.mode || 'endless';
          const bestEl = document.getElementById('menu-best-score');
          if (bestEl) {
            bestEl.textContent = this.ui.getHighScore(this.gameMode).toLocaleString();
          }
        });
      });

      // Control Method selection buttons (Standard vs Camera / Finger Tracking)
      const controlBtns = document.querySelectorAll('.js-select-control');
      controlBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.audio.playUIClick();
          controlBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const ctrlMode = btn.dataset.control || 'standard';
          this.camera.setControlMode(ctrlMode);
        });
      });

      // Start Match (Prompts for Player Name if Rush Mode, then Camera Setup if Camera Control!)
      document.getElementById('btn-start-game').addEventListener('click', () => {
        this.audio.playUIClick();
        if (this.gameMode === 'rush' || this.gameMode === 'blitz') {
          this.promptAndStartRushMode();
        } else {
          this.launchWithControlCheck(this.gameMode);
        }
      });

      // Open Rush Leaderboard from Main Menu
      const btnOpenRushLb = document.getElementById('btn-open-rush-leaderboard');
      if (btnOpenRushLb) {
        btnOpenRushLb.addEventListener('click', () => {
          this.ui.openRushLeaderboard();
        });
      }

      // Play Rush Mode button inside the Rush Leaderboard screen
      const btnRushLbPlay = document.getElementById('btn-rush-lb-play');
      if (btnRushLbPlay) {
        btnRushLbPlay.addEventListener('click', () => {
          this.ui.closeModal('rushLeaderboard');
          modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === 'rush'));
          this.promptAndStartRushMode();
        });
      }

      // Open Modals
      document.getElementById('btn-open-grimoire').addEventListener('click', () => {
        this.ui.openModal('grimoire');
      });
      document.getElementById('btn-open-scores').addEventListener('click', () => {
        this.ui.openModal('scores');
      });
      document.getElementById('btn-open-settings').addEventListener('click', () => {
        this.ui.openModal('settings');
      });

      // Close Modal buttons
      document.querySelectorAll('.js-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
          this.ui.closeModal(btn.dataset.modal);
        });
      });

      // HUD Controls
      document.getElementById('btn-pause').addEventListener('click', () => {
        this.togglePause();
      });

      document.getElementById('btn-ultimate').addEventListener('click', () => {
        this.triggerUltimateSpell();
      });

      // Pause Modal Buttons
      document.getElementById('btn-resume').addEventListener('click', () => {
        this.togglePause(false);
      });
      document.getElementById('btn-restart-pause').addEventListener('click', () => {
        this.ui.hideAllModals();
        this.launchWithControlCheck(this.gameMode);
      });
      document.getElementById('btn-pause-grimoire').addEventListener('click', () => {
        this.ui.openModal('grimoire');
      });
      document.getElementById('btn-quit-menu').addEventListener('click', () => {
        this.returnToMainMenu();
      });

      // Game Over Modal Buttons
      document.getElementById('btn-play-again').addEventListener('click', () => {
        if (this.gameMode === 'rush' || this.gameMode === 'blitz') {
          this.ui.closeModal('gameover');
          this.promptAndStartRushMode();
        } else {
          this.ui.closeModal('gameover');
          this.launchWithControlCheck(this.gameMode);
        }
      });

      const btnGameoverRushLb = document.getElementById('btn-gameover-rush-lb');
      if (btnGameoverRushLb) {
        btnGameoverRushLb.addEventListener('click', () => {
          this.ui.openRushLeaderboard();
        });
      }

      document.getElementById('btn-gameover-menu').addEventListener('click', () => {
        this.returnToMainMenu();
      });

      // Keyboard Shortcuts (Space for Ultimate, Esc/P for Pause)
      window.addEventListener('keydown', e => {
        if (e.code === 'Space' && this.state === 'playing') {
          e.preventDefault();
          this.triggerUltimateSpell();
        } else if ((e.code === 'Escape' || e.code === 'KeyP') && (this.state === 'playing' || this.state === 'paused')) {
          e.preventDefault();
          this.togglePause();
        }
      });
    }

    // ------------------------------------------------------------------------
    // POINTER / TOUCH GESTURE DRAWING INPUT
    // ------------------------------------------------------------------------
    _setupInput() {
      const getCoords = e => {
        const rect = this.canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
      };

      this.canvas.addEventListener('pointerdown', e => {
        if (this.state !== 'playing') return;
        if (e.button !== undefined && e.button !== 0) return; // Left click or touch only
        e.preventDefault();

        this.audio.init();
        const [x, y] = getCoords(e);

        // Allow direct tap on floating Power-Up Orbs for convenience
        for (let i = this.powerupOrbs.length - 1; i >= 0; i--) {
          const orb = this.powerupOrbs[i];
          if (Math.hypot(orb.x - x, orb.y - y) <= orb.radius + 18) {
            this.collectPowerUpOrb(orb, i);
            return;
          }
        }

        this.isDrawing = true;
        this.activePointerId = e.pointerId;
        this.currentStroke = [[x, y]];
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_) {}
      });

      this.canvas.addEventListener('pointermove', e => {
        if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
        e.preventDefault();
        const [x, y] = getCoords(e);
        const last = this.currentStroke[this.currentStroke.length - 1];
        if (!last || Math.hypot(x - last[0], y - last[1]) >= 4) {
          this.currentStroke.push([x, y]);

          // Check if stroke slices directly through a Power-Up Orb
          for (let i = this.powerupOrbs.length - 1; i >= 0; i--) {
            const orb = this.powerupOrbs[i];
            if (Math.hypot(orb.x - x, orb.y - y) <= orb.radius + 14) {
              this.collectPowerUpOrb(orb, i);
            }
          }
        }
      });

      const finishStroke = e => {
        if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
        this.isDrawing = false;
        this.activePointerId = null;

        const strokeCopy = this.currentStroke.slice();
        this.currentStroke = [];
        this._evaluateDrawnStroke(strokeCopy, e.pointerType === 'touch');
      };

      this.canvas.addEventListener('pointerup', finishStroke);
      this.canvas.addEventListener('pointercancel', finishStroke);
    }

    /**
     * Collects all currently active symbol IDs on screen so the recognizer can
     * apply contextual prioritization.
     */
    _getActiveSymbolSet() {
      const set = new Set();
      for (const enemy of this.enemies) {
        if (enemy.state === 'descending') {
          for (const symId of enemy.getTargetableSymbols()) {
            set.add(symId);
          }
          if (enemy.decoyBalloon) {
            set.add(enemy.decoyBalloon.symbolId);
          }
        }
      }
      for (const orb of this.powerupOrbs) {
        set.add(orb.symbolId);
      }
      return set;
    }

    _evaluateDrawnStroke(points, isTouch) {
      const activeSymbols = this._getActiveSymbolSet();
      const result = this.recognizer.recognize(points, {
        activeSymbols,
        isTouch,
        extraForgiving: this.extraForgiving
      });

      if (result.tooShort) {
        return; // Ignore tiny accidental taps
      }

      this.strokesAttempted++;

      if (!result.symbolId) {
        // Unrecognized shape
        this._handleFailedStroke(points, 'Fizzle! Try Again');
        return;
      }

      const matchedSym = Symbols.DEFINITIONS[result.symbolId];
      let balloonsPopped = 0;
      let enemiesDefeatedThisStroke = 0;
      let decoyHit = false;
      let orbCollected = false;

      // 1. Check if symbol matches any floating Power-Up Orb
      for (let i = this.powerupOrbs.length - 1; i >= 0; i--) {
        if (this.powerupOrbs[i].symbolId === result.symbolId) {
          this.collectPowerUpOrb(this.powerupOrbs[i], i);
          orbCollected = true;
        }
      }

      // 2. Check all descending enemies for matching balloons
      const wizardX = this.width / 2;
      const wizardY = this.groundY;
      const staffTip = this.wizard.getStaffTipPosition(wizardX, wizardY);

      for (let i = 0; i < this.enemies.length; i++) {
        const enemy = this.enemies[i];
        const popOutcome = enemy.tryPopSymbol(result.symbolId);
        if (!popOutcome) continue;

        if (popOutcome.decoyTriggered) {
          decoyHit = true;
          this.audio.playDecoyTriggered();
          this.effects.spawnBalloonPop(popOutcome.balloonWorldX, popOutcome.balloonWorldY, '#a855f7');
          this.effects.spawnFloatingText(popOutcome.balloonWorldX, popOutcome.balloonWorldY, 'ILLUSION DECOY!', '#e879f9', 1.05);
          continue;
        }

        // Valid balloon popped!
        balloonsPopped++;
        this._handleBalloonPopped(enemy, popOutcome, matchedSym, result.confidence, staffTip);
        if (popOutcome.defeated) {
          enemiesDefeatedThisStroke++;
        }
      }

      if (balloonsPopped > 0 || orbCollected) {
        this.strokesSucceeded++;
        this.comboStreak++;
        if (this.comboStreak > this.maxCombo) this.maxCombo = this.comboStreak;
        this.comboTimer = CFG.SCORING.COMBO_TIMEOUT_SECONDS;

        // Check Combo Achievements
        if (this.comboStreak >= 10) this.ui.unlockAchievement('combo_10');
        if (this.comboStreak >= 25) this.ui.unlockAchievement('combo_25');
        if (balloonsPopped >= 3) this.ui.unlockAchievement('multicast_3');

        this.audio.playBalloonPop(this.comboStreak);

        // Multi-Cast Bonus when 1 drawing pops balloons on 2+ enemies!
        if (balloonsPopped >= 2) {
          const multiBonus = (balloonsPopped - 1) * CFG.SCORING.MULTI_CAST_BONUS_PER_EXTRA * this.getComboMultiplier();
          this.score += multiBonus;
          this.audio.playMultiCast(balloonsPopped);
          this.effects.spawnFloatingText(
            this.width / 2,
            this.height * 0.32,
            `MULTI-CAST x${balloonsPopped}! +${Math.round(multiBonus)}`,
            '#fde047',
            1.35
          );
          if (balloonsPopped >= 3) {
            this.cinematicSlowMoTimer = 0.45;
          }
        }

        this.wizard.triggerCast(matchedSym.color);
        this.ui.showRecognitionFeedback(`✓ ${matchedSym.name}`, true);
        this.fadingStrokes.push({
          points,
          color: matchedSym.color,
          alpha: 1.0,
          isSuccess: true
        });
      } else if (decoyHit) {
        this.ui.showRecognitionFeedback(`Trickster Decoy! Draw the solid balloon!`, false);
        this.fadingStrokes.push({
          points,
          color: '#c084fc',
          alpha: 1.0,
          isSuccess: false
        });
      } else {
        // Recognized symbol, but no balloon on screen currently has that symbol
        // Check if player just drew half of a 2-stroke '+' Cross Rune that IS on screen!
        if (
          activeSymbols.has('cross_rune') &&
          (result.symbolId === 'horizontal' || result.symbolId === 'vertical')
        ) {
          this.ui.showRecognitionFeedback(`Cross the line to complete Templar Cross (+)`, true);
          this.fadingStrokes.push({
            points,
            color: '#f8fafc',
            alpha: 1.0,
            isSuccess: true
          });
          return;
        }
        this._handleFailedStroke(points, `No ${matchedSym.name} on screen!`);
      }
    }

    _handleBalloonPopped(enemy, popOutcome, matchedSym, confidence, staffTip) {
      const { balloonWorldX, balloonWorldY, defeated } = popOutcome;
      const mult = this.getComboMultiplier();

      // 1. Visual Beam & Pop Burst
      this.effects.spawnSpellBeam(staffTip.x, staffTip.y, balloonWorldX, balloonWorldY, matchedSym.color);
      this.effects.spawnBalloonPop(balloonWorldX, balloonWorldY, matchedSym.color);

      // 2. Calculate Points
      let pts = CFG.SCORING.BASE_BALLOON_POP * matchedSym.scoreBonus;
      const accuracyBonus = Math.round(Math.max(0, (confidence - 0.6) / 0.4) * CFG.SCORING.ACCURACY_BONUS_MAX);
      pts += accuracyBonus;

      if (defeated) {
        pts += enemy.scoreValue;
        // Quick-Draw bonus if defeated in upper 38% of screen
        if (enemy.y < this.groundY * 0.38) {
          pts += CFG.SCORING.QUICK_DRAW_BONUS;
          this.effects.spawnFloatingText(enemy.x, enemy.y - 34, 'QUICK DRAW!', '#38bdf8', 0.95);
        }
      }

      const totalAwarded = Math.round(pts * mult);
      this.score += totalAwarded;

      this.effects.spawnFloatingText(
        balloonWorldX,
        balloonWorldY - 10,
        `+${totalAwarded}`,
        matchedSym.color,
        defeated ? 1.18 : 0.95
      );

      // 3. Charge Ultimate Meter
      const chargeGain = CFG.PLAYER.ULTIMATE_CHARGE_PER_POP + mult * CFG.PLAYER.ULTIMATE_COMBO_BONUS;
      this.ultimateCharge = Math.min(CFG.PLAYER.ULTIMATE_MAX_CHARGE, this.ultimateCharge + chargeGain);

      // 4. Handle Enemy Defeat
      if (defeated) {
        this.enemiesDefeated++;
        this.ui.unlockAchievement('first_blood');
        if (this.score >= 15000) this.ui.unlockAchievement('score_15k');

        const isBoss = enemy.typeId === 'miniboss';
        this.effects.spawnEnemyDefeatBurst(enemy.x, enemy.y, enemy.archetype.color, isBoss);

        if (isBoss) {
          this.audio.playBossDefeat();
          this.effects.triggerShake(14, 0.45);
          this.effects.triggerFlash('#fde047', 0.35);
          this.cinematicSlowMoTimer = 0.9;
          this.ui.unlockAchievement('boss_slayer');
          this.ui.showWaveBanner('DREADNOUGHT DESTROYED!', '+1,000 Bonus Score!', false);
        } else {
          this.audio.playEnemyDefeat(enemy.typeId !== 'normal');
        }

        // Splitter Enemy spawns 2 Gremlin Paratroopers!
        if (enemy.archetype.splitsOnDefeat) {
          const snapshot = this.spawner.getDifficultySnapshot(this.elapsedSeconds, this.score);
          const children = this.spawner.spawnSplitChildren(enemy, snapshot, this.width, this.height);
          this.enemies.push(...children);
          this.effects.spawnFloatingText(enemy.x, enemy.y, 'SPLIT!', '#fb7185', 1.1);
        }

        // Chance to spawn a Power-Up Orb
        const orb = this.spawner.maybeCreatePowerUpOrb(enemy, this.width);
        if (orb) {
          this.powerupOrbs.push(orb);
        }
      }
    }

    _handleFailedStroke(points, feedbackText) {
      this.audio.playWrongSymbol();
      this.wizard.triggerFizzle();
      this.comboStreak = 0;
      this.comboTimer = 0;
      this.ui.showRecognitionFeedback(feedbackText, false);
      this.fadingStrokes.push({
        points,
        color: '#ef4444',
        alpha: 0.9,
        isSuccess: false
      });
    }

    // ------------------------------------------------------------------------
    // POWER-UPS & ULTIMATE ABILITY
    // ------------------------------------------------------------------------
    collectPowerUpOrb(orb, indexInArray) {
      if (orb.collected) return;
      orb.collected = true;
      if (indexInArray !== undefined) {
        this.powerupOrbs.splice(indexInArray, 1);
      }

      this.audio.playPowerupCollect();
      this.effects.spawnBalloonPop(orb.x, orb.y, orb.meta.color);
      this.effects.spawnFloatingText(orb.x, orb.y, `${orb.meta.icon} ${orb.meta.name}!`, orb.meta.color, 1.25);

      const type = orb.powerupType;
      const wizardX = this.width / 2;
      const staffTip = this.wizard.getStaffTipPosition(wizardX, this.groundY);

      if (type === 'slow_mo') {
        this.activePowerups.slow_mo = orb.meta.duration;
      } else if (type === 'freeze') {
        this.activePowerups.freeze = orb.meta.duration;
        this.effects.triggerFlash('#67e8f9', 0.25);
      } else if (type === 'shield') {
        if (this.activePowerups.shield > 0 && this.lives < CFG.PLAYER.MAX_LIVES) {
          this.lives++;
          this.effects.spawnFloatingText(wizardX, this.groundY - 60, '+1 WARD CRYSTAL!', '#fde047', 1.2);
        }
        this.activePowerups.shield = orb.meta.duration;
      } else if (type === 'auto_pop') {
        // Fires 3 homing bolts at the lowest/most dangerous enemies
        const targets = this.enemies
          .filter(e => e.state === 'descending' && e.balloons.length > 0)
          .sort((a, b) => b.y - a.y)
          .slice(0, 3);
        for (const t of targets) {
          const symId = t.getTargetableSymbols()[0];
          if (symId) {
            const out = t.tryPopSymbol(symId);
            if (out && !out.decoyTriggered) {
              this._handleBalloonPopped(t, out, Symbols.DEFINITIONS[symId], 1.0, staffTip);
            }
          }
        }
      } else if (type === 'screen_wipe') {
        this._popOneBalloonOnAllEnemies(staffTip);
      }
    }

    triggerUltimateSpell() {
      if (this.state !== 'playing' || this.ultimateCharge < CFG.PLAYER.ULTIMATE_MAX_CHARGE) return;
      this.ultimateCharge = 0;

      this.audio.playUltimateCast();
      this.wizard.triggerUltimate();
      this.effects.triggerShake(12, 0.4);
      this.effects.triggerFlash('#fde047', 0.4);
      this.cinematicSlowMoTimer = 0.65;

      const staffTip = this.wizard.getStaffTipPosition(this.width / 2, this.groundY);
      this.effects.spawnFloatingText(
        this.width / 2,
        this.height * 0.28,
        '⚡ ASTRAL CATACLYSM! ⚡',
        '#fde047',
        1.45
      );

      this._popOneBalloonOnAllEnemies(staffTip);
    }

    _popOneBalloonOnAllEnemies(staffTip) {
      for (const enemy of this.enemies) {
        if (enemy.state === 'descending' && enemy.balloons.length > 0) {
          const symId = enemy.getTargetableSymbols()[0];
          if (symId) {
            const out = enemy.tryPopSymbol(symId);
            if (out && !out.decoyTriggered) {
              this._handleBalloonPopped(enemy, out, Symbols.DEFINITIONS[symId], 1.0, staffTip);
            }
          }
        }
      }
    }

    getComboMultiplier() {
      return Math.min(
        CFG.SCORING.MAX_COMBO_MULTIPLIER,
        1 + Math.floor(this.comboStreak / CFG.SCORING.COMBO_STEP)
      );
    }

    // ------------------------------------------------------------------------
    // GAME LIFECYCLE (Start, Pause, Game Over, Menu)
    // ------------------------------------------------------------------------
    startNewGame(mode = 'endless') {
      this.gameMode = mode;
      this.state = 'playing';

      this.score = 0;
      this.lives = CFG.PLAYER.INITIAL_LIVES;
      this.elapsedSeconds = 0;
      this.comboStreak = 0;
      this.maxCombo = 0;
      this.comboTimer = 0;
      this.ultimateCharge = 0;
      this.enemiesDefeated = 0;
      this.strokesAttempted = 0;
      this.strokesSucceeded = 0;
      this.rushOvertimeTriggered = false;

      this.enemies = [];
      this.powerupOrbs = [];
      this.activePowerups = { slow_mo: 0, freeze: 0, shield: 0 };
      this.cinematicSlowMoTimer = 0;
      this.currentStroke = [];
      this.fadingStrokes = [];

      this.spawner.reset(mode);
      this.audio.setDifficultyPhase(0);
      this.audio.startMusic();

      this.ui.showHUD();
      const modeTitles = {
        endless: 'Phase I: Dawn Breeze',
        rush: `⚡ RUSH MODE — ${this.currentPlayerName}`,
        blitz: `⚡ RUSH MODE — ${this.currentPlayerName}`,
        daily: 'Daily Sigil Trial'
      };
      const subTitles = {
        rush: 'Survive 90s to enter Overtime & climb the Leaderboard!',
        blitz: 'Survive 90s to enter Overtime & climb the Leaderboard!'
      };
      this.ui.showWaveBanner(
        modeTitles[mode] || 'Phase I: Dawn Breeze',
        subTitles[mode] || 'Draw the runes to pop the balloons!'
      );
    }

    togglePause(forceState) {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      const shouldPause = forceState !== undefined ? forceState : this.state === 'playing';
      if (shouldPause) {
        this.state = 'paused';
        this.audio.stopMusic();
        this.ui.openModal('pause');
      } else {
        this.state = 'playing';
        this.audio.startMusic();
        this.ui.hideAllModals();
      }
    }

    returnToMainMenu() {
      this.state = 'menu';
      this.audio.stopMusic();
      this.enemies = [];
      this.powerupOrbs = [];
      if (this.camera) {
        this.camera.closeSetupModal();
        if (this.camera.pipContainer) this.camera.pipContainer.classList.add('hidden');
        if (this.camera.handLostBanner) this.camera.handLostBanner.classList.add('hidden');
      }
      this.ui.showMainMenu();
    }

    triggerGameOver(reason = 'The Spire Ward Shattered!') {
      this.state = 'gameover';
      this.audio.stopMusic();

      const snapshot = this.spawner.getDifficultySnapshot(this.elapsedSeconds, this.score);
      const accuracy = this.strokesAttempted > 0
        ? Math.round((this.strokesSucceeded / this.strokesAttempted) * 100)
        : 100;

      const isRush = this.gameMode === 'rush' || this.gameMode === 'blitz';
      const regSec = CFG.RUSH_MODE?.REGULATION_SECONDS || 90;
      const overtimeSeconds = isRush ? Math.max(0, Math.floor(this.elapsedSeconds - regSec)) : 0;

      const recordOutcome = this.ui.recordRunResult({
        mode: this.gameMode,
        playerName: this.currentPlayerName,
        score: Math.floor(this.score),
        survivalTime: this.elapsedSeconds,
        overtimeSeconds,
        maxCombo: this.maxCombo,
        accuracy,
        phaseName: snapshot.phase.name,
        enemiesDefeated: this.enemiesDefeated
      });

      if (recordOutcome.isNewHighScore || (isRush && recordOutcome.madeLeaderboard && recordOutcome.rushRank <= 3)) {
        this.audio.playHighScoreFanfare();
        this.effects.spawnEnemyDefeatBurst(this.width / 2, this.height * 0.35, '#fde047', true);
      } else {
        this.audio.playGameOver();
      }

      this.ui.showGameOverModal({
        reason,
        mode: this.gameMode,
        playerName: this.currentPlayerName,
        score: this.score,
        highScore: this.ui.getHighScore(this.gameMode),
        survivalTime: this.elapsedSeconds,
        overtimeSeconds,
        maxCombo: this.maxCombo,
        enemiesDefeated: this.enemiesDefeated,
        accuracy,
        phaseName: snapshot.phase.name,
        isNewHighScore: recordOutcome.isNewHighScore,
        rushRank: recordOutcome.rushRank,
        madeLeaderboard: recordOutcome.madeLeaderboard
      });
    }

    // ------------------------------------------------------------------------
    // MAIN UPDATE & RENDER LOOP
    // ------------------------------------------------------------------------
    _loop(timestamp) {
      const rawDt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastFrameTime) / 1000));
      this.lastFrameTime = timestamp;

      this._update(rawDt);
      this._render(timestamp / 1000);

      requestAnimationFrame(ts => this._loop(ts));
    }

    _update(rawDt) {
      // Always update CameraController (handles pre-game calibration & in-game air drawing)
      if (this.camera) {
        this.camera.update(rawDt, this.state === 'playing');
      }

      if (this.state === 'menu') {
        this.effects.update(rawDt, 0.8);
        this.wizard.update(rawDt, this.width / 2, this.height * 0.3, this.width / 2, this.groundY);
        return;
      }

      if (this.state !== 'playing') return;

      // Check if Camera Mode has temporarily paused enemy pressure due to lost hand tracking
      const handLossPaused = this.camera && this.camera.shouldPauseGameplayForHandLoss();

      // Apply cinematic slow-motion on boss kills / multi-casts
      let dt = handLossPaused ? 0 : rawDt;
      if (!handLossPaused && this.cinematicSlowMoTimer > 0) {
        this.cinematicSlowMoTimer = Math.max(0, this.cinematicSlowMoTimer - rawDt);
        dt = rawDt * 0.35;
      }

      // Allow camera index fingertip to touch/slice floating Power-Up Orbs directly
      if (this.camera && this.camera.isCameraModeEnabled() && this.camera.handDetected) {
        const fx = this.camera.screenX;
        const fy = this.camera.screenY;
        for (let i = this.powerupOrbs.length - 1; i >= 0; i--) {
          const orb = this.powerupOrbs[i];
          if (Math.hypot(orb.x - fx, orb.y - fy) <= orb.radius + 18) {
            this.collectPowerUpOrb(orb, i);
          }
        }
      }

      this.elapsedSeconds += dt;

      // Check survival time achievements & Rush Overtime transition
      if (this.elapsedSeconds >= 120) this.ui.unlockAchievement('survive_120');
      if (this.elapsedSeconds >= 180) this.ui.unlockAchievement('survive_180');

      const isRush = this.gameMode === 'rush' || this.gameMode === 'blitz';
      const regSec = CFG.RUSH_MODE?.REGULATION_SECONDS || 90;
      if (isRush && !this.rushOvertimeTriggered && this.elapsedSeconds >= regSec) {
        this.rushOvertimeTriggered = true;
        this.audio.playOvertimeStart();
        this.effects.triggerFlash('#fbbf24', 0.28);
        this.ui.showWaveBanner(
          '🔥 RUSH OVERTIME! 🔥',
          'Regulation cleared! Survive Overtime for higher Leaderboard Rank!',
          true
        );
      }

      // Update active power-up durations
      for (const k of Object.keys(this.activePowerups)) {
        if (this.activePowerups[k] > 0) {
          this.activePowerups[k] = Math.max(0, this.activePowerups[k] - dt);
        }
      }

      // Combo decay timer
      if (this.comboStreak > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.comboStreak = 0;
        }
      }

      // Update Spawner & Difficulty Snapshot
      const snapshot = handLossPaused
        ? this.spawner.getDifficultySnapshot(this.elapsedSeconds, this.score)
        : this.spawner.update(
            dt,
            this.elapsedSeconds,
            this.score,
            this.enemies,
            this.width,
            this.height,
            {
              onPhaseChange: (phase, idx) => {
                this.audio.setDifficultyPhase(idx);
                this.ui.showWaveBanner(phase.name, phase.subtitle, idx >= 2);
              },
              onMiniBossSpawn: () => {
                this.audio.playBossWarning();
                this.ui.showWaveBanner('⚠️ DREADNOUGHT ZEPPELIN! ⚠️', 'Pop its sequential runes before impact!', true);
              }
            }
          );

      // Compute enemy descent speed modifier from Freeze / Slow-Mo / Hand-Loss Pause
      let enemySpeedMod = 1.0;
      if (this.activePowerups.freeze > 0 || handLossPaused) {
        enemySpeedMod = 0.0;
      } else if (this.activePowerups.slow_mo > 0) {
        enemySpeedMod = 0.35;
      }

      // Update Enemies & Check Landings
      let lowestEnemy = null;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        const status = enemy.update(dt, enemySpeedMod, this.width, this.groundY);

        if (status === 'landed') {
          this._handleEnemyLanded(enemy);
          this.enemies.splice(i, 1);
          if (this.lives <= 0) {
            this.triggerGameOver();
            return;
          }
          continue;
        }

        if (enemy.state === 'dead') {
          this.enemies.splice(i, 1);
          continue;
        }

        if (enemy.state === 'descending') {
          if (!lowestEnemy || enemy.y > lowestEnemy.y) {
            lowestEnemy = enemy;
          }
        }
      }

      // Update Floating Power-Up Orbs
      for (let i = this.powerupOrbs.length - 1; i >= 0; i--) {
        const expired = this.powerupOrbs[i].update(dt, this.groundY);
        if (expired) {
          this.powerupOrbs.splice(i, 1);
        }
      }

      // Fade completed strokes
      for (let i = this.fadingStrokes.length - 1; i >= 0; i--) {
        this.fadingStrokes[i].alpha -= rawDt * 2.8;
        if (this.fadingStrokes[i].alpha <= 0) {
          this.fadingStrokes.splice(i, 1);
        }
      }

      // Update Wizard & Effects
      const lookX = lowestEnemy ? lowestEnemy.x : this.width / 2;
      const lookY = lowestEnemy ? lowestEnemy.y : this.height * 0.35;
      this.wizard.update(rawDt, lookX, lookY, this.width / 2, this.groundY);
      this.effects.update(rawDt, snapshot.speedMultiplier);

      // Update DOM HUD
      this.ui.updateHUD({
        score: this.score,
        highScore: this.ui.getHighScore(this.gameMode),
        elapsedSeconds: this.elapsedSeconds,
        phaseName: snapshot.phase.name,
        lives: this.lives,
        maxLives: CFG.PLAYER.MAX_LIVES,
        comboMultiplier: this.getComboMultiplier(),
        comboStreak: this.comboStreak,
        comboTimeRemaining: this.comboTimer,
        comboTimeoutMax: CFG.SCORING.COMBO_TIMEOUT_SECONDS,
        ultimateCharge: this.ultimateCharge,
        ultimateMax: CFG.PLAYER.ULTIMATE_MAX_CHARGE,
        activePowerups: this.activePowerups,
        gameMode: this.gameMode,
        playerName: this.currentPlayerName
      });
    }

    _handleEnemyLanded(enemy) {
      if (this.activePowerups.shield > 0) {
        // Shield absorbs the impact!
        this.activePowerups.shield = 0;
        this.audio.playShieldBlock();
        this.effects.spawnEnemyDefeatBurst(enemy.x, this.groundY - 12, '#fde047', false);
        this.effects.spawnFloatingText(enemy.x, this.groundY - 35, '🛡️ AEGIS BLOCKED!', '#fde047', 1.25);
        return;
      }

      const dmg = enemy.archetype.damageOnLand || 1;
      this.lives = Math.max(0, this.lives - dmg);
      this.comboStreak = 0;
      this.comboTimer = 0;

      this.audio.playEnemyLand();
      this.effects.triggerShake(13, 0.35);
      this.effects.triggerFlash('#ef4444', 0.32);
      this.effects.spawnEnemyDefeatBurst(enemy.x, this.groundY - 10, '#ef4444', false);
      this.effects.spawnFloatingText(enemy.x, this.groundY - 35, `-${dmg} WARD SHATTERED!`, '#f87171', 1.2);
    }

    _render(timeSec) {
      const ctx = this.ctx;
      const snapshot = this.spawner.getDifficultySnapshot(this.elapsedSeconds, this.score);

      // Determine sky palette (either dynamic phase sky or user-selected theme override)
      const themeObj = CFG.THEMES[this.selectedTheme];
      const skyColors = (themeObj && themeObj.overrideSky) ? themeObj.overrideSky : snapshot.skyColors;

      ctx.save();
      const shake = this.effects.getShakeOffset();
      ctx.translate(shake.x, shake.y);

      // 1. Parallax Sky, Weather & Battlement Courtyard
      this.effects.renderBackground(
        ctx,
        this.width,
        this.height,
        skyColors,
        snapshot.weatherIntensity,
        this.groundY,
        timeSec
      );

      // 2. Guardian Wizard on the Parapet
      this.wizard.render(
        ctx,
        this.width / 2,
        this.groundY,
        this.activePowerups.shield > 0,
        this.ultimateCharge >= CFG.PLAYER.ULTIMATE_MAX_CHARGE
      );

      // 3. Floating Power-Up Orbs
      for (const orb of this.powerupOrbs) {
        orb.render(ctx);
      }

      // 4. Descending Enemies & Balloons
      const isFrozen = this.activePowerups.freeze > 0;
      for (const enemy of this.enemies) {
        enemy.render(ctx, timeSec, this.groundY, isFrozen);
      }

      // 5. Foreground Beams, Particles & Floating Score Popups
      this.effects.renderForeground(ctx, this.width, this.height);

      // 6. Player Gesture Ink Trail (Active + Fading)
      this._renderGestureTrails(ctx);

      // 7. Camera Index Fingertip Cursor & Air-Drawing Trail
      if (this.camera) {
        this.camera.renderOnGameCanvas(ctx);
      }

      ctx.restore();
    }

    _renderGestureTrails(ctx) {
      // Render fading recent strokes
      for (const fs of this.fadingStrokes) {
        if (fs.points.length < 2) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fs.alpha);
        ctx.strokeStyle = fs.color;
        ctx.shadowColor = fs.color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = fs.isSuccess ? 7 : 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < fs.points.length; i++) {
          const [x, y] = fs.points[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Render active stroke currently being drawn by player
      if (this.isDrawing && this.currentStroke.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < this.currentStroke.length; i++) {
          const [x, y] = this.currentStroke[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Bright white inner core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Bootstrap game on DOMContentLoaded
  window.addEventListener('DOMContentLoaded', () => {
    window.Aetherward.gameInstance = new Game();
  });
})();
