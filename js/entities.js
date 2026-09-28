/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Game Entities (js/entities.js)
 * ============================================================================
 * Defines the Guardian Wizard (Pip), Balloons (standard, ordered-chain, decoy),
 * Enemies (7 distinct fantasy archetypes including Mini-Boss), and Power-Up Orbs.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  const CFG = window.Aetherward.CONFIG;
  const Symbols = window.Aetherward.Symbols;

  // ==========================================================================
  // GUARDIAN WIZARD (Pip the Runekeeper)
  // ==========================================================================
  class Wizard {
    constructor() {
      this.state = 'idle'; // 'idle' | 'cast' | 'fizzle' | 'ultimate'
      this.stateTimer = 0;
      this.animTime = 0;
      this.staffColor = '#38bdf8';
      this.lookAngle = -Math.PI / 2;
    }

    triggerCast(color = '#38bdf8') {
      this.state = 'cast';
      this.stateTimer = 0.38;
      this.staffColor = color;
    }

    triggerFizzle() {
      this.state = 'fizzle';
      this.stateTimer = 0.28;
    }

    triggerUltimate() {
      this.state = 'ultimate';
      this.stateTimer = 0.75;
      this.staffColor = '#fde047';
    }

    update(dt, targetX, targetY, wizardX, wizardY) {
      this.animTime += dt;
      if (this.stateTimer > 0) {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'idle';
        }
      }
      if (targetX !== null && targetY !== null) {
        this.lookAngle = Math.atan2(targetY - wizardY, targetX - wizardX);
      }
    }

    getStaffTipPosition(wizardX, wizardY) {
      const castLift = (this.state === 'cast' || this.state === 'ultimate') ? -14 : Math.sin(this.animTime * 3) * 3;
      return {
        x: wizardX + 34,
        y: wizardY - 54 + castLift
      };
    }

    render(ctx, x, y, hasShield, ultimateReady) {
      ctx.save();
      const bob = Math.sin(this.animTime * 3.5) * 2.5;
      const isCasting = this.state === 'cast' || this.state === 'ultimate';
      const isFizzle = this.state === 'fizzle';

      // 1. Optional Aegis Shield Dome around courtyard/wizard
      if (hasShield) {
        ctx.save();
        const pulse = 0.7 + 0.3 * Math.sin(this.animTime * 5);
        const grad = ctx.createRadialGradient(x, y - 24, 15, x, y - 24, 78);
        grad.addColorStop(0, 'rgba(251, 191, 36, 0.04)');
        grad.addColorStop(0.8, `rgba(251, 191, 36, ${0.22 * pulse})`);
        grad.addColorStop(1, 'rgba(253, 224, 71, 0.65)');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y - 10, 74, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // 2. Ultimate Ready Aura Ring at feet
      if (ultimateReady) {
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 42 + Math.sin(this.animTime * 6) * 4, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.translate(x, y + bob);
      if (isFizzle) {
        ctx.translate(Math.sin(this.animTime * 45) * 4, 0);
      }

      // 3. Flowing Arcane Cloak / Robe
      ctx.fillStyle = '#312e81';
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, 4);
      ctx.quadraticCurveTo(-20, -36, 0, -42);
      ctx.quadraticCurveTo(20, -36, 24, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gold trim on robe
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -38);
      ctx.lineTo(-10, 3);
      ctx.moveTo(6, -38);
      ctx.lineTo(10, 3);
      ctx.stroke();

      // 4. Head / Scarf
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(0, -44, 14, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Expressive Eyes (Vivi / Fantasy Mage style)
      const eyeOffsetX = Math.cos(this.lookAngle) * 2.5;
      const eyeOffsetY = Math.sin(this.lookAngle) * 1.5;
      ctx.fillStyle = isFizzle ? '#f87171' : '#fde047';
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(-5 + eyeOffsetX, -45 + eyeOffsetY, 3.2, isCasting ? 4.2 : 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(5 + eyeOffsetX, -45 + eyeOffsetY, 3.2, isCasting ? 4.2 : 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 5. Iconic Pointed Wizard Hat
      ctx.fillStyle = '#3730a3';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Hat brim
      ctx.ellipse(0, -54, 24, 6, -0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hat cone with whimsical bent tip
      ctx.beginPath();
      ctx.moveTo(-16, -55);
      ctx.quadraticCurveTo(-4, -85, -18, -92 + (isCasting ? -5 : 0));
      ctx.quadraticCurveTo(8, -82, 16, -55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 6. Runic Staff & Crystal Orb
      const staffLift = isCasting ? -14 : 0;
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(26, 2);
      ctx.lineTo(34, -52 + staffLift);
      ctx.stroke();

      // Staff Orb
      const orbColor = isFizzle ? '#ef4444' : (ultimateReady ? '#fde047' : this.staffColor);
      ctx.fillStyle = orbColor;
      ctx.shadowColor = orbColor;
      ctx.shadowBlur = isCasting ? 22 : 12;
      ctx.beginPath();
      ctx.arc(34, -56 + staffLift, isCasting ? 9 : 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(32, -58 + staffLift, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ==========================================================================
  // BALLOON ENTITY
  // ==========================================================================
  class Balloon {
    constructor(symbolId, offsetX, offsetY, options = {}) {
      this.symbolId = symbolId;
      this.offsetX = offsetX;
      this.offsetY = offsetY;
      this.radius = options.radius || 27;
      this.isDecoy = Boolean(options.isDecoy);
      this.orderIndex = options.orderIndex ?? null; // 0, 1, 2... if ordered
      this.swayPhase = Math.random() * Math.PI * 2;

      const sym = Symbols.DEFINITIONS[symbolId];
      this.baseColor = sym ? sym.color : '#38bdf8';
    }

    render(ctx, enemyX, enemyY, timeSec, isUnlocked = true) {
      const swayX = Math.sin(timeSec * 2.6 + this.swayPhase) * 4;
      const swayY = Math.cos(timeSec * 3.1 + this.swayPhase) * 2.5;
      const bx = enemyX + this.offsetX + swayX;
      const by = enemyY + this.offsetY + swayY;

      ctx.save();

      // 1. Tether Rope connecting balloon to enemy
      ctx.strokeStyle = this.isDecoy ? 'rgba(203, 213, 225, 0.38)' : 'rgba(226, 232, 240, 0.75)';
      ctx.lineWidth = 1.8;
      if (this.isDecoy) ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(enemyX, enemyY - 12);
      ctx.quadraticCurveTo(
        (enemyX + bx) / 2,
        (enemyY + by) / 2 + 8,
        bx,
        by + this.radius
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Balloon Body
      if (this.isDecoy) {
        // Flickering ghostly illusion appearance
        ctx.globalAlpha = 0.62 + 0.18 * Math.sin(timeSec * 14);
      }

      const r = this.radius;
      const grad = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r * 1.1);
      if (!isUnlocked) {
        // Locked sequential balloon is darker metallic slate until unlocked
        grad.addColorStop(0, '#475569');
        grad.addColorStop(1, '#1e293b');
      } else if (this.isDecoy) {
        grad.addColorStop(0, '#581c87');
        grad.addColorStop(1, '#1e1b4b');
      } else {
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(0.7, '#0f172a');
        grad.addColorStop(1, '#090d16');
      }

      ctx.fillStyle = grad;
      ctx.strokeStyle = !isUnlocked ? '#64748b' : this.baseColor;
      ctx.lineWidth = isUnlocked ? 3.2 : 2.0;
      if (this.isDecoy) ctx.setLineDash([5, 3]);

      ctx.beginPath();
      ctx.ellipse(bx, by, r * 0.94, r * 1.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      // Balloon knot at bottom
      ctx.fillStyle = !isUnlocked ? '#64748b' : this.baseColor;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + r * 1.05);
      ctx.lineTo(bx + 4, by + r * 1.05);
      ctx.lineTo(bx, by + r * 1.18);
      ctx.closePath();
      ctx.fill();

      // Glossy highlight arc on top-left of balloon
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx - r * 0.28, by - r * 0.28, r * 0.45, Math.PI * 1.1, Math.PI * 1.55);
      ctx.stroke();

      // 3. Crisp Rune Symbol Icon inside the balloon
      Symbols.drawSymbolIcon(ctx, this.symbolId, bx, by, r * 1.25, {
        color: isUnlocked ? '#ffffff' : '#94a3b8',
        glowColor: isUnlocked ? this.baseColor : 'transparent',
        lineWidth: Math.max(3, r * 0.14),
        isDecoy: this.isDecoy
      });

      // 4. Chain Lock Badge if this is a sequential balloon that isn't first in line
      if (this.orderIndex !== null) {
        if (!isUnlocked) {
          // Small lock badge at top-right of balloon
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(bx + r * 0.68, by - r * 0.68, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '700 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${this.orderIndex + 1}`, bx + r * 0.68, by - r * 0.68);
        } else if (this.orderIndex !== null) {
          // Active target crown ring on the currently unlocked balloon
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(bx + r * 0.68, by - r * 0.68, 9, 0, Math.PI * 2);
          ctx.fillStyle = '#ca8a04';
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('1', bx + r * 0.68, by - r * 0.68);
        }
      }

      ctx.restore();

      return { x: bx, y: by };
    }
  }

  // ==========================================================================
  // ENEMY ENTITY (Supports 7 Archetypes)
  // ==========================================================================
  class Enemy {
    constructor(config) {
      this.id = Math.random().toString(36).slice(2);
      this.typeId = config.typeId || 'normal';
      this.archetype = CFG.ENEMY_TYPES[this.typeId] || CFG.ENEMY_TYPES.normal;

      this.x = config.x;
      this.y = config.y;
      this.baseX = config.x;
      this.speed = config.speed;
      this.radius = this.archetype.radius;
      this.scoreValue = this.archetype.scoreValue;
      this.orderedBalloons = Boolean(config.orderedBalloons);

      this.balloons = [];
      this.decoyBalloon = null;
      this.initialBalloonCount = config.symbols.length;

      // Arrange balloons in a fan above the enemy
      const count = config.symbols.length;
      const balloonR = this.typeId === 'miniboss' ? 31 : 27;
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : (i - (count - 1) / 2) * (balloonR * 1.95);
        const archLift = -Math.abs(i - (count - 1) / 2) * 8;
        const offsetY = -(this.radius + balloonR + 24) + archLift;
        this.balloons.push(new Balloon(config.symbols[i], spread, offsetY, {
          radius: balloonR,
          orderIndex: this.orderedBalloons && count > 1 ? i : null
        }));
      }

      // Optional decoy balloon for Mirror Trickster
      if (config.decoySymbol) {
        const side = Math.random() < 0.5 ? -1 : 1;
        // Shift real balloon slightly to opposite side
        if (this.balloons.length === 1) {
          this.balloons[0].offsetX = -side * 28;
        }
        this.decoyBalloon = new Balloon(config.decoySymbol, side * 34, -(this.radius + 48), {
          radius: 25,
          isDecoy: true
        });
      }

      this.state = 'descending'; // 'descending' | 'falling' | 'dead'
      this.vy = 0;
      this.rotation = 0;
      this.animTime = Math.random() * 10;
      this.swayAmp = this.typeId === 'fast' ? 24 : (this.typeId === 'miniboss' ? 12 : 15);
      this.swaySpeed = this.typeId === 'fast' ? 2.8 : 1.4;
      this.hitReactionTimer = 0;
      this.spawnTime = performance.now();
    }

    /**
     * Returns the set of symbol IDs that can currently pop a balloon on this enemy.
     */
    getTargetableSymbols() {
      if (this.state !== 'descending' || this.balloons.length === 0) return [];
      if (this.orderedBalloons) {
        // Only the first balloon in queue is unlocked
        return [this.balloons[0].symbolId];
      }
      return this.balloons.map(b => b.symbolId);
    }

    /**
     * Checks if `symbolId` matches an unlocked balloon on this enemy.
     * Returns popped balloon info or `{ decoyTriggered: true }`.
     */
    tryPopSymbol(symbolId) {
      if (this.state !== 'descending') return null;

      // 1. Check real unlocked balloons first
      const searchLimit = this.orderedBalloons ? Math.min(1, this.balloons.length) : this.balloons.length;
      for (let i = 0; i < searchLimit; i++) {
        if (this.balloons[i].symbolId === symbolId) {
          const popped = this.balloons.splice(i, 1)[0];
          this.hitReactionTimer = 0.25;

          // Update remaining order indices
          if (this.orderedBalloons) {
            this.balloons.forEach((b, idx) => {
              b.orderIndex = this.balloons.length > 1 ? idx : null;
            });
          }

          const defeated = this.balloons.length === 0;
          if (defeated) {
            this.state = 'falling';
            this.vy = -90; // Small upward hop before plummeting off screen
          }

          return {
            poppedBalloon: popped,
            balloonWorldX: this.x + popped.offsetX,
            balloonWorldY: this.y + popped.offsetY,
            defeated
          };
        }
      }

      // 2. Check if player drew the Trickster's decoy symbol
      if (this.decoyBalloon && this.decoyBalloon.symbolId === symbolId) {
        return {
          decoyTriggered: true,
          balloonWorldX: this.x + this.decoyBalloon.offsetX,
          balloonWorldY: this.y + this.decoyBalloon.offsetY
        };
      }

      return null;
    }

    update(dt, speedModifier, canvasWidth, groundY) {
      this.animTime += dt;
      if (this.hitReactionTimer > 0) {
        this.hitReactionTimer = Math.max(0, this.hitReactionTimer - dt);
      }

      if (this.state === 'descending') {
        // Slow down slightly if enemy lost some of its balloons, or speed up slightly if startled
        this.y += this.speed * speedModifier * dt;
        this.x = this.baseX + Math.sin(this.animTime * this.swaySpeed) * this.swayAmp;
        // Clamp within screen margins
        const margin = 58;
        this.x = Math.max(margin, Math.min(canvasWidth - margin, this.x));

        if (this.y + this.radius >= groundY) {
          return 'landed';
        }
      } else if (this.state === 'falling') {
        this.vy += 680 * dt;
        this.y += this.vy * dt;
        this.rotation += 5.5 * dt;
        if (this.y > groundY + 120) {
          this.state = 'dead';
        }
      }
      return null;
    }

    render(ctx, timeSec, groundY, isFrozen = false) {
      // 1. Render Balloons if still descending
      if (this.state === 'descending') {
        if (this.decoyBalloon) {
          this.decoyBalloon.render(ctx, this.x, this.y, timeSec, true);
        }
        for (let i = this.balloons.length - 1; i >= 0; i--) {
          const isUnlocked = !this.orderedBalloons || i === 0;
          this.balloons[i].render(ctx, this.x, this.y, timeSec, isUnlocked);
        }
      }

      // 2. Proximity Warning Ring when dangerously close to parapet
      const distToGround = groundY - (this.y + this.radius);
      if (this.state === 'descending' && distToGround < 145) {
        ctx.save();
        const dangerPulse = 0.4 + 0.6 * Math.abs(Math.sin(timeSec * 10));
        ctx.strokeStyle = `rgba(239, 68, 68, ${dangerPulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Render Character Body by Archetype
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      if (this.hitReactionTimer > 0) {
        const s = 1 + Math.sin(this.hitReactionTimer * 30) * 0.16;
        ctx.scale(s, 1 / s);
      }

      this._drawCharacterSprite(ctx);

      // 4. Ice Crystal Overlay when Frozen
      if (isFrozen && this.state === 'descending') {
        ctx.fillStyle = 'rgba(103, 232, 249, 0.38)';
        ctx.strokeStyle = '#cffafe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -this.radius - 6);
        ctx.lineTo(this.radius + 6, 0);
        ctx.lineTo(0, this.radius + 6);
        ctx.lineTo(-this.radius - 6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    _drawCharacterSprite(ctx) {
      const r = this.radius;

      switch (this.typeId) {
        case 'fast': {
          // Zephyr Imp: Winged aerodynamic speedster
          // Fluttering wings
          const wingFlap = Math.sin(this.animTime * 22) * 8;
          ctx.fillStyle = '#bae6fd';
          ctx.beginPath();
          ctx.ellipse(-r * 0.9, -4 + wingFlap * 0.4, 12, 6, -0.3, 0, Math.PI * 2);
          ctx.ellipse(r * 0.9, -4 + wingFlap * 0.4, 12, 6, 0.3, 0, Math.PI * 2);
          ctx.fill();

          // Imp body
          ctx.fillStyle = '#0284c7';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Speed goggles
          ctx.fillStyle = '#facc15';
          ctx.fillRect(-13, -7, 11, 8);
          ctx.fillRect(2, -7, 11, 8);
          break;
        }

        case 'tank': {
          // Ironclad Gargoyle: Armored knight-gargoyle
          ctx.fillStyle = '#475569';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Horns
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.moveTo(-r * 0.7, -r * 0.6);
          ctx.lineTo(-r * 1.1, -r * 1.15);
          ctx.lineTo(-r * 0.3, -r * 0.85);
          ctx.moveTo(r * 0.7, -r * 0.6);
          ctx.lineTo(r * 1.1, -r * 1.15);
          ctx.lineTo(r * 0.3, -r * 0.85);
          ctx.fill();

          // Glowing visor slit
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-r * 0.65, -6, r * 1.3, 10);
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(-8, -1, 3.5, 0, Math.PI * 2);
          ctx.arc(8, -1, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'trick': {
          // Mirror Trickster: Arcane Jester
          ctx.fillStyle = '#7e22ce';
          ctx.strokeStyle = '#e879f9';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Two-pronged jester cap
          ctx.fillStyle = '#2dd4bf';
          ctx.beginPath();
          ctx.moveTo(-r * 0.7, -r * 0.5);
          ctx.quadraticCurveTo(-r * 1.2, -r * 1.3, -r * 1.3, -r * 0.7);
          ctx.lineTo(0, -r * 0.8);
          ctx.moveTo(r * 0.7, -r * 0.5);
          ctx.quadraticCurveTo(r * 1.2, -r * 1.3, r * 1.3, -r * 0.7);
          ctx.lineTo(0, -r * 0.8);
          ctx.fill();

          // Mischievous eyes
          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.arc(-7, -2, 3.5, 0, Math.PI * 2);
          ctx.arc(7, -2, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'splitter': {
          // Twin Gremlin Pod: Barrel with two peeking gremlins
          ctx.fillStyle = '#9a3412';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-r, -r * 0.85, r * 2, r * 1.7, 10);
          ctx.fill();
          ctx.stroke();

          // Two sets of glowing eyes peeking out
          ctx.fillStyle = '#fde047';
          [-10, -3, 5, 12].forEach(ex => {
            ctx.beginPath();
            ctx.arc(ex, -3, 2.6, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        case 'miniboss': {
          // Dreadnought Zeppelin: Armored Airship Boss
          ctx.fillStyle = '#991b1b';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.28, r * 0.82, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Gold armor bands
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-r * 0.5, -r * 0.75);
          ctx.lineTo(-r * 0.5, r * 0.75);
          ctx.moveTo(r * 0.5, -r * 0.75);
          ctx.lineTo(r * 0.5, r * 0.75);
          ctx.stroke();

          // Glowing bridge portholes
          ctx.fillStyle = '#fef08a';
          [-18, 0, 18].forEach(px => {
            ctx.beginPath();
            ctx.arc(px, 2, 5.5, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        default: {
          // Normal Sky Goblin & Swarmling
          // Pointy goblin ears
          ctx.fillStyle = this.archetype.color;
          ctx.beginPath();
          ctx.moveTo(-r * 0.8, -6);
          ctx.lineTo(-r * 1.35, -14);
          ctx.lineTo(-r * 0.7, 4);
          ctx.moveTo(r * 0.8, -6);
          ctx.lineTo(r * 1.35, -14);
          ctx.lineTo(r * 0.7, 4);
          ctx.fill();

          // Round body
          ctx.fillStyle = this.archetype.color;
          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Expressive eyes
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-6, -3, 4.5, 0, Math.PI * 2);
          ctx.arc(6, -3, 4.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(-6, -2, 2.2, 0, Math.PI * 2);
          ctx.arc(6, -2, 2.2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
  }

  // ==========================================================================
  // FLOATING POWER-UP ORB
  // ==========================================================================
  class PowerUpOrb {
    constructor(powerupType, symbolId, x, y) {
      this.powerupType = powerupType;
      this.meta = CFG.POWERUPS.TYPES[powerupType];
      this.symbolId = symbolId;
      this.x = x;
      this.y = y;
      this.vy = 32; // Drifts gently downward
      this.radius = 26;
      this.animTime = 0;
      this.collected = false;
    }

    update(dt, groundY) {
      this.animTime += dt;
      this.y += this.vy * dt;
      this.x += Math.sin(this.animTime * 2.5) * 18 * dt;
      return this.y > groundY - 10;
    }

    render(ctx) {
      ctx.save();
      const pulse = 1 + Math.sin(this.animTime * 5) * 0.07;
      ctx.translate(this.x, this.y);
      ctx.scale(pulse, pulse);

      // Outer glowing aura
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = this.meta.color;
      ctx.shadowColor = this.meta.color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Rune symbol inside orb so drawing the rune collects it!
      Symbols.drawSymbolIcon(ctx, this.symbolId, 0, -2, this.radius * 1.15, {
        color: '#ffffff',
        glowColor: this.meta.color,
        lineWidth: 3.2
      });

      // Label pill below orb
      ctx.fillStyle = this.meta.color;
      ctx.font = '800 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.meta.shortLabel, 0, this.radius + 13);

      ctx.restore();
    }
  }

  window.Aetherward.Entities = {
    Wizard,
    Balloon,
    Enemy,
    PowerUpOrb,
  };
})();
