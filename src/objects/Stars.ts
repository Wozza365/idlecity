import Phaser from 'phaser';
import { STAR_KEY, STAR_CORE_R } from './StarAssets';

interface Star {
  baseX: number;
  y: number;
  radius: number;
  brightness: number;
  sprite: Phaser.GameObjects.Image;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  tailLen: number; // trail length in px
}

const SHOOT_DURATION  = 0.45;  // seconds
const SHOOT_SPEED     = 520;   // px/s
const SHOOT_MIN_WAIT  = 20_000;
const SHOOT_MAX_WAIT  = 60_000;
const SHOOT_SEGMENTS  = 6;

const STAR_TINT = 0xffeedd;

export class Stars {
  private stars: Star[] = [];
  private shootSprites: Phaser.GameObjects.Image[] = [];
  private readonly STAR_COUNT = 50;
  private groundY: number;
  private width: number;
  private _starsWereVisible = false;
  private _lastDrawnAngle = NaN;

  private shooting: ShootingStar | null = null;
  private shootTimer = SHOOT_MIN_WAIT + Math.random() * (SHOOT_MAX_WAIT - SHOOT_MIN_WAIT);

  constructor(scene: Phaser.Scene, groundY: number) {
    this.groundY = groundY;
    this.width   = scene.scale.width;

    const skyHeight = groundY * 0.65;

    for (let i = 0; i < this.STAR_COUNT; i++) {
      const radius = Math.random() * 1.2 + 0.4;
      const sprite = scene.add.image(0, 0, STAR_KEY)
        .setDepth(2)
        .setTint(STAR_TINT)
        .setScale(radius / STAR_CORE_R)
        .setVisible(false);
      this.stars.push({
        baseX:      Math.random() * this.width * 1.5 - this.width * 0.25,
        y:          Math.random() * skyHeight,
        radius,
        brightness: Math.random() * 0.7 + 0.3,
        sprite,
      });
    }

    // Pool of glow sprites for the shooting star's tail segments + bright tip.
    for (let i = 0; i < SHOOT_SEGMENTS + 1; i++) {
      this.shootSprites.push(
        scene.add.image(0, 0, STAR_KEY)
          .setDepth(2.1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false),
      );
    }
  }

  update(delta: number, elevation: number, sunAngle: number, width: number): void {
    this.width = width;
    const starAlpha = Math.max(0, Math.min(1, -elevation * 3));

    if (starAlpha === 0) {
      if (this._starsWereVisible) {
        for (const star of this.stars) star.sprite.setVisible(false);
        this._starsWereVisible = false;
      }
      for (const sp of this.shootSprites) sp.setVisible(false);
      this.shooting = null;
      return;
    }

    const angleDelta = Math.abs(sunAngle - this._lastDrawnAngle);
    if (this._starsWereVisible && starAlpha >= 0.99 && angleDelta < 0.002) {
      // Still tick shooting star even when static stars skip redraw
      this.tickShooting(delta / 1000, elevation, starAlpha);
      return;
    }

    this._starsWereVisible = true;
    this._lastDrawnAngle = sunAngle;

    const scrollOffset = (sunAngle / (Math.PI * 2)) * width * 0.5;

    for (const star of this.stars) {
      const x        = star.baseX + scrollOffset;
      const wrappedX = ((x % (width * 1.5)) + (width * 1.5)) % (width * 1.5) - width * 0.25;
      star.sprite.setPosition(wrappedX, star.y);
      star.sprite.setAlpha(starAlpha * star.brightness);
      star.sprite.setVisible(true);
    }

    this.tickShooting(delta / 1000, elevation, starAlpha);
  }

  private tickShooting(dt: number, elevation: number, starAlpha: number): void {
    if (this.shooting) {
      const s = this.shooting;
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.t >= SHOOT_DURATION) {
        this.shooting = null;
        this.shootTimer = SHOOT_MIN_WAIT + Math.random() * (SHOOT_MAX_WAIT - SHOOT_MIN_WAIT);
        for (const sp of this.shootSprites) sp.setVisible(false);
        return;
      }

      // Alpha envelope: ramp in over first 0.1s, hold, ramp out over last 0.15s
      const fadeIn  = Math.min(1, s.t / 0.10);
      const fadeOut = Math.max(0, 1 - (s.t - (SHOOT_DURATION - 0.15)) / 0.15);
      const alpha   = fadeIn * fadeOut * starAlpha;

      // Position fading tail segments along the velocity vector, backward from the tip
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const ux    = s.vx / speed;
      const uy    = s.vy / speed;
      for (let k = 1; k <= SHOOT_SEGMENTS; k++) {
        const frac = k / SHOOT_SEGMENTS;
        const dist = frac * s.tailLen;
        const sp = this.shootSprites[k - 1];
        sp.setPosition(s.x - ux * dist, s.y - uy * dist);
        sp.setScale((1.1 * (1 - frac * 0.5)) / STAR_CORE_R);
        sp.setAlpha(alpha * (1 - frac) * 0.65);
        sp.setVisible(true);
      }
      // Bright tip
      const tip = this.shootSprites[SHOOT_SEGMENTS];
      tip.setPosition(s.x, s.y);
      tip.setScale(1.5 / STAR_CORE_R);
      tip.setAlpha(alpha);
      tip.setVisible(true);

    } else if (elevation < -0.08) {
      this.shootTimer -= dt * 1000;
      if (this.shootTimer <= 0) this.spawnShooting();
    }
  }

  private spawnShooting(): void {
    const skyH   = this.groundY * 0.35;
    const startX = Math.random() * this.width;
    const startY = Math.random() * skyH;

    // Falls at 30–60° below horizontal, left-to-right or right-to-left
    const angleDeg = 30 + Math.random() * 30; // degrees below horizontal (positive)
    const rad      = (angleDeg * Math.PI) / 180;
    const dir      = Math.random() < 0.5 ? 1 : -1;
    const speed    = SHOOT_SPEED * (0.8 + Math.random() * 0.4);

    this.shooting = {
      x:       startX,
      y:       startY,
      vx:      Math.cos(rad) * speed * dir,  // horizontal
      vy:      Math.sin(rad) * speed,          // downward (positive Y = down in screen space)
      t:       0,
      tailLen: speed * 0.12,
    };
  }

  resize(): void {
    // Stars are repositioned each frame during update via parallax
  }

  destroy(): void {
    for (const star of this.stars) star.sprite.destroy();
    for (const sp of this.shootSprites) sp.destroy();
  }
}
