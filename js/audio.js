/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Web Audio Synthesizer & Adaptive Music (js/audio.js)
 * ============================================================================
 * Zero-dependency procedural sound engine using the browser's Web Audio API.
 * Generates all sound effects and a dynamic multi-layered fantasy-arcade
 * soundtrack whose tempo and instrumentation scale with difficulty phase.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  class AudioManager {
    constructor() {
      this.ctx = null;
      this.sfxEnabled = true;
      this.musicEnabled = true;
      this.masterVolume = 0.75;

      // Adaptive music state
      this.isPlayingMusic = false;
      this.musicPhase = 0; // 0..3 matching difficulty phase
      this.musicStep = 0;
      this.musicTimer = null;

      // Pentatonic / Dorian scale frequencies (D minor / F major magical feel)
      this.scaleFreqs = [
        293.66, // D4
        329.63, // E4
        349.23, // F4
        392.00, // G4
        440.00, // A4
        493.88, // B4
        523.25, // C5
        587.33, // D5
        659.25, // E5
        698.46, // F5
        783.99, // G5
        880.00, // A5
        1046.50 // C6
      ];
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    setSfxEnabled(enabled) {
      this.sfxEnabled = Boolean(enabled);
    }

    setMusicEnabled(enabled) {
      this.musicEnabled = Boolean(enabled);
      if (!this.musicEnabled) {
        this.stopMusic();
      }
    }

    setMasterVolume(val) {
      this.masterVolume = Math.max(0, Math.min(1, val));
    }

    setDifficultyPhase(phaseIndex) {
      this.musicPhase = Math.max(0, Math.min(3, phaseIndex));
    }

    // ------------------------------------------------------------------------
    // LOW-LEVEL SYNTHESIS HELPERS
    // ------------------------------------------------------------------------
    _playTone({ freq = 440, endFreq = null, type = 'sine', duration = 0.15, gain = 0.2, delay = 0 }) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }

      const peak = gain * this.masterVolume;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    _playNoise({ duration = 0.12, gain = 0.18, filterFreq = 1200, filterType = 'bandpass', delay = 0 }) {
      if (!this.sfxEnabled || !this.ctx) return;
      const now = this.ctx.currentTime + delay;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, now);

      const g = this.ctx.createGain();
      const peak = gain * this.masterVolume;
      g.gain.setValueAtTime(peak, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      noise.connect(filter);
      filter.connect(g);
      g.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + duration + 0.01);
    }

    // ------------------------------------------------------------------------
    // GAME SOUND EFFECTS
    // ------------------------------------------------------------------------
    playUIClick() {
      this.init();
      this._playTone({ freq: 580, endFreq: 780, type: 'triangle', duration: 0.06, gain: 0.14 });
    }

    playBalloonPop(comboCount = 1) {
      this.init();
      // Crisp rubber pop transient
      this._playTone({ freq: 240, endFreq: 680, type: 'sine', duration: 0.065, gain: 0.24 });
      this._playNoise({ duration: 0.055, gain: 0.18, filterFreq: 1800, filterType: 'highpass' });

      // Musical chime ascending with combo streak
      const idx = Math.min(this.scaleFreqs.length - 1, Math.max(0, comboCount - 1));
      const baseFreq = this.scaleFreqs[idx];
      this._playTone({ freq: baseFreq, endFreq: baseFreq * 1.01, type: 'triangle', duration: 0.24, gain: 0.22, delay: 0.02 });
      this._playTone({ freq: baseFreq * 1.5, type: 'sine', duration: 0.28, gain: 0.11, delay: 0.04 });
    }

    playEnemyDefeat(isSpecial = false) {
      this.init();
      if (isSpecial) {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => {
          this._playTone({ freq: f, type: 'triangle', duration: 0.22, gain: 0.18, delay: i * 0.045 });
        });
      } else {
        this._playTone({ freq: 440, endFreq: 880, type: 'sine', duration: 0.16, gain: 0.14, delay: 0.03 });
      }
    }

    playMultiCast(count = 2) {
      this.init();
      const chord = [440, 554.37, 659.25, 880, 1108.73];
      const limit = Math.min(chord.length, count + 2);
      for (let i = 0; i < limit; i++) {
        this._playTone({
          freq: chord[i],
          type: 'triangle',
          duration: 0.35,
          gain: 0.18,
          delay: i * 0.04
        });
      }
    }

    playWrongSymbol() {
      this.init();
      // Soft muted descending arcane fizzle
      this._playTone({ freq: 210, endFreq: 125, type: 'sawtooth', duration: 0.14, gain: 0.11 });
      this._playNoise({ duration: 0.09, gain: 0.08, filterFreq: 600, filterType: 'lowpass' });
    }

    playDecoyTriggered() {
      this.init();
      // Mischievous warbling laugh
      [420, 360, 440, 310].forEach((f, i) => {
        this._playTone({ freq: f, type: 'square', duration: 0.07, gain: 0.10, delay: i * 0.065 });
      });
    }

    playEnemyLand() {
      this.init();
      // Heavy impact + crystal ward shatter
      this._playTone({ freq: 140, endFreq: 38, type: 'sawtooth', duration: 0.38, gain: 0.34 });
      this._playNoise({ duration: 0.28, gain: 0.28, filterFreq: 900, filterType: 'bandpass' });
      this._playTone({ freq: 1200, endFreq: 420, type: 'sine', duration: 0.18, gain: 0.15, delay: 0.04 });
    }

    playShieldBlock() {
      this.init();
      this._playTone({ freq: 320, endFreq: 640, type: 'triangle', duration: 0.28, gain: 0.26 });
      this._playTone({ freq: 960, endFreq: 480, type: 'sine', duration: 0.25, gain: 0.18, delay: 0.03 });
    }

    playPowerupCollect() {
      this.init();
      const notes = [587.33, 783.99, 987.77, 1174.66];
      notes.forEach((f, i) => {
        this._playTone({ freq: f, type: 'sine', duration: 0.22, gain: 0.20, delay: i * 0.05 });
      });
    }

    playUltimateCast() {
      this.init();
      // Thunderclap + ascending harmonic sweep
      this._playNoise({ duration: 0.55, gain: 0.32, filterFreq: 1100, filterType: 'bandpass' });
      this._playTone({ freq: 110, endFreq: 55, type: 'sawtooth', duration: 0.6, gain: 0.30 });
      [293.66, 440, 587.33, 880, 1174.66].forEach((f, i) => {
        this._playTone({ freq: f, type: 'triangle', duration: 0.5, gain: 0.20, delay: i * 0.055 });
      });
    }

    playBossWarning() {
      this.init();
      for (let i = 0; i < 2; i++) {
        this._playTone({
          freq: 196,
          endFreq: 277.18,
          type: 'sawtooth',
          duration: 0.32,
          gain: 0.22,
          delay: i * 0.38
        });
      }
    }

    playBossDefeat() {
      this.init();
      this._playNoise({ duration: 0.65, gain: 0.35, filterFreq: 800, filterType: 'lowpass' });
      const fanfare = [293.66, 369.99, 440, 587.33, 739.99, 880];
      fanfare.forEach((f, i) => {
        this._playTone({ freq: f, type: 'triangle', duration: 0.45, gain: 0.24, delay: i * 0.08 });
      });
    }

    playGameOver() {
      this.init();
      const sadNotes = [440, 415.30, 392.00, 349.23, 293.66];
      sadNotes.forEach((f, i) => {
        this._playTone({
          freq: f,
          type: 'triangle',
          duration: 0.36,
          gain: 0.22,
          delay: i * 0.18
        });
      });
    }

    playHighScoreFanfare() {
      this.init();
      // Classic arcade new record fanfare arpeggio
      const fanfare = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50, 1318.51];
      const delays =  [0.00,   0.09,   0.18,   0.27,    0.42,   0.52,    0.65];
      const durs =    [0.12,   0.12,   0.12,   0.18,    0.12,   0.18,    0.55];
      fanfare.forEach((f, i) => {
        this._playTone({
          freq: f,
          type: 'triangle',
          duration: durs[i],
          gain: 0.25,
          delay: delays[i]
        });
      });
    }

    playOvertimeStart() {
      this.init();
      // Urgent rising arcade alert for Rush Overtime
      [440, 554.37, 659.25, 880].forEach((f, i) => {
        this._playTone({
          freq: f,
          endFreq: f * 1.06,
          type: 'sawtooth',
          duration: 0.16,
          gain: 0.20,
          delay: i * 0.08
        });
      });
    }

    // ------------------------------------------------------------------------
    // ADAPTIVE MULTI-LAYER BACKGROUND MUSIC SEQUENCER
    // ------------------------------------------------------------------------
    startMusic() {
      this.init();
      if (!this.musicEnabled || this.isPlayingMusic) return;
      this.isPlayingMusic = true;
      this.musicStep = 0;
      this._scheduleNextStep();
    }

    stopMusic() {
      this.isPlayingMusic = false;
      if (this.musicTimer) {
        clearTimeout(this.musicTimer);
        this.musicTimer = null;
      }
    }

    _scheduleNextStep() {
      if (!this.isPlayingMusic || !this.musicEnabled) return;

      // Tempo scales with difficulty phase: 114 BPM -> 124 BPM -> 134 BPM -> 144 BPM
      const bpms = [114, 124, 134, 144];
      const bpm = bpms[this.musicPhase] || 114;
      const stepDurationSec = (60 / bpm) / 2; // Eighth-note steps

      if (this.ctx && this.ctx.state === 'running') {
        this._playMusicStep(this.musicStep, stepDurationSec);
      }

      this.musicStep = (this.musicStep + 1) % 16;
      this.musicTimer = setTimeout(() => this._scheduleNextStep(), stepDurationSec * 1000);
    }

    _playMusicStep(step, stepSec) {
      const now = this.ctx.currentTime;
      const vol = this.masterVolume * 0.28;
      if (vol <= 0.001) return;

      // Bass progression in D Dorian (D2, F2, G2, A2)
      const bassProgression = [146.83, 146.83, 174.61, 196.00];
      const barSection = Math.floor(step / 4);
      const bassNote = bassProgression[barSection];

      // 1. Bass pulse on even steps (all phases)
      if (step % 2 === 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = this.musicPhase >= 2 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(bassNote, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(vol * (this.musicPhase >= 2 ? 0.28 : 0.35), now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + stepSec * 0.85);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + stepSec * 0.9);
      }

      // 2. Magical harp arpeggio (all phases, busier in higher phases)
      const arpPattern = [
        293.66, 349.23, 440.00, 587.33,
        349.23, 440.00, 523.25, 659.25,
        392.00, 493.88, 587.33, 783.99,
        440.00, 523.25, 659.25, 880.00
      ];
      if (this.musicPhase >= 1 || step % 2 === 0) {
        const arpFreq = arpPattern[step];
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(arpFreq, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(vol * 0.22, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + stepSec * 0.75);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + stepSec * 0.8);
      }

      // 3. Percussion hi-hat / shaker in Phase II+ (30s+)
      if (this.musicPhase >= 1 && step % 2 === 1) {
        this._playNoise({
          duration: 0.035,
          gain: 0.035,
          filterFreq: 5200,
          filterType: 'highpass'
        });
      }

      // 4. High lead synth counter-accents in Phase III+ (90s+)
      if (this.musicPhase >= 2 && (step === 0 || step === 6 || step === 12)) {
        const leadNotes = { 0: 587.33, 6: 659.25, 12: 783.99 };
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(leadNotes[step], now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(vol * 0.24, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + stepSec * 1.6);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + stepSec * 1.65);
      }
    }
  }

  window.Aetherward.AudioManager = AudioManager;
})();
