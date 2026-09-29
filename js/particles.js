/**
 * ============================================================================
 * AETHERWARD: SKYBORNE SIGILS - Particles, FX & Parallax Sky (js/particles.js)
 * ============================================================================
 * Manages particle bursts, shockwave rings, staff-to-balloon spell beams,
 * floating score popups, screen shake, and dynamic weather/sky layers.
 */

window.Aetherward = window.Aetherward || {};

(function () {
  class EffectsManager {
    constructor() {
      this.particles = [];
      this.shockwaves = [];
      this.floatingTexts = [];
      this.beams = [];
      this.clouds = [];
      this.weatherParticles = [];
      this.stars = [];

      this.shakeTime = 0;
      this.shakeMagnitude = 0;
      this.flashAlpha = 0;
      this.flashColor = '#ffffff';
      this.reducedEffects = false;

      this._initSkyElements();
    }

    _initSkyElements() {
      // Twinkling background stars
      this.stars = [];
      for (let i = 0; i < 55; i++) {
        this.stars.push({
          nx: Math.random(),
          ny: Math.random() * 0.72,
          size: 1 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
          speed: 1.5 + Math.random() * 2.5
        });
      }

      // Layered parallax clouds
      this.clouds = [];
      for (let i = 0; i < 9; i++) {
        this.clouds.push({
          nx: Math.random() * 1.2 - 0.1,
          ny: 0.08 + Math.random() * 0.56,
          scale: 0.6 + Math.random() * 0.9,
          speed: (0.012 + Math.random() * 0.025) * (i % 2 === 0 ? 1 : 0.65),
          layer: i % 3
        });
      }

      // Weather particles (mana motes / rain / eclipse embers)
      this.weatherParticles = [];
      for (let i = 0; i < 45; i++) {
        this.weatherParticles.push({
          nx: Math.random(),
          ny: Math.random(),
          vx: (Math.random() - 0.5) * 0.04,
          vy: 0.08 + Math.random() * 0.14,
          size: 2 + Math.random() * 3
        });
      }
    }

    setReducedEffects(reduced) {
      this.reducedEffects = Boolean(reduced);
    }

    triggerShake(magnitude = 8, duration = 0.25) {
      if (this.reducedEffects) return;
      this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
      this.shakeTime = Math.max(this.shakeTime, duration);
    }

    triggerFlash(color = '#ffffff', alpha = 0.35) {
      if (this.reducedEffects) return;
      this.flashColor = color;
      this.flashAlpha = Math.max(this.flashAlpha, alpha);
    }

    spawnBalloonPop(x, y, color) {
      const count = this.reducedEffects ? 8 : 22;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 70 + Math.random() * 190;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          gravity: 240,
          size: 3.5 + Math.random() * 5.5,
          color: i % 3 === 0 ? '#ffffff' : color,
          alpha: 1,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.35,
          shape: i % 2 === 0 ? 'star' : 'circle'
        });
      }

      this.shockwaves.push({
        x,
        y,
        radius: 10,
        maxRadius: 58,
        color,
        life: 0,
        maxLife: 0.28
      });
    }

    spawnEnemyDefeatBurst(x, y, color, isBoss = false) {
      const count = this.reducedEffects ? 12 : (isBoss ? 60 : 30);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * (isBoss ? 340 : 220);
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 50,
          gravity: 280,
          size: 4 + Math.random() * (isBoss ? 8 : 5),
          color: i % 4 === 0 ? '#fde047' : (i % 2 === 0 ? color : '#ffffff'),
          alpha: 1,
          life: 0,
          maxLife: 0.45 + Math.random() * 0.45,
          shape: i % 3 === 0 ? 'star' : 'circle'
        });
      }

      this.shockwaves.push({
        x,
        y,
        radius: 14,
        maxRadius: isBoss ? 160 : 85,
        color: '#fde047',
        life: 0,
        maxLife: isBoss ? 0.55 : 0.35
      });
    }

    spawnSpellBeam(fromX, fromY, toX, toY, color = '#38bdf8') {
      // Generate jagged lightning points between wizard staff and balloon
      const segments = 7;
      const pts = [[fromX, fromY]];
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const bx = fromX + (toX - fromX) * t + (Math.random() - 0.5) * 34;
        const by = fromY + (toY - fromY) * t + (Math.random() - 0.5) * 34;
        pts.push([bx, by]);
      }
      pts.push([toX, toY]);

      this.beams.push({
        points: pts,
        color,
        life: 0,
        maxLife: 0.24
      });
    }

    spawnFloatingText(x, y, text, color = '#ffffff', scale = 1.0) {
      this.floatingTexts.push({
        x,
        y,
        text,
        color,
        scale,
        vy: -58,
        life: 0,
        maxLife: 1.05
      });
    }

    update(dt, windSpeedMultiplier = 1.0) {
      // Screen shake decay
      if (this.shakeTime > 0) {
        this.shakeTime = Math.max(0, this.shakeTime - dt);
        if (this.shakeTime === 0) this.shakeMagnitude = 0;
      }

      // Flash decay
      if (this.flashAlpha > 0) {
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 1.8);
      }

      // Clouds
      for (const c of this.clouds) {
        c.nx += c.speed * windSpeedMultiplier * dt;
        if (c.nx > 1.25) c.nx = -0.25;
      }

      // Weather particles
      for (const wp of this.weatherParticles) {
        wp.nx += wp.vx * windSpeedMultiplier * dt;
        wp.ny += wp.vy * windSpeedMultiplier * dt;
        if (wp.ny > 0.88) {
          wp.ny = -0.04;
          wp.nx = Math.random();
        }
        if (wp.nx < 0) wp.nx = 1;
        if (wp.nx > 1) wp.nx = 0;
      }

      // Burst particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.alpha = 1 - p.life / p.maxLife;
      }

      // Shockwaves
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life += dt;
        if (sw.life >= sw.maxLife) {
          this.shockwaves.splice(i, 1);
          continue;
        }
        const t = sw.life / sw.maxLife;
        sw.radius = 10 + (sw.maxRadius - 10) * (1 - Math.pow(1 - t, 2));
      }

      // Beams
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.life += dt;
        if (b.life >= b.maxLife) {
          this.beams.splice(i, 1);
        }
      }

      // Floating texts
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.life += dt;
        if (ft.life >= ft.maxLife) {
          this.floatingTexts.splice(i, 1);
          continue;
        }
        ft.y += ft.vy * dt;
        ft.vy *= 0.96;
      }
    }

    getShakeOffset() {
      if (this.shakeTime <= 0 || this.reducedEffects) return { x: 0, y: 0 };
      return {
        x: (Math.random() - 0.5) * 2 * this.shakeMagnitude,
        y: (Math.random() - 0.5) * 2 * this.shakeMagnitude
      };
    }

    /**
     * Renders the layered parallax sky, distant mountains, clouds, weather,
     * and stone battlement courtyard.
     */
    renderBackground(ctx, width, height, skyColors, weatherIntensity, groundY, timeSec) {
      // 1. Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
      skyGrad.addColorStop(0, skyColors.top);
      skyGrad.addColorStop(0.55, skyColors.mid);
      skyGrad.addColorStop(1, skyColors.bottom);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Twinkling Stars
      ctx.save();
      for (const s of this.stars) {
        const twinkle = 0.35 + 0.65 * Math.sin(timeSec * s.speed + s.phase);
        ctx.fillStyle = `rgba(255, 250, 235, ${twinkle * 0.75})`;
        ctx.beginPath();
        ctx.arc(s.nx * width, s.ny * height, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 3. Astral Moon / Eclipse Sun in upper sky
      const moonX = width * 0.82;
      const moonY = height * 0.18;
      const moonR = Math.min(width, height) * 0.065;
      ctx.save();
      const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2.4);
      moonGlow.addColorStop(0, weatherIntensity > 0.8 ? 'rgba(255, 80, 110, 0.55)' : 'rgba(255, 245, 200, 0.45)');
      moonGlow.addColorStop(1, 'rgba(255, 245, 200, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = weatherIntensity > 0.8 ? '#2a0512' : '#fef9c3';
      ctx.strokeStyle = weatherIntensity > 0.8 ? '#fb7185' : '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      if (weatherIntensity > 0.8) ctx.stroke(); // Eclipse corona ring
      ctx.restore();

      // 4. Soft Parallax Clouds
      ctx.save();
      ctx.fillStyle = skyColors.cloudTint;
      for (const c of this.clouds) {
        const cx = c.nx * width;
        const cy = c.ny * height;
        const r = 34 * c.scale;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.75, cy + 4, r * 0.78, 0, Math.PI * 2);
        ctx.arc(cx - r * 0.75, cy + 6, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 5. Distant Mountain & Spire Silhouettes
      ctx.save();
      ctx.fillStyle = 'rgba(12, 14, 30, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      const peaks = [0, 0.14, 0.28, 0.44, 0.62, 0.78, 0.91, 1.0];
      const heights = [0.08, 0.18, 0.11, 0.21, 0.12, 0.19, 0.10, 0.14];
      for (let i = 0; i < peaks.length; i++) {
        ctx.lineTo(peaks[i] * width, groundY - heights[i] * height);
      }
      ctx.lineTo(width, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 6. Weather Particles (Mana Motes -> Storm Rain -> Eclipse Embers)
      if (!this.reducedEffects) {
        ctx.save();
        for (const wp of this.weatherParticles) {
          const px = wp.nx * width;
          const py = wp.ny * height;
          if (weatherIntensity >= 0.65 && weatherIntensity < 0.95) {
            // Arcane rain streaks
            ctx.strokeStyle = 'rgba(165, 210, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - 5, py + 16);
            ctx.stroke();
          } else {
            // Floating mana motes or crimson embers
            ctx.fillStyle = weatherIntensity >= 0.95
              ? 'rgba(251, 113, 133, 0.55)'
              : 'rgba(186, 230, 253, 0.45)';
            ctx.beginPath();
            ctx.arc(px, py, wp.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 7. Castle Battlement / Stone Parapet at the bottom
      const wallGrad = ctx.createLinearGradient(0, groundY, 0, height);
      wallGrad.addColorStop(0, '#1e293b');
      wallGrad.addColorStop(0.3, '#0f172a');
      wallGrad.addColorStop(1, '#060913');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, groundY, width, height - groundY);

      // Stone merlons (crenellations) along the parapet edge
      const merlonW = 44;
      const merlonH = 14;
      const gap = 28;
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      for (let x = 12; x < width; x += merlonW + gap) {
        ctx.fillRect(x, groundY - merlonH, merlonW, merlonH);
        ctx.strokeRect(x, groundY - merlonH, merlonW, merlonH);
      }

      // Glowing arcane trim along parapet floor
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, groundY + 2);
      ctx.lineTo(width, groundY + 2);
      ctx.stroke();
    }

    /**
     * Renders foreground spell beams, shockwaves, particles, and floating text.
     */
    renderForeground(ctx, width, height) {
      // 1. Spell Lightning Beams
      for (const b of this.beams) {
        const alpha = 1 - b.life / b.maxLife;
        ctx.save();
        ctx.strokeStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 5 * alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < b.points.length; i++) {
          const [px, py] = b.points[i];
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * alpha;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Shockwaves
      for (const sw of this.shockwaves) {
        const alpha = 1 - sw.life / sw.maxLife;
        ctx.save();
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 3.5 * alpha;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Particles
      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        if (p.shape === 'star') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 6);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Floating Combat Text
      for (const ft of this.floatingTexts) {
        const t = ft.life / ft.maxLife;
        const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = `800 ${Math.round(19 * ft.scale)}px 'Fredoka', 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(7, 10, 25, 0.9)';
        ctx.lineWidth = 4;
        ctx.strokeText(ft.text, ft.x, ft.y);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      // 5. Screen Flash Overlay
      if (this.flashAlpha > 0 && !this.reducedEffects) {
        ctx.save();
        ctx.fillStyle = this.flashColor;
        ctx.globalAlpha = this.flashAlpha;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }

  window.Aetherward.EffectsManager = EffectsManager;
})();
