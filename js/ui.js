/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - UI, Storage, Grimoire & Rush UI (js/ui.js)
 * ============================================================================
 * Manages DOM screens (Main Menu, Rush Name Entry, Rush Arcade Leaderboard,
 * Clear Confirmation Dialog, Grimoire/Tutorial + Interactive Practice Pad,
 * High Scores & Achievements, Settings, Pause, Game Over) and HUD updates.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const STORAGE_KEY = 'aetherward_save_v1';
  const Symbols = window.Aetherward.Symbols;
  const RushLB = window.Aetherward.RushLeaderboard;
  const CFG = window.Aetherward.CONFIG;

  const ACHIEVEMENT_DEFS = [
    { id: 'first_blood', name: 'Apprentice Spark', desc: 'Defeat your first sky-raider.', icon: '✨' },
    { id: 'combo_10', name: 'Runic Flow', desc: 'Reach a 10x consecutive symbol streak.', icon: '🔥' },
    { id: 'combo_25', name: 'Grand Calligrapher', desc: 'Reach a 25x consecutive symbol streak.', icon: '👑' },
    { id: 'multicast_3', name: 'Chain Lightning', desc: 'Pop 3 or more balloons with a single drawn rune.', icon: '⚡' },
    { id: 'boss_slayer', name: 'Airship Breaker', desc: 'Destroy a Dreadnought Zeppelin Mini-Boss.', icon: '🛸' },
    { id: 'survive_120', name: 'Tempest Warden', desc: 'Survive for at least 2 minutes (120s) in a single run.', icon: '🌩️' },
    { id: 'survive_180', name: 'Eclipse Archmage', desc: 'Reach Phase IV: Chaos Eclipse (180s).', icon: '🌘' },
    { id: 'score_15k', name: 'Legend of Aetherward', desc: 'Score 15,000 or more points in a single match.', icon: '🏆' }
  ];

  class UIManager {
    constructor(audio, recognizer) {
      this.audio = audio;
      this.recognizer = recognizer;
      this.saveData = this._loadSaveData();

      // Apply saved audio settings immediately
      this.audio.setSfxEnabled(this.saveData.settings.sfxEnabled);
      this.audio.setMusicEnabled(this.saveData.settings.musicEnabled);
      this.audio.setMasterVolume(this.saveData.settings.masterVolume);

      this.practicePoints = [];
      this.isPracticeDrawing = false;
      this.latestRushRecordId = null;
      this.onRushNameConfirmed = null;

      this._cacheElements();
      this._bindEvents();
      this._renderGrimoireSymbolCards();
      this._initPracticeCanvas();
      this.syncSettingsUI();
    }

    _loadSaveData() {
      const defaults = {
        highScores: {
          endless: 0,
          rush: 0,
          daily: 0,
          dailyDate: ''
        },
        bestSurvivalTime: 0,
        bestCombo: 0,
        totalEnemiesDefeated: 0,
        unlockedAchievements: [],
        recentRuns: [],
        settings: {
          sfxEnabled: true,
          musicEnabled: true,
          masterVolume: 0.75,
          reducedEffects: false,
          extraForgiving: false,
          camPauseOnLost: true,
          camHoldTime: 'normal',
          theme: 'dynamic'
        }
      };

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
          ...defaults,
          ...parsed,
          highScores: { ...defaults.highScores, ...(parsed.highScores || {}) },
          settings: { ...defaults.settings, ...(parsed.settings || {}) }
        };
      } catch (e) {
        return defaults;
      }
    }

    _persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.saveData));
      } catch (e) {
        // Ignore storage quota errors in private browsing
      }
    }

    _getTodayString() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    getHighScore(mode = 'endless') {
      if (mode === 'rush' || mode === 'blitz') {
        return RushLB.getRushHighScore();
      }
      if (mode === 'daily') {
        const today = this._getTodayString();
        if (this.saveData.highScores.dailyDate !== today) {
          return 0;
        }
      }
      return this.saveData.highScores[mode] || 0;
    }

    /**
     * Records a completed match. If `mode === 'rush'`, saves the full arcade
     * record into `RushLeaderboard` and returns rank & high-score metadata.
     */
    recordRunResult({
      mode,
      playerName = 'PLAYER',
      score,
      survivalTime,
      overtimeSeconds = 0,
      maxCombo,
      accuracy,
      phaseName,
      enemiesDefeated
    }) {
      const today = this._getTodayString();
      let isNewHighScore = false;
      let rushRank = null;
      let madeLeaderboard = false;
      let rushRecord = null;

      if (mode === 'rush' || mode === 'blitz') {
        const rushResult = RushLB.saveRushScore({
          playerName,
          score: Math.floor(score),
          overtimeSeconds: Math.floor(overtimeSeconds),
          totalMatchSeconds: Math.floor(survivalTime),
          highestCombo: maxCombo,
          accuracy,
          date: today
        });
        isNewHighScore = rushResult.isNewHighScore;
        rushRank = rushResult.rank;
        madeLeaderboard = rushResult.madeLeaderboard;
        rushRecord = rushResult.record;
        this.latestRushRecordId = rushRecord.id;
        this.saveData.highScores.rush = RushLB.getRushHighScore();
      } else {
        if (mode === 'daily' && this.saveData.highScores.dailyDate !== today) {
          this.saveData.highScores.daily = 0;
          this.saveData.highScores.dailyDate = today;
        }
        const prevBest = this.saveData.highScores[mode] || 0;
        isNewHighScore = score > prevBest && score > 0;
        if (isNewHighScore) {
          this.saveData.highScores[mode] = Math.floor(score);
          if (mode === 'daily') this.saveData.highScores.dailyDate = today;
        }
      }

      if (survivalTime > this.saveData.bestSurvivalTime) {
        this.saveData.bestSurvivalTime = survivalTime;
      }
      if (maxCombo > this.saveData.bestCombo) {
        this.saveData.bestCombo = maxCombo;
      }
      this.saveData.totalEnemiesDefeated += enemiesDefeated;

      this.saveData.recentRuns.unshift({
        mode,
        score: Math.floor(score),
        survivalTime: Math.floor(survivalTime),
        maxCombo,
        accuracy,
        phaseName,
        date: today
      });
      this.saveData.recentRuns = this.saveData.recentRuns.slice(0, 8);
      this._persist();

      return {
        isNewHighScore,
        rushRank,
        madeLeaderboard,
        rushRecord
      };
    }

    unlockAchievement(id) {
      if (this.saveData.unlockedAchievements.includes(id)) return false;
      const def = ACHIEVEMENT_DEFS.find(a => a.id === id);
      if (!def) return false;

      this.saveData.unlockedAchievements.push(id);
      this._persist();
      this.showToast(`${def.icon} Achievement Unlocked: ${def.name}`);
      return true;
    }

    _cacheElements() {
      // Screens & Modals
      this.screens = {
        menu: document.getElementById('screen-menu'),
        hud: document.getElementById('screen-hud'),
        pause: document.getElementById('modal-pause'),
        gameover: document.getElementById('modal-gameover'),
        grimoire: document.getElementById('modal-grimoire'),
        scores: document.getElementById('modal-scores'),
        settings: document.getElementById('modal-settings'),
        rushName: document.getElementById('modal-rush-name'),
        rushLeaderboard: document.getElementById('modal-rush-leaderboard'),
        confirmClearRush: document.getElementById('modal-confirm-clear-rush')
      };

      // HUD Elements
      this.hudScore = document.getElementById('hud-score');
      this.hudBest = document.getElementById('hud-best');
      this.hudTime = document.getElementById('hud-time');
      this.hudPhase = document.getElementById('hud-phase');
      this.hudTimerPill = document.getElementById('hud-timer-pill');
      this.hudLives = document.getElementById('hud-lives');
      this.hudComboBadge = document.getElementById('hud-combo-badge');
      this.hudComboValue = document.getElementById('hud-combo-value');
      this.hudComboBar = document.getElementById('hud-combo-bar');
      this.hudPowerups = document.getElementById('hud-active-powerups');
      this.hudUltimateBtn = document.getElementById('btn-ultimate');
      this.hudUltimateFill = document.getElementById('ultimate-meter-fill');
      this.hudUltimatePct = document.getElementById('ultimate-meter-pct');
      this.hudBanner = document.getElementById('hud-wave-banner');
      this.hudBannerTitle = document.getElementById('hud-banner-title');
      this.hudBannerSub = document.getElementById('hud-banner-sub');
      this.hudRecognitionFeedback = document.getElementById('hud-recognition-pill');

      // Rush Name Entry & Leaderboard Elements
      this.formRushName = document.getElementById('form-rush-name');
      this.inputRushName = document.getElementById('input-rush-player-name');
      this.rushLbTbody = document.getElementById('rush-leaderboard-tbody');
      this.rushLbEmpty = document.getElementById('rush-leaderboard-empty');
      this.rushInspector = document.getElementById('rush-record-inspector');

      // Toast container
      this.toastContainer = document.getElementById('toast-container');
    }

    _bindEvents() {
      // Quick sound toggle on main menu & HUD
      const muteBtns = document.querySelectorAll('.js-toggle-mute');
      muteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const newState = !this.saveData.settings.sfxEnabled;
          this.saveData.settings.sfxEnabled = newState;
          this.saveData.settings.musicEnabled = newState;
          this.audio.setSfxEnabled(newState);
          this.audio.setMusicEnabled(newState);
          this._persist();
          this.syncSettingsUI();
        });
      });

      // Rush Mode Name Entry Form submission
      if (this.formRushName) {
        this.formRushName.addEventListener('submit', e => {
          e.preventDefault();
          this.audio.playUIClick();
          const rawVal = this.inputRushName ? this.inputRushName.value : '';
          const finalName = RushLB.sanitizePlayerName(rawVal);
          RushLB.saveLastPlayerName(finalName);
          this.closeModal('rushName');
          if (this.onRushNameConfirmed) {
            this.onRushNameConfirmed(finalName);
          }
        });
      }

      // Open Rush Leaderboard from Rush Name Entry modal
      const btnRushMenuLb = document.getElementById('btn-rush-menu-leaderboard');
      if (btnRushMenuLb) {
        btnRushMenuLb.addEventListener('click', () => {
          this.openRushLeaderboard();
        });
      }

      // Open Rush Leaderboard from General High Scores modal
      const btnScoresOpenRushLb = document.getElementById('btn-scores-open-rush-lb');
      if (btnScoresOpenRushLb) {
        btnScoresOpenRushLb.addEventListener('click', () => {
          this.closeModal('scores');
          this.openRushLeaderboard();
        });
      }

      // Clear Rush Leaderboard -> Open Confirmation Dialog (never erase immediately!)
      const btnOpenClearConfirm = document.getElementById('btn-open-clear-rush-confirm');
      if (btnOpenClearConfirm) {
        btnOpenClearConfirm.addEventListener('click', () => {
          this.audio.playUIClick();
          this.screens.confirmClearRush.classList.remove('hidden');
        });
      }

      // Cancel Clear Rush Leaderboard
      const btnCancelClear = document.getElementById('btn-cancel-clear-rush');
      if (btnCancelClear) {
        btnCancelClear.addEventListener('click', () => {
          this.audio.playUIClick();
          this.screens.confirmClearRush.classList.add('hidden');
        });
      }

      // Confirm Clear Rush Leaderboard
      const btnConfirmClear = document.getElementById('btn-confirm-clear-rush');
      if (btnConfirmClear) {
        btnConfirmClear.addEventListener('click', () => {
          this.audio.playUIClick();
          RushLB.clearRushScores();
          this.saveData.highScores.rush = 0;
          this.latestRushRecordId = null;
          this._persist();
          this.screens.confirmClearRush.classList.add('hidden');
          this.renderRushLeaderboard();
          this.syncSettingsUI();
          this.showToast('🗑️ Rush Mode Leaderboard Cleared!');
        });
      }

      // Settings inputs
      const chkSfx = document.getElementById('setting-sfx');
      const chkMusic = document.getElementById('setting-music');
      const rngVolume = document.getElementById('setting-volume');
      const chkReduced = document.getElementById('setting-reduced-fx');
      const chkForgiving = document.getElementById('setting-forgiving');
      const selTheme = document.getElementById('setting-theme');

      if (chkSfx) {
        chkSfx.addEventListener('change', e => {
          this.saveData.settings.sfxEnabled = e.target.checked;
          this.audio.setSfxEnabled(e.target.checked);
          this.audio.playUIClick();
          this._persist();
          this.syncSettingsUI();
        });
      }

      if (chkMusic) {
        chkMusic.addEventListener('change', e => {
          this.saveData.settings.musicEnabled = e.target.checked;
          this.audio.setMusicEnabled(e.target.checked);
          this._persist();
          this.syncSettingsUI();
        });
      }

      if (rngVolume) {
        rngVolume.addEventListener('input', e => {
          const val = parseFloat(e.target.value);
          this.saveData.settings.masterVolume = val;
          this.audio.setMasterVolume(val);
          this._persist();
        });
      }

      if (chkReduced) {
        chkReduced.addEventListener('change', e => {
          this.saveData.settings.reducedEffects = e.target.checked;
          this._persist();
          if (this.onSettingsChanged) this.onSettingsChanged(this.saveData.settings);
        });
      }

      if (chkForgiving) {
        chkForgiving.addEventListener('change', e => {
          this.saveData.settings.extraForgiving = e.target.checked;
          this._persist();
          if (this.onSettingsChanged) this.onSettingsChanged(this.saveData.settings);
        });
      }

      if (selTheme) {
        selTheme.addEventListener('change', e => {
          this.saveData.settings.theme = e.target.value;
          this._persist();
          if (this.onSettingsChanged) this.onSettingsChanged(this.saveData.settings);
        });
      }

      const chkCamPause = document.getElementById('setting-cam-pause-lost');
      if (chkCamPause) {
        chkCamPause.addEventListener('change', e => {
          this.saveData.settings.camPauseOnLost = e.target.checked;
          this._persist();
          if (this.onSettingsChanged) this.onSettingsChanged(this.saveData.settings);
        });
      }

      const selCamGesture = document.getElementById('setting-cam-gesture');
      if (selCamGesture) {
        selCamGesture.addEventListener('change', e => {
          this.saveData.settings.camHoldTime = e.target.value;
          this._persist();
          if (this.onSettingsChanged) this.onSettingsChanged(this.saveData.settings);
        });
      }
    }

    syncSettingsUI(activeMode = null) {
      const s = this.saveData.settings;
      const chkSfx = document.getElementById('setting-sfx');
      const chkMusic = document.getElementById('setting-music');
      const rngVolume = document.getElementById('setting-volume');
      const chkReduced = document.getElementById('setting-reduced-fx');
      const chkForgiving = document.getElementById('setting-forgiving');
      const chkCamPause = document.getElementById('setting-cam-pause-lost');
      const selCamGesture = document.getElementById('setting-cam-gesture');
      const selTheme = document.getElementById('setting-theme');

      if (chkSfx) chkSfx.checked = s.sfxEnabled;
      if (chkMusic) chkMusic.checked = s.musicEnabled;
      if (rngVolume) rngVolume.value = s.masterVolume;
      if (chkReduced) chkReduced.checked = s.reducedEffects;
      if (chkForgiving) chkForgiving.checked = s.extraForgiving;
      if (chkCamPause) chkCamPause.checked = s.camPauseOnLost !== false;
      if (selCamGesture) selCamGesture.value = s.camHoldTime || 'normal';
      if (selTheme) selTheme.value = s.theme;

      const isMuted = !s.sfxEnabled && !s.musicEnabled;
      document.querySelectorAll('.js-toggle-mute').forEach(btn => {
        btn.textContent = isMuted ? '🔇 Audio Off' : '🔊 Audio On';
        btn.setAttribute('aria-pressed', String(!isMuted));
      });

      // Update menu high score preview for whichever mode is currently active
      const activeModeBtn = document.querySelector('.js-select-mode.active');
      const modeToQuery = activeMode || (activeModeBtn ? activeModeBtn.dataset.mode : 'endless');
      const menuBest = document.getElementById('menu-best-score');
      if (menuBest) {
        menuBest.textContent = this.getHighScore(modeToQuery).toLocaleString();
      }
    }

    // ------------------------------------------------------------------------
    // RUSH MODE NAME PROMPT & ARCADE LEADERBOARD
    // ------------------------------------------------------------------------
    openRushNamePrompt(onConfirm) {
      this.onRushNameConfirmed = onConfirm;
      const remembered = RushLB.getLastPlayerName();
      if (this.inputRushName) {
        this.inputRushName.value = remembered;
      }
      this.openModal('rushName');
      setTimeout(() => {
        if (this.inputRushName) {
          this.inputRushName.focus();
          this.inputRushName.select();
        }
      }, 40);
    }

    openRushLeaderboard(highlightRecordId = null) {
      if (highlightRecordId) {
        this.latestRushRecordId = highlightRecordId;
      }
      this.renderRushLeaderboard();
      this.openModal('rushLeaderboard');
    }

    renderRushLeaderboard() {
      const scores = RushLB.loadRushScores();
      const topScore = RushLB.getRushHighScore();
      const bestOT = RushLB.getRushBestOvertime();

      const topScoreEl = document.getElementById('rush-lb-top-score');
      const bestOtEl = document.getElementById('rush-lb-best-ot');
      const countEl = document.getElementById('rush-lb-count');
      const clearBtn = document.getElementById('btn-open-clear-rush-confirm');

      if (topScoreEl) topScoreEl.textContent = topScore.toLocaleString();
      if (bestOtEl) bestOtEl.textContent = `OT ${RushLB.formatTimeMMSS(bestOT)}`;
      if (countEl) countEl.textContent = `${scores.length} / ${RushLB.MAX_LEADERBOARD_ENTRIES}`;
      if (clearBtn) clearBtn.disabled = scores.length === 0;

      if (!this.rushLbTbody) return;
      this.rushLbTbody.innerHTML = '';

      if (scores.length === 0) {
        if (this.rushLbEmpty) this.rushLbEmpty.classList.remove('hidden');
        if (this.rushInspector) this.rushInspector.classList.add('hidden');
        return;
      }

      if (this.rushLbEmpty) this.rushLbEmpty.classList.add('hidden');

      let recordToInspect = scores[0];
      let inspectRank = 1;

      scores.forEach((rec, idx) => {
        const rank = idx + 1;
        const tr = document.createElement('tr');
        const isLatest = rec.id === this.latestRushRecordId;
        if (isLatest) {
          tr.classList.add('new-record-row');
          recordToInspect = rec;
          inspectRank = rank;
        }

        const rankClass = rank <= 3 ? `rank-${rank}` : '';
        const trophyPrefix = rank === 1 ? '🥇 ' : (rank === 2 ? '🥈 ' : (rank === 3 ? '🥉 ' : ''));
        const newTag = isLatest ? `<span class="new-record-pill">#${rank} NEW RECORD</span>` : '';

        tr.innerHTML = `
          <td class="rank-cell ${rankClass}">${trophyPrefix}#${rank}</td>
          <td><strong>${this._escapeHTML(rec.playerName)}</strong>${newTag}</td>
          <td class="score-cell">${Number(rec.score).toLocaleString()}</td>
          <td class="ot-cell">OT ${RushLB.formatTimeMMSS(rec.overtimeSeconds)}</td>
        `;

        tr.addEventListener('click', () => {
          this.audio.playUIClick();
          this.rushLbTbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
          tr.classList.add('selected-row');
          this._renderRecordInspector(rec, rank);
        });

        this.rushLbTbody.appendChild(tr);
      });

      this._renderRecordInspector(recordToInspect, inspectRank);
    }

    _renderRecordInspector(rec, rank) {
      if (!this.rushInspector || !rec) return;
      this.rushInspector.classList.remove('hidden');

      document.getElementById('inspector-title').textContent = `RECORD DETAILS — #${rank} ${rec.playerName}`;
      document.getElementById('inspector-date').textContent = `Recorded: ${rec.date || 'Today'}`;
      document.getElementById('inspector-score').textContent = Number(rec.score).toLocaleString();
      document.getElementById('inspector-ot').textContent = `OT ${RushLB.formatTimeMMSS(rec.overtimeSeconds)}`;
      document.getElementById('inspector-total-time').textContent = RushLB.formatTimeMMSS(rec.totalMatchSeconds);
      document.getElementById('inspector-combo').textContent = `${rec.highestCombo || 0}x`;
      document.getElementById('inspector-accuracy').textContent = `${rec.accuracy ?? 100}%`;
    }

    _escapeHTML(str) {
      return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    // ------------------------------------------------------------------------
    // MODAL & SCREEN NAVIGATION
    // ------------------------------------------------------------------------
    showMainMenu() {
      this.hideAllModals();
      this.screens.hud.classList.add('hidden');
      this.screens.menu.classList.remove('hidden');
      this.syncSettingsUI();
    }

    showHUD() {
      this.hideAllModals();
      this.screens.menu.classList.add('hidden');
      this.screens.hud.classList.remove('hidden');
    }

    openModal(modalName) {
      this.audio.playUIClick();
      const el = this.screens[modalName];
      if (!el) return;
      if (modalName === 'scores') {
        this._renderScoresAndAchievements();
      }
      el.classList.remove('hidden');
    }

    closeModal(modalName) {
      this.audio.playUIClick();
      const el = this.screens[modalName];
      if (el) el.classList.add('hidden');
    }

    hideAllModals() {
      ['pause', 'gameover', 'grimoire', 'scores', 'settings', 'rushName', 'rushLeaderboard', 'confirmClearRush'].forEach(k => {
        if (this.screens[k]) this.screens[k].classList.add('hidden');
      });
    }

    // ------------------------------------------------------------------------
    // LIVE HUD UPDATES
    // ------------------------------------------------------------------------
    updateHUD({
      score,
      highScore,
      elapsedSeconds,
      phaseName,
      lives,
      maxLives,
      comboMultiplier,
      comboStreak,
      comboTimeRemaining,
      comboTimeoutMax,
      ultimateCharge,
      ultimateMax,
      activePowerups,
      gameMode,
      playerName
    }) {
      this.hudScore.textContent = Math.floor(score).toLocaleString();
      this.hudBest.textContent = Math.floor(Math.max(score, highScore)).toLocaleString();

      const isRush = gameMode === 'rush' || gameMode === 'blitz';
      const regSec = CFG.RUSH_MODE?.REGULATION_SECONDS || 90;

      if (isRush) {
        if (elapsedSeconds < regSec) {
          // Regulation countdown (01:30 -> 00:00)
          const remaining = Math.max(0, Math.ceil(regSec - elapsedSeconds));
          this.hudTime.textContent = RushLB.formatTimeMMSS(remaining);
          this.hudPhase.textContent = `⚡ RUSH — ${playerName || 'PLAYER'}`;
          if (this.hudTimerPill) this.hudTimerPill.classList.remove('overtime-active');
        } else {
          // OVERTIME count-up (OT 00:01, OT 00:02...)
          const otSec = Math.floor(elapsedSeconds - regSec);
          this.hudTime.textContent = `OT ${RushLB.formatTimeMMSS(otSec)}`;
          this.hudPhase.textContent = `🔥 OVERTIME — ${playerName || 'PLAYER'}`;
          if (this.hudTimerPill) this.hudTimerPill.classList.add('overtime-active');
        }
      } else {
        this.hudTime.textContent = RushLB.formatTimeMMSS(elapsedSeconds);
        this.hudPhase.textContent = phaseName;
        if (this.hudTimerPill) this.hudTimerPill.classList.remove('overtime-active');
      }

      // Lives crystals
      let livesHTML = '';
      for (let i = 0; i < maxLives; i++) {
        if (i < lives) {
          livesHTML += `<span class="life-crystal active" title="Arcane Ward Crystal">💎</span>`;
        } else if (i < CFG.PLAYER.INITIAL_LIVES) {
          livesHTML += `<span class="life-crystal shattered" title="Shattered Ward">🪨</span>`;
        }
      }
      if (this._lastLivesHTML !== livesHTML) {
        this.hudLives.innerHTML = livesHTML;
        this._lastLivesHTML = livesHTML;
      }

      // Combo Multiplier & Decay Bar
      if (comboStreak >= 2) {
        this.hudComboBadge.classList.remove('inactive');
        this.hudComboValue.textContent = `${comboMultiplier}x (${comboStreak} Streak)`;
        const pct = Math.max(0, Math.min(100, (comboTimeRemaining / comboTimeoutMax) * 100));
        this.hudComboBar.style.width = `${pct}%`;
      } else {
        this.hudComboBadge.classList.add('inactive');
        this.hudComboValue.textContent = '1x';
        this.hudComboBar.style.width = '0%';
      }

      // Ultimate Ability Meter
      const ultPct = Math.min(100, Math.floor((ultimateCharge / ultimateMax) * 100));
      this.hudUltimateFill.style.width = `${ultPct}%`;
      this.hudUltimatePct.textContent = ultPct >= 100 ? 'READY! [SPACE]' : `${ultPct}%`;
      if (ultPct >= 100) {
        this.hudUltimateBtn.classList.add('ready');
        this.hudUltimateBtn.disabled = false;
      } else {
        this.hudUltimateBtn.classList.remove('ready');
        this.hudUltimateBtn.disabled = true;
      }

      // Active Power-Up Timers
      let phtml = '';
      for (const [id, remaining] of Object.entries(activePowerups)) {
        if (remaining > 0) {
          const meta = CFG.POWERUPS.TYPES[id];
          if (meta) {
            phtml += `<div class="powerup-pill" style="border-color:${meta.color}">
              <span>${meta.icon} ${meta.shortLabel}</span>
              <strong>${remaining.toFixed(1)}s</strong>
            </div>`;
          }
        }
      }
      if (this._lastPowerupHTML !== phtml) {
        this.hudPowerups.innerHTML = phtml;
        this._lastPowerupHTML = phtml;
      }
    }

    showWaveBanner(title, subtitle, isWarning = false) {
      if (!this.hudBanner) return;
      this.hudBannerTitle.textContent = title;
      this.hudBannerSub.textContent = subtitle;
      this.hudBanner.classList.toggle('warning', Boolean(isWarning));
      this.hudBanner.classList.remove('hidden');

      clearTimeout(this._bannerTimeout);
      this._bannerTimeout = setTimeout(() => {
        this.hudBanner.classList.add('hidden');
      }, 2800);
    }

    showRecognitionFeedback(text, isSuccess = true) {
      if (!this.hudRecognitionFeedback) return;
      this.hudRecognitionFeedback.textContent = text;
      this.hudRecognitionFeedback.className = `recognition-pill ${isSuccess ? 'success' : 'miss'}`;
      clearTimeout(this._recTimeout);
      this._recTimeout = setTimeout(() => {
        this.hudRecognitionFeedback.className = 'recognition-pill hidden';
      }, 950);
    }

    showToast(message) {
      if (!this.toastContainer) return;
      const toast = document.createElement('div');
      toast.className = 'achievement-toast';
      toast.textContent = message;
      this.toastContainer.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
      }, 3200);
    }

    showGameOverModal(stats) {
      const isRush = stats.mode === 'rush' || stats.mode === 'blitz';

      document.getElementById('go-score').textContent = Math.floor(stats.score).toLocaleString();
      document.getElementById('go-best').textContent = Math.floor(stats.highScore).toLocaleString();
      document.getElementById('go-time').textContent = RushLB.formatTimeMMSS(stats.survivalTime);
      document.getElementById('go-combo').textContent = `${stats.maxCombo}x`;
      document.getElementById('go-defeated').textContent = stats.enemiesDefeated;
      document.getElementById('go-accuracy').textContent = `${stats.accuracy}%`;

      const goTitle = document.getElementById('go-title');
      const goPhase = document.getElementById('go-phase');
      const otBox = document.getElementById('go-ot-box');
      const defeatedBox = document.getElementById('go-defeated-box');
      const goOvertime = document.getElementById('go-overtime');
      const newRecordBadge = document.getElementById('go-new-record');
      const rushRankBadge = document.getElementById('go-rush-rank-badge');
      const btnGameoverRushLb = document.getElementById('btn-gameover-rush-lb');

      if (isRush) {
        goTitle.textContent = 'Rush Run Complete!';
        goPhase.textContent = `Challenger: ${stats.playerName} • ${stats.phaseName}`;
        if (otBox) otBox.classList.remove('hidden');
        if (defeatedBox) defeatedBox.classList.add('hidden'); // Keep clean 6-card grid
        if (goOvertime) goOvertime.textContent = `OT ${RushLB.formatTimeMMSS(stats.overtimeSeconds)}`;
        if (btnGameoverRushLb) btnGameoverRushLb.classList.remove('hidden');

        // Highlight New High Score & Leaderboard Rank
        if (newRecordBadge) {
          newRecordBadge.textContent = '🏆 NEW RUSH RECORD! — NEW HIGH SCORE! 🏆';
          newRecordBadge.classList.toggle('hidden', !stats.isNewHighScore);
        }
        if (rushRankBadge) {
          if (stats.madeLeaderboard && stats.rushRank) {
            rushRankBadge.textContent = stats.rushRank === 1
              ? `🥇 #1 NEW RECORD — TOP OF LEADERBOARD!`
              : `🌟 #${stats.rushRank} NEW RECORD — ENTERED LEADERBOARD!`;
            rushRankBadge.classList.remove('hidden');
          } else {
            rushRankBadge.classList.add('hidden');
          }
        }
      } else {
        goTitle.textContent = 'Spire Overrun!';
        goPhase.textContent = stats.phaseName;
        if (otBox) otBox.classList.add('hidden');
        if (defeatedBox) defeatedBox.classList.remove('hidden');
        if (btnGameoverRushLb) btnGameoverRushLb.classList.add('hidden');

        if (newRecordBadge) {
          newRecordBadge.textContent = '🎉 NEW HIGH SCORE! 🎉';
          newRecordBadge.classList.toggle('hidden', !stats.isNewHighScore);
        }
        if (rushRankBadge) {
          rushRankBadge.classList.add('hidden');
        }
      }

      this.openModal('gameover');
    }

    // ------------------------------------------------------------------------
    // INTERACTIVE GRIMOIRE (SYMBOL CATALOG + LIVE PRACTICE PAD)
    // ------------------------------------------------------------------------
    _renderGrimoireSymbolCards() {
      const container = document.getElementById('grimoire-symbol-grid');
      if (!container) return;
      container.innerHTML = '';

      const tierLabels = {
        easy: 'Tier I: Apprentice Runes (0s+)',
        medium: 'Tier II: Adept Runes (30s+)',
        hard: 'Tier III: Master Runes (90s+)',
        expert: 'Tier IV: Archmage Precision Runes (180s+)'
      };

      for (const tier of ['easy', 'medium', 'hard', 'expert']) {
        const tierHeading = document.createElement('h4');
        tierHeading.className = `grimoire-tier-heading tier-${tier}`;
        tierHeading.textContent = tierLabels[tier];
        container.appendChild(tierHeading);

        const row = document.createElement('div');
        row.className = 'symbol-cards-row';

        const list = Symbols.getSymbolsByTiers([tier]);
        for (const sym of list) {
          const card = document.createElement('div');
          card.className = 'symbol-card';
          card.innerHTML = `
            <canvas width="72" height="72" class="symbol-preview-canvas" data-symbol="${sym.id}"></canvas>
            <div class="symbol-card-info">
              <strong>${sym.name}</strong>
              <span>${sym.hint}</span>
            </div>
          `;
          row.appendChild(card);

          const c = card.querySelector('canvas');
          const cctx = c.getContext('2d');
          Symbols.drawSymbolIcon(cctx, sym.id, 36, 36, 52, {
            color: '#ffffff',
            glowColor: sym.color,
            lineWidth: 5,
            showDirectionDot: true
          });
        }
        container.appendChild(row);
      }
    }

    _initPracticeCanvas() {
      const canvas = document.getElementById('practice-canvas');
      const resultEl = document.getElementById('practice-result');
      if (!canvas || !resultEl) return;

      const ctx = canvas.getContext('2d');
      const drawPrompt = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 10);
        ctx.lineTo(canvas.width / 2, canvas.height - 10);
        ctx.moveTo(10, canvas.height / 2);
        ctx.lineTo(canvas.width - 10, canvas.height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      drawPrompt();

      const getPos = e => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
      };

      canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this.isPracticeDrawing = true;
        this.practicePoints = [getPos(e)];
        drawPrompt();
      });

      canvas.addEventListener('pointermove', e => {
        if (!this.isPracticeDrawing) return;
        const pt = getPos(e);
        this.practicePoints.push(pt);
        drawPrompt();

        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < this.practicePoints.length; i++) {
          const [x, y] = this.practicePoints[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      });

      const endStroke = e => {
        if (!this.isPracticeDrawing) return;
        this.isPracticeDrawing = false;
        const allSymbolIds = new Set(Object.keys(Symbols.DEFINITIONS));
        const res = this.recognizer.recognize(this.practicePoints, {
          activeSymbols: allSymbolIds,
          isTouch: e.pointerType === 'touch',
          extraForgiving: true
        });

        if (res.symbolId) {
          const sym = Symbols.DEFINITIONS[res.symbolId];
          const pct = Math.round(res.confidence * 100);
          resultEl.innerHTML = `Matched: <strong style="color:${sym.color}">${sym.name}</strong> (${pct}% match)`;
          this.audio.playBalloonPop(4);
        } else {
          resultEl.innerHTML = `<span style="color:#f87171">Unrecognized stroke — try drawing larger & clearer!</span>`;
          this.audio.playWrongSymbol();
        }
      };

      canvas.addEventListener('pointerup', endStroke);
      canvas.addEventListener('pointercancel', endStroke);
    }

    // ------------------------------------------------------------------------
    // HIGH SCORES & ACHIEVEMENTS RENDERER
    // ------------------------------------------------------------------------
    _renderScoresAndAchievements() {
      document.getElementById('score-endless').textContent = this.getHighScore('endless').toLocaleString();
      const scoreRushEl = document.getElementById('score-rush');
      if (scoreRushEl) {
        scoreRushEl.textContent = this.getHighScore('rush').toLocaleString();
      }
      document.getElementById('score-daily').textContent = this.getHighScore('daily').toLocaleString();
      document.getElementById('stat-best-combo').textContent = `${this.saveData.bestCombo}x`;
      document.getElementById('stat-total-defeated').textContent = this.saveData.totalEnemiesDefeated.toLocaleString();

      const achList = document.getElementById('achievements-list');
      if (achList) {
        achList.innerHTML = ACHIEVEMENT_DEFS.map(a => {
          const unlocked = this.saveData.unlockedAchievements.includes(a.id);
          return `
            <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
              <div class="ach-icon">${unlocked ? a.icon : '🔒'}</div>
              <div class="ach-body">
                <strong>${a.name}</strong>
                <span>${a.desc}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  window.Aetherward.UIManager = UIManager;
})();
