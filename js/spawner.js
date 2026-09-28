/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Difficulty Scaling & Spawner (js/spawner.js)
 * ============================================================================
 * Manages continuous time- and score-based difficulty progression across the
 * four phases (0-30s, 30-90s, 90-180s, 180s+ Endless), dynamic multi-enemy
 * wave formations, symbol tier selection, and Mini-Boss scheduling.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG;
  const Symbols = window.Aetherward.Symbols;
  const { Enemy, PowerUpOrb } = window.Aetherward.Entities;

  // Deterministic PRNG for Daily Challenge mode (Mulberry32)
  function createSeededRandom(seedInt) {
    let a = seedInt >>> 0;
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getTodaySeedInt() {
    const now = new Date();
    const str = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  class Spawner {
    constructor() {
      this.reset('endless');
    }

    reset(gameMode = 'endless') {
      this.gameMode = gameMode; // 'endless' | 'blitz' | 'daily'
      this.rng = gameMode === 'daily' ? createSeededRandom(getTodaySeedInt()) : Math.random;
      this.spawnTimer = 0.7; // Spawn first enemy quickly so action starts right away
      this.nextMiniBossTime = CFG.ENDLESS_SCALING.MINIBOSS_INTERVAL_SECONDS;
      this.currentPhaseIndex = 0;
      this.tutorialIndex = 0;
    }

    random() {
      return this.rng();
    }

    randomChoice(arr) {
      if (!arr || arr.length === 0) return null;
      return arr[Math.floor(this.random() * arr.length)];
    }

    /**
     * Computes the current Difficulty Snapshot based on survival time and score.
     */
    getDifficultySnapshot(elapsedSeconds, score) {
      // In Rush Mode, progression advances faster and enters Overtime past regulation time
      const isRush = this.gameMode === 'rush' || this.gameMode === 'blitz';
      const modeMultiplier = isRush ? (CFG.RUSH_MODE?.PROGRESSION_MULTIPLIER || 1.85) : 1.0;
      const scoreBonusSeconds = score * CFG.ENDLESS_SCALING.SCORE_DIFFICULTY_FACTOR * 45;
      const effectiveTime = elapsedSeconds * modeMultiplier + scoreBonusSeconds;

      const phases = CFG.DIFFICULTY_PHASES;
      let phaseIndex = 0;
      for (let i = 0; i < phases.length; i++) {
        if (effectiveTime >= phases[i].startTime) {
          phaseIndex = i;
        }
      }

      const phase = phases[phaseIndex];
      const phaseDuration = Math.max(1, phase.endTime - phase.startTime);
      const phaseProgress = Math.min(1, (effectiveTime - phase.startTime) / phaseDuration);

      // Endless scaling past 180s + Rush Overtime boost
      let extraMinutes = 0;
      if (effectiveTime > 180) {
        extraMinutes = (effectiveTime - 180) / 60;
      }

      const regSec = CFG.RUSH_MODE?.REGULATION_SECONDS || 90;
      const overtimeMinutes = isRush && elapsedSeconds > regSec ? (elapsedSeconds - regSec) / 60 : 0;

      const speedMultiplier =
        phase.speedMultiplier * (1 + phaseProgress * 0.14) +
        extraMinutes * CFG.ENDLESS_SCALING.SPEED_INCREASE_PER_MINUTE +
        overtimeMinutes * (CFG.RUSH_MODE?.OVERTIME_SPEED_BOOST_PER_MIN || 0.28);

      const decay = Math.pow(1 - CFG.ENDLESS_SCALING.SPAWN_RATE_DECAY_PER_MINUTE, extraMinutes);
      const minInterval = Math.max(
        CFG.ENDLESS_SCALING.MIN_SPAWN_INTERVAL,
        phase.spawnIntervalRange[0] * (1 - phaseProgress * 0.15) * decay
      );
      const maxInterval = Math.max(
        minInterval + 0.25,
        phase.spawnIntervalRange[1] * (1 - phaseProgress * 0.15) * decay
      );

      return {
        phaseIndex,
        phase,
        effectiveTime,
        speedMultiplier,
        minInterval,
        maxInterval,
        maxConcurrentEnemies: phase.maxConcurrentEnemies + Math.floor(extraMinutes * 0.8),
        allowedSymbolTiers: phase.allowedSymbolTiers,
        multiBalloonChance: Math.min(0.88, phase.multiBalloonChance + extraMinutes * 0.06),
        orderedBalloonChance: Math.min(0.80, phase.orderedBalloonChance + extraMinutes * 0.06),
        weatherIntensity: phase.weatherIntensity,
        skyColors: phase.skyColors
      };
    }

    /**
     * Picks a weighted enemy archetype unlocked at `effectiveTime`.
     */
    pickEnemyType(effectiveTime) {
      // First 18 seconds are strictly normal Sky Goblins for natural onboarding
      if (effectiveTime < 18) return 'normal';

      const candidates = [];
      let totalWeight = 0;

      for (const [id, arch] of Object.entries(CFG.ENEMY_TYPES)) {
        if (arch.spawnWeight > 0 && effectiveTime >= arch.minTime) {
          candidates.push(arch);
          totalWeight += arch.spawnWeight;
        }
      }

      let roll = this.random() * totalWeight;
      for (const arch of candidates) {
        roll -= arch.spawnWeight;
        if (roll <= 0) return arch.id;
      }
      return 'normal';
    }

    /**
     * Selects `count` distinct symbols from the currently unlocked tiers.
     */
    pickSymbols(count, allowedTiers, isEarlyOnboarding = false) {
      if (isEarlyOnboarding) {
        // Gentle onboarding sequence in the first 12 seconds
        const onboardingOrder = ['horizontal', 'vertical', 'v_down', 'circle', 'v_up', 'triangle'];
        const sym = onboardingOrder[this.tutorialIndex % onboardingOrder.length];
        this.tutorialIndex++;
        return [sym];
      }

      const pool = Symbols.getSymbolsByTiers(allowedTiers);
      const chosen = [];
      for (let i = 0; i < count; i++) {
        // Avoid duplicate symbols on the same enemy if possible
        const available = pool.filter(s => !chosen.includes(s.id));
        const pickFrom = available.length > 0 ? available : pool;
        const picked = this.randomChoice(pickFrom);
        chosen.push(picked ? picked.id : 'horizontal');
      }
      return chosen;
    }

    /**
     * Creates a single Enemy instance positioned cleanly along the top sky.
     */
    createEnemy(typeId, snapshot, canvasWidth, canvasHeight, existingEnemies = []) {
      const arch = CFG.ENEMY_TYPES[typeId] || CFG.ENEMY_TYPES.normal;
      const isOnboarding = snapshot.effectiveTime < 14 && typeId === 'normal';

      // Determine balloon count
      let balloonCount = arch.balloonCountRange[0];
      if (!isOnboarding && arch.balloonCountRange[1] > arch.balloonCountRange[0]) {
        if (typeId === 'tank' || typeId === 'miniboss' || this.random() < snapshot.multiBalloonChance) {
          const maxAllowed = Math.min(arch.balloonCountRange[1], snapshot.phase.maxBalloonsPerEnemy);
          balloonCount = arch.balloonCountRange[0] +
            Math.floor(this.random() * Math.max(1, maxAllowed - arch.balloonCountRange[0] + 1));
        }
      }

      const symbols = this.pickSymbols(balloonCount, snapshot.allowedSymbolTiers, isOnboarding);

      // Determine if balloons require sequential order
      const orderedBalloons = balloonCount > 1 && (
        Boolean(arch.orderedBalloons) || this.random() < snapshot.orderedBalloonChance
      );

      // Optional decoy symbol for Mirror Trickster
      let decoySymbol = null;
      if (arch.hasDecoyBalloon) {
        const easyPool = Symbols.getSymbolsByTiers(['easy', 'medium'])
          .map(s => s.id)
          .filter(id => !symbols.includes(id));
        decoySymbol = this.randomChoice(easyPool) || 'circle';
      }

      // Choose horizontal spawn coordinate avoiding heavy overlap with recent spawns
      const margin = Math.max(85, canvasWidth * 0.11);
      let x = margin + this.random() * Math.max(40, canvasWidth - margin * 2);
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidateX = margin + this.random() * Math.max(40, canvasWidth - margin * 2);
        const tooClose = existingEnemies.some(e => e.y < 180 && Math.abs(e.x - candidateX) < 110);
        if (!tooClose) {
          x = candidateX;
          break;
        }
      }

      // Scale base speed slightly to screen height so vertical travel time is consistent
      const heightFactor = Math.max(0.75, Math.min(1.35, canvasHeight / 780));
      const speed = arch.baseSpeed * snapshot.speedMultiplier * heightFactor;

      // In late game (Phase 3+), occasional enemies spawn slightly lower to pressure reaction time
      const lowerSpawnOffset = snapshot.phaseIndex >= 2 && typeId !== 'miniboss'
        ? this.random() * 28
        : 0;

      return new Enemy({
        typeId,
        x,
        y: -30 + lowerSpawnOffset,
        speed,
        symbols,
        orderedBalloons,
        decoySymbol
      });
    }

    /**
     * Spawns two Gremlin Paratroopers when a Twin Gremlin Pod (`splitter`) bursts!
     */
    spawnSplitChildren(parentEnemy, snapshot, canvasWidth, canvasHeight) {
      const children = [];
      const offsets = [-46, 46];
      const easyPool = ['horizontal', 'vertical', 'v_down', 'v_up', 'circle'];

      for (let i = 0; i < 2; i++) {
        const sym = this.randomChoice(easyPool);
        const heightFactor = Math.max(0.75, Math.min(1.35, canvasHeight / 780));
        const child = new Enemy({
          typeId: 'swarmling',
          x: Math.max(60, Math.min(canvasWidth - 60, parentEnemy.x + offsets[i])),
          y: parentEnemy.y,
          speed: CFG.ENEMY_TYPES.swarmling.baseSpeed * snapshot.speedMultiplier * heightFactor,
          symbols: [sym],
          orderedBalloons: false
        });
        children.push(child);
      }
      return children;
    }

    /**
     * Occasionally drops a floating Power-Up Orb when an enemy is defeated.
     */
    maybeCreatePowerUpOrb(defeatedEnemy, canvasWidth) {
      let chance = CFG.POWERUPS.DROP_CHANCE_NORMAL;
      if (defeatedEnemy.typeId === 'miniboss') {
        chance = CFG.POWERUPS.DROP_CHANCE_MINIBOSS;
      } else if (defeatedEnemy.typeId !== 'normal' && defeatedEnemy.typeId !== 'swarmling') {
        chance = CFG.POWERUPS.DROP_CHANCE_SPECIAL;
      }

      if (this.random() > chance) return null;

      const powerupKeys = Object.keys(CFG.POWERUPS.TYPES);
      const chosenPowerup = this.randomChoice(powerupKeys);
      const easyRune = this.randomChoice(['horizontal', 'vertical', 'v_down', 'v_up', 'circle', 'triangle']);

      const x = Math.max(70, Math.min(canvasWidth - 70, defeatedEnemy.x));
      const y = Math.max(80, defeatedEnemy.y);
      return new PowerUpOrb(chosenPowerup, easyRune, x, y);
    }

    /**
     * Main per-frame update that spawns waves & mini-bosses.
     */
    update(dt, elapsedSeconds, score, activeEnemies, canvasWidth, canvasHeight, callbacks = {}) {
      const snapshot = this.getDifficultySnapshot(elapsedSeconds, score);

      // Notify if difficulty phase advanced
      if (snapshot.phaseIndex !== this.currentPhaseIndex) {
        this.currentPhaseIndex = snapshot.phaseIndex;
        if (callbacks.onPhaseChange) {
          callbacks.onPhaseChange(snapshot.phase, snapshot.phaseIndex);
        }
      }

      // Check scheduled Mini-Boss encounter
      if (elapsedSeconds >= this.nextMiniBossTime) {
        this.nextMiniBossTime += CFG.ENDLESS_SCALING.MINIBOSS_INTERVAL_SECONDS;
        const boss = this.createEnemy('miniboss', snapshot, canvasWidth, canvasHeight, activeEnemies);
        boss.x = canvasWidth / 2;
        boss.baseX = canvasWidth / 2;
        activeEnemies.push(boss);
        if (callbacks.onMiniBossSpawn) {
          callbacks.onMiniBossSpawn(boss);
        }
        return snapshot;
      }

      this.spawnTimer -= dt;
      const descendingCount = activeEnemies.filter(e => e.state === 'descending').length;

      // If screen is completely clear, accelerate next spawn so there's never dead air
      if (descendingCount === 0 && this.spawnTimer > 0.45) {
        this.spawnTimer = 0.45;
      }

      if (this.spawnTimer <= 0 && descendingCount < snapshot.maxConcurrentEnemies) {
        // Determine wave size (1 enemy early, occasional 2-3 enemy synchronized wave later)
        let waveSize = 1;
        const availableSlots = snapshot.maxConcurrentEnemies - descendingCount;
        if (snapshot.effectiveTime > 45 && availableSlots >= 2 && this.random() < 0.28) {
          waveSize = 2;
        }
        if (snapshot.effectiveTime > 120 && availableSlots >= 3 && this.random() < 0.18) {
          waveSize = 3;
        }

        for (let i = 0; i < waveSize; i++) {
          const typeId = this.pickEnemyType(snapshot.effectiveTime);
          const enemy = this.createEnemy(typeId, snapshot, canvasWidth, canvasHeight, activeEnemies);
          activeEnemies.push(enemy);
        }

        this.spawnTimer =
          snapshot.minInterval + this.random() * (snapshot.maxInterval - snapshot.minInterval);
      }

      return snapshot;
    }
  }

  window.Aetherward.Spawner = Spawner;
})();
