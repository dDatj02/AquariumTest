/**
 * RainEffect: Realistic Visual Raindrop Simulation & Water Surface Impact System
 * 
 * Features:
 * - High-speed angled falling raindrop streaks with atmospheric depth layering (3D parallax)
 * - Motion-blurred glowing water drop streaks with head/tail gradient
 * - Dynamic surface impact shockwave rings (perspective-adjusted ellipses)
 * - Micro splash rebound particles (beads of water leaping up on impact)
 * - Zero-allocation object pooling for consistent 60 FPS performance
 * - Seamless integration with WebGL 2 Water Ripple Engine
 */

export type RainIntensity = 'light' | 'medium' | 'heavy';

export interface RainOptions {
  intensity: RainIntensity;
  windAngle: number; // in radians, default ~0.22 (~12.5 deg)
  streakOpacity: number;
  splashRings: boolean;
  splashParticles: boolean;
}

interface RainDrop {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetY: number;
  speed: number;
  length: number;
  thickness: number;
  opacity: number;
  z: number; // 0.3 (distant, faint) to 1.0 (close, bright)
  active: boolean;
}

interface SplashRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  growthRate: number;
  opacity: number;
  color: string;
  active: boolean;
}

interface SplashParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

export class RainEffect {
  public canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  public width = 1920;
  public height = 1080;
  public active = false;

  public options: RainOptions = {
    intensity: 'medium',
    windAngle: 0.20, // ~11.5 degrees diagonal fall
    streakOpacity: 0.75,
    splashRings: true,
    splashParticles: true,
  };

  // Object pools
  private drops: RainDrop[] = [];
  private rings: SplashRing[] = [];
  private particles: SplashParticle[] = [];

  private maxDrops = 180;
  private maxRings = 90;
  private maxParticles = 140;

  private spawnAccumulator = 0;
  private lastTime = 0;

  // Callback when a raindrop hits the water surface
  public onDropContact?: (normX: number, normY: number, strength: number, radius: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.initPools();
  }

  private initPools(): void {
    this.drops = [];
    for (let i = 0; i < this.maxDrops; i++) {
      this.drops.push({
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
        targetY: 0,
        speed: 1400,
        length: 30,
        thickness: 1.2,
        opacity: 0.7,
        z: 1.0,
        active: false,
      });
    }

    this.rings = [];
    for (let i = 0; i < this.maxRings; i++) {
      this.rings.push({
        x: 0,
        y: 0,
        radius: 0,
        maxRadius: 16,
        growthRate: 35,
        opacity: 0.6,
        color: 'rgba(230, 248, 255, 0.65)',
        active: false,
      });
    }

    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.3,
        size: 1.5,
        active: false,
      });
    }
  }

  public resize(w: number, h: number): void {
    this.width = Math.max(100, w);
    this.height = Math.max(100, h);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  public setIntensity(intensity: RainIntensity): void {
    this.options.intensity = intensity;
  }

  private getSpawnRate(): number {
    switch (this.options.intensity) {
      case 'light':
        return 22; // ~22 drops per second
      case 'heavy':
        return 130; // ~130 drops per second
      case 'medium':
      default:
        return 55; // ~55 drops per second
    }
  }

  private spawnDrop(): void {
    const drop = this.drops.find((d) => !d.active);
    if (!drop) return;

    // Atmospheric depth z: 0.35 (background) to 1.0 (foreground)
    const z = 0.35 + Math.random() * 0.65;

    // Destination on pond surface (anywhere on the water canvas)
    const targetX = Math.random() * (this.width + 200) - 100;
    const targetY = 0.08 * this.height + Math.random() * 0.88 * this.height;

    // Wind direction vectors
    const sinW = Math.sin(this.options.windAngle);
    const cosW = Math.cos(this.options.windAngle);

    // Raindrop fall distance from cloud level above screen
    const fallDist = 180 + Math.random() * 260 + targetY * 0.4;
    const startX = targetX - sinW * fallDist;
    const startY = targetY - cosW * fallDist;

    drop.x = startX;
    drop.y = startY;
    drop.startX = startX;
    drop.startY = startY;
    drop.targetY = targetY;

    // Terminal velocity & visual streak scaled with perspective depth
    drop.speed = (1200 + Math.random() * 600) * (0.65 + z * 0.35);
    drop.length = (22 + Math.random() * 24) * (0.6 + z * 0.4);
    drop.thickness = (0.9 + Math.random() * 0.9) * (0.55 + z * 0.45);
    drop.opacity = (0.45 + Math.random() * 0.4) * (0.6 + z * 0.4) * this.options.streakOpacity;
    drop.z = z;
    drop.active = true;
  }

  private spawnSplash(x: number, y: number, z: number): void {
    if (this.options.splashRings) {
      const ring = this.rings.find((r) => !r.active);
      if (ring) {
        ring.x = x;
        ring.y = y;
        ring.radius = 2;
        ring.maxRadius = (10 + Math.random() * 12) * (0.6 + z * 0.4);
        ring.growthRate = (35 + Math.random() * 20) * (0.7 + z * 0.3);
        ring.opacity = (0.5 + Math.random() * 0.3) * (0.7 + z * 0.3);
        ring.color = `rgba(225, 245, 255, ${ring.opacity})`;
        ring.active = true;
      }
    }

    if (this.options.splashParticles && z > 0.45) {
      // 2 to 4 micro splash droplets rebounding upward
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const p = this.particles.find((item) => !item.active);
        if (!p) break;
        p.x = x + (Math.random() - 0.5) * 4;
        p.y = y;
        p.vx = (Math.random() - 0.5) * 70;
        p.vy = -55 - Math.random() * 95;
        p.maxLife = 0.22 + Math.random() * 0.16;
        p.life = p.maxLife;
        p.size = (0.9 + Math.random() * 1.1) * (0.6 + z * 0.4);
        p.active = true;
      }
    }
  }

  public updateAndRender(time: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.08);
    this.lastTime = time;

    // 1. Spawning new drops if rain is active
    if (this.active) {
      const spawnRate = this.getSpawnRate();
      this.spawnAccumulator += spawnRate * dt;
      while (this.spawnAccumulator >= 1.0) {
        this.spawnDrop();
        this.spawnAccumulator -= 1.0;
      }
    } else {
      this.spawnAccumulator = 0;
    }

    const sinW = Math.sin(this.options.windAngle);
    const cosW = Math.cos(this.options.windAngle);

    // 2. Update & Render Falling Rain Streaks
    for (const drop of this.drops) {
      if (!drop.active) continue;

      const prevX = drop.x;
      const prevY = drop.y;

      drop.x += sinW * drop.speed * dt;
      drop.y += cosW * drop.speed * dt;

      // Check for impact on water surface
      if (drop.y >= drop.targetY) {
        drop.active = false;

        // Trigger surface splash visuals
        this.spawnSplash(drop.x, drop.targetY, drop.z);

        // Notify WebGL water ripple engine
        if (this.onDropContact && drop.x >= 0 && drop.x <= this.width && drop.targetY >= 0 && drop.targetY <= this.height) {
          const normX = drop.x / this.width;
          const normY = drop.y / this.height;
          // Scale wave ripple strength and radius naturally with raindrop depth & intensity
          const baseStr = this.options.intensity === 'light' ? 0.22 : this.options.intensity === 'heavy' ? 0.45 : 0.32;
          const strength = baseStr * (0.65 + drop.z * 0.45);
          const radius = (0.014 + drop.z * 0.012);
          this.onDropContact(normX, normY, strength, radius);
        }
        continue;
      }

      // Draw high-speed translucent streak with glowing head
      const tailX = drop.x - sinW * drop.length;
      const tailY = drop.y - cosW * drop.length;

      ctx.save();
      ctx.lineWidth = drop.thickness;
      ctx.lineCap = 'round';

      // Subtle gradient from tail to head
      const grad = ctx.createLinearGradient(tailX, tailY, drop.x, drop.y);
      grad.addColorStop(0, `rgba(200, 235, 255, 0.0)`);
      grad.addColorStop(0.65, `rgba(215, 245, 255, ${drop.opacity * 0.5})`);
      grad.addColorStop(1, `rgba(255, 255, 255, ${drop.opacity})`);

      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(drop.x, drop.y);
      ctx.stroke();

      // Tiny bright droplet head at the tip
      ctx.fillStyle = `rgba(255, 255, 255, ${drop.opacity * 0.9})`;
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.thickness * 0.75, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 3. Update & Render Surface Splash Rings (Expanding elliptical ripples)
    if (this.options.splashRings) {
      for (const ring of this.rings) {
        if (!ring.active) continue;

        ring.radius += ring.growthRate * dt;
        if (ring.radius >= ring.maxRadius) {
          ring.active = false;
          continue;
        }

        const progress = ring.radius / ring.maxRadius;
        const currentAlpha = ring.opacity * (1.0 - progress);

        ctx.save();
        ctx.strokeStyle = `rgba(220, 245, 255, ${Math.max(0, currentAlpha)})`;
        ctx.lineWidth = Math.max(0.7, 1.6 * (1.0 - progress * 0.7));
        ctx.beginPath();
        // Perspective-flattened ellipse for water surface look
        ctx.ellipse(ring.x, ring.y, ring.radius, ring.radius * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Subtle secondary inner ring for larger splashes
        if (ring.maxRadius > 14 && progress > 0.25 && progress < 0.85) {
          const innerR = ring.radius * 0.55;
          ctx.strokeStyle = `rgba(235, 250, 255, ${Math.max(0, currentAlpha * 0.5)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(ring.x, ring.y, innerR, innerR * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    // 4. Update & Render Micro Splash Particles (Water beads rebounding)
    if (this.options.splashParticles) {
      const gravity = 520; // px/s^2
      for (const p of this.particles) {
        if (!p.active) continue;

        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }

        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const progress = p.life / p.maxLife;
        const alpha = Math.max(0, progress * 0.85);

        ctx.save();
        ctx.fillStyle = `rgba(240, 250, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * progress, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  public clear(): void {
    for (const d of this.drops) d.active = false;
    for (const r of this.rings) r.active = false;
    for (const p of this.particles) p.active = false;
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }
}
