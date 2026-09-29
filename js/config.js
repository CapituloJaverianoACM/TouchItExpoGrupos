/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Central Game Configuration (js/config.js)
 * ============================================================================
 * All core tuning parameters for difficulty scaling, enemy behavior, scoring,
 * lives, power-ups, and visual themes are centralized here for easy editing.
 */

window.Aetherward = window.Aetherward || {};

window.Aetherward.CONFIG = {
  // --------------------------------------------------------------------------
  // CORE PLAYER & MATCH SETTINGS
  // --------------------------------------------------------------------------
  PLAYER: {
    INITIAL_LIVES: 5,
    MAX_LIVES: 6,
    GROUND_Y_RATIO: 0.84, // Parapet height as fraction of screen height
    ULTIMATE_MAX_CHARGE: 100,
    ULTIMATE_CHARGE_PER_POP: 8,
    ULTIMATE_COMBO_BONUS: 1.5, // Extra charge per combo tier
  },

  // --------------------------------------------------------------------------
  // RUSH MODE & OVERTIME SETTINGS
  // --------------------------------------------------------------------------
  RUSH_MODE: {
    REGULATION_SECONDS: 90,          // 90s core Rush timer before Overtime begins
    PROGRESSION_MULTIPLIER: 1.85,    // Faster difficulty ramp during Rush Mode
    OVERTIME_SPEED_BOOST_PER_MIN: 0.28, // Extra speed ramp during Overtime
  },

  // --------------------------------------------------------------------------
  // SCORING & COMBO SYSTEM
  // --------------------------------------------------------------------------
  SCORING: {
    BASE_BALLOON_POP: 50,
    BASE_ENEMY_DEFEAT: 100,
    QUICK_DRAW_BONUS: 75,        // Defeating enemy in upper 38% of screen
    ACCURACY_BONUS_MAX: 50,      // Bonus for high-confidence gesture match
    MULTI_CAST_BONUS_PER_EXTRA: 150, // Hitting 2+ enemies with one drawing
    COMBO_TIMEOUT_SECONDS: 5.5,  // Time before combo multiplier decays
    MAX_COMBO_MULTIPLIER: 8,     // Cap on score multiplier (1x .. 8x)
    COMBO_STEP: 2,               // Consecutive hits needed per +1x multiplier
  },

  // --------------------------------------------------------------------------
  // DIFFICULTY PROGRESSION PHASES (Time-based + Score-assisted scaling)
  // --------------------------------------------------------------------------
  // The game interpolates smoothly between phases and continues scaling
  // endlessly past 180 seconds.
  DIFFICULTY_PHASES: [
    {
      id: 'calm_skies',
      name: 'Phase I: Dawn Breeze',
      subtitle: 'Apprentice Sigils',
      startTime: 0,
      endTime: 30,
      maxConcurrentEnemies: 2,
      spawnIntervalRange: [2.5, 3.4],
      speedMultiplier: 0.82,
      allowedSymbolTiers: ['easy'],
      multiBalloonChance: 0.08,
      maxBalloonsPerEnemy: 2,
      orderedBalloonChance: 0.0,
      weatherIntensity: 0.1,
      skyColors: {
        top: '#1a2a6c',
        mid: '#3a6073',
        bottom: '#f2994a',
        cloudTint: 'rgba(255, 240, 220, 0.28)',
      }
    },
    {
      id: 'rising_gale',
      name: 'Phase II: Twilight Gale',
      subtitle: 'Adept Challenge',
      startTime: 30,
      endTime: 90,
      maxConcurrentEnemies: 3,
      spawnIntervalRange: [1.8, 2.6],
      speedMultiplier: 1.05,
      allowedSymbolTiers: ['easy', 'medium'],
      multiBalloonChance: 0.35,
      maxBalloonsPerEnemy: 3,
      orderedBalloonChance: 0.18,
      weatherIntensity: 0.35,
      skyColors: {
        top: '#141e30',
        mid: '#4b1d52',
        bottom: '#c94b4b',
        cloudTint: 'rgba(235, 180, 220, 0.22)',
      }
    },
    {
      id: 'arcane_tempest',
      name: 'Phase III: Arcane Tempest',
      subtitle: 'Master Defense',
      startTime: 90,
      endTime: 180,
      maxConcurrentEnemies: 5,
      spawnIntervalRange: [1.25, 2.0],
      speedMultiplier: 1.32,
      allowedSymbolTiers: ['easy', 'medium', 'hard'],
      multiBalloonChance: 0.55,
      maxBalloonsPerEnemy: 4,
      orderedBalloonChance: 0.42,
      weatherIntensity: 0.7,
      skyColors: {
        top: '#090d16',
        mid: '#1f1c47',
        bottom: '#4a266a',
        cloudTint: 'rgba(130, 140, 220, 0.2)',
      }
    },
    {
      id: 'astral_eclipse',
      name: 'Phase IV: Chaos Eclipse',
      subtitle: 'Archmage Survival',
      startTime: 180,
      endTime: 99999,
      maxConcurrentEnemies: 7,
      spawnIntervalRange: [0.85, 1.5],
      speedMultiplier: 1.6,
      allowedSymbolTiers: ['easy', 'medium', 'hard', 'expert'],
      multiBalloonChance: 0.72,
      maxBalloonsPerEnemy: 4,
      orderedBalloonChance: 0.6,
      weatherIntensity: 1.0,
      skyColors: {
        top: '#05020a',
        mid: '#2c0727',
        bottom: '#6f0000',
        cloudTint: 'rgba(255, 90, 120, 0.18)',
      }
    }
  ],

  // Endless scaling beyond 180s
  ENDLESS_SCALING: {
    SPEED_INCREASE_PER_MINUTE: 0.16,      // +16% speed per extra minute after 180s
    SPAWN_RATE_DECAY_PER_MINUTE: 0.09,    // Faster spawns each minute
    MIN_SPAWN_INTERVAL: 0.55,             // Hard floor on spawn interval
    SCORE_DIFFICULTY_FACTOR: 0.000015,    // High scores subtly nudge difficulty up
    MINIBOSS_INTERVAL_SECONDS: 60,        // Spawn a Dreadnought Mini-Boss every 60s
  },

  // --------------------------------------------------------------------------
  // ENEMY ARCHETYPES
  // --------------------------------------------------------------------------
  // Customize enemy speeds, weights, balloon counts, and unlock times here.
  ENEMY_TYPES: {
    normal: {
      id: 'normal',
      name: 'Sky Goblin',
      description: 'Standard mischievous raider suspended by enchanted balloons.',
      baseSpeed: 46, // pixels per second (scaled by screen height & phase)
      radius: 26,
      scoreValue: 100,
      minTime: 0,
      spawnWeight: 50,
      balloonCountRange: [1, 2],
      color: '#5ec962',
      accentColor: '#d97724',
    },
    fast: {
      id: 'fast',
      name: 'Zephyr Imp',
      description: 'Aerodynamic winged imp that plummets rapidly toward the spire.',
      baseSpeed: 76,
      radius: 22,
      scoreValue: 160,
      minTime: 22,
      spawnWeight: 24,
      balloonCountRange: [1, 1],
      color: '#38bdf8',
      accentColor: '#facc15',
    },
    tank: {
      id: 'tank',
      name: 'Ironclad Gargoyle',
      description: 'Heavy armored sentinel borne by multiple reinforced balloons.',
      baseSpeed: 34,
      radius: 34,
      scoreValue: 260,
      minTime: 40,
      spawnWeight: 18,
      balloonCountRange: [2, 4],
      orderedBalloons: true,
      color: '#94a3b8',
      accentColor: '#f97316',
    },
    trick: {
      id: 'trick',
      name: 'Mirror Trickster',
      description: 'Projects a flickering decoy balloon alongside its real sigil!',
      baseSpeed: 48,
      radius: 27,
      scoreValue: 220,
      minTime: 65,
      spawnWeight: 15,
      balloonCountRange: [1, 2],
      hasDecoyBalloon: true,
      color: '#c084fc',
      accentColor: '#2dd4bf',
    },
    splitter: {
      id: 'splitter',
      name: 'Twin Gremlin Pod',
      description: 'Splits into two smaller gremlins with easy runes when popped!',
      baseSpeed: 42,
      radius: 30,
      scoreValue: 240,
      minTime: 85,
      spawnWeight: 14,
      balloonCountRange: [1, 2],
      splitsOnDefeat: true,
      color: '#fb7185',
      accentColor: '#fde047',
    },
    swarmling: {
      id: 'swarmling',
      name: 'Gremlin Paratrooper',
      description: 'Spawned when a Twin Gremlin Pod bursts open in mid-air.',
      baseSpeed: 62,
      radius: 19,
      scoreValue: 90,
      minTime: 99999, // Only spawned by splitter or special waves
      spawnWeight: 0,
      balloonCountRange: [1, 1],
      color: '#fda4af',
      accentColor: '#fef08a',
    },
    miniboss: {
      id: 'miniboss',
      name: 'Dreadnought Zeppelin',
      description: 'Colossal war-dirigible requiring multiple sequential sigils to bring down!',
      baseSpeed: 23,
      radius: 52,
      scoreValue: 1000,
      minTime: 55,
      spawnWeight: 0, // Scheduled by timer
      balloonCountRange: [4, 6],
      orderedBalloons: true,
      damageOnLand: 2,
      color: '#dc2626',
      accentColor: '#fbbf24',
    }
  },

  // --------------------------------------------------------------------------
  // POWER-UPS CONFIGURATION
  // --------------------------------------------------------------------------
  POWERUPS: {
    DROP_CHANCE_NORMAL: 0.10,
    DROP_CHANCE_SPECIAL: 0.24,
    DROP_CHANCE_MINIBOSS: 1.0,
    TYPES: {
      slow_mo: {
        id: 'slow_mo',
        name: 'Chrono Shift',
        shortLabel: 'SLOW-MO',
        description: 'Slows all descending enemies to 35% speed for 7 seconds.',
        duration: 7.0,
        color: '#38bdf8',
        icon: '⏳'
      },
      freeze: {
        id: 'freeze',
        name: 'Frost Nova',
        shortLabel: 'FREEZE',
        description: 'Freezes all enemies solid in mid-air for 4.5 seconds.',
        duration: 4.5,
        color: '#67e8f9',
        icon: '❄️'
      },
      auto_pop: {
        id: 'auto_pop',
        name: 'Seeker Bolts',
        shortLabel: 'SEEKERS',
        description: 'Fires 3 homing arcane missiles at the most dangerous balloons.',
        duration: 0,
        color: '#f472b6',
        icon: '☄️'
      },
      shield: {
        id: 'shield',
        name: 'Aegis Ward',
        shortLabel: 'SHIELD',
        description: 'Summons a barrier that blocks the next enemy impact (or heals +1 crystal).',
        duration: 25.0,
        color: '#fbbf24',
        icon: '🛡️'
      },
      screen_wipe: {
        id: 'screen_wipe',
        name: 'Starfall Cataclysm',
        shortLabel: 'STARFALL',
        description: 'Rains arcane meteors, popping a balloon on every enemy on screen!',
        duration: 0,
        color: '#a855f7',
        icon: '⚡'
      }
    }
  },

  // --------------------------------------------------------------------------
  // GESTURE RECOGNIZER TUNING
  // --------------------------------------------------------------------------
  RECOGNIZER: {
    MIN_POINTS: 2,
    MIN_PATH_LENGTH: 24,          // Minimum pixels to count as a valid stroke
    RESAMPLE_POINTS: 48,          // Number of points for normalized template comparison
    BASE_MATCH_THRESHOLD: 0.62,   // Minimum score (0..1) to accept a match
    TOUCH_FORGIVENESS_BONUS: 0.07,// Extra tolerance when using touch input or lenient setting
    ACTIVE_ON_SCREEN_BOOST: 0.14, // Boosts confidence for symbols currently visible on balloons
    MULTI_STROKE_WINDOW_MS: 420,  // Grace period when drawing 2-stroke runes (e.g., '+' Cross)
    CAMERA_FORGIVENESS_BONUS: 0.05,       // Extra tolerance for air-drawn (webcam) strokes
    CAMERA_MULTI_STROKE_WINDOW_MS: 1800,  // Fist close + reopen between strokes takes far longer than a pen lift
  },

  // --------------------------------------------------------------------------
  // VISUAL THEMES (Selectable in Settings)
  // --------------------------------------------------------------------------
  THEMES: {
    dynamic: {
      name: 'Dynamic Sky (Default)',
      overrideSky: null,
    },
    starlight: {
      name: 'Starlight Observatory',
      overrideSky: {
        top: '#060b26',
        mid: '#141e46',
        bottom: '#2c3e75',
        cloudTint: 'rgba(140, 200, 255, 0.2)',
      }
    },
    emerald: {
      name: 'Enchanted Canopy',
      overrideSky: {
        top: '#072227',
        mid: '#155263',
        bottom: '#42b883',
        cloudTint: 'rgba(180, 255, 210, 0.22)',
      }
    },
    crimson: {
      name: 'Blood Moon Spire',
      overrideSky: {
        top: '#16040b',
        mid: '#4a0e2e',
        bottom: '#9b1b30',
        cloudTint: 'rgba(255, 130, 150, 0.2)',
      }
    }
  }
};
