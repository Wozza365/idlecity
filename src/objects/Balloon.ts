import Phaser from 'phaser';

const BALLOON_W   = 24;
const BALLOON_H   = 32;
const GONDOLA_W   = 6;
const GONDOLA_H   = 4;
const ROPE_LEN    = 5;
const MIN_SPEED   = 8;
const MAX_SPEED   = 13;
const MIN_WAIT_MS = 180_000;
const MAX_WAIT_MS = 360_000;

function lerpColor(a: number, b: number, t: number): number {
  const r  = ((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t;
  const g  = ((a >> 8)  & 0xff) + (((b >> 8)  & 0xff) - ((a >> 8)  & 0xff)) * t;
  const bl = (a & 0xff) + ((b & 0xff) - (a & 0xff)) * t;
  return ((r | 0) << 16 | (g | 0) << 8 | (bl | 0)) >>> 0;
}

const STRIPE_COLORS: [number, number][] = [
  [0xff2200, 0xffdd00],  // Red / Golden yellow
  [0x0044ee, 0xffffff],  // Cobalt blue / White
  [0xcc00cc, 0x00ffee],  // Magenta / Cyan
  [0xff6600, 0x0066ff],  // Orange / Sky blue
  [0x00cc44, 0xffee00],  // Lime green / Yellow
];

export class Balloon {
  private gfx: Phaser.GameObjects.Graphics;
  private active = false;
  private x = 0;
  private y = 0;
  private vx = 0;
  private bobPhase = 0;
  private driftPhase = 0;
  private idleTimer: number;
  private sceneWidth = 800;
  private skyH = 400;
  private stripeIdx = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1.2);
    this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
  }

  rebuild(sceneWidth: number, groundY: number): void {
    this.sceneWidth = sceneWidth;
    this.skyH       = groundY;
  }

  update(delta: number, elevation: number, sunAngle = Math.PI / 2): void {
    this.gfx.clear();

    if (this.active) {
      this.x          += this.vx * delta / 1000;
      this.bobPhase   += delta / 1000 * 0.6;
      this.driftPhase += delta / 1000 * 0.05;
      const bobY       = this.y + Math.sin(this.bobPhase) * 1 + Math.sin(this.driftPhase) * 5;

      // No alpha fade — fading caused negative alpha artefacts near the edges.
      // Just remove the balloon once it is comfortably off-screen.
      if (this.x < -(BALLOON_W + 200) || this.x > this.sceneWidth + BALLOON_W + 200) {
        this.active    = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else {
        this.draw(this.x, bobY, sunAngle);
      }
    } else if (elevation > 0.05) {
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) this.spawn();
    }
  }

  private spawn(): void {
    const fromLeft  = Math.random() < 0.5;
    const speed     = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    this.x          = fromLeft ? -(BALLOON_W + 10) : this.sceneWidth + BALLOON_W + 10;
    this.y          = this.skyH * (0.35 + Math.random() * 0.20);
    this.vx         = fromLeft ? speed : -speed;
    this.bobPhase   = Math.random() * Math.PI * 2;
    this.driftPhase = Math.random() * Math.PI * 2;
    this.stripeIdx  = Math.floor(Math.random() * STRIPE_COLORS.length);
    this.active     = true;
  }

  forceSpawn(): void {
    const fromLeft  = Math.random() < 0.5;
    const speed     = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    this.x          = fromLeft ? this.sceneWidth * 0.15 : this.sceneWidth * 0.85;
    this.y          = this.skyH * (0.35 + Math.random() * 0.20);
    this.vx         = fromLeft ? speed : -speed;
    this.bobPhase   = Math.random() * Math.PI * 2;
    this.driftPhase = Math.random() * Math.PI * 2;
    this.stripeIdx  = (this.stripeIdx + 1 + Math.floor(Math.random() * (STRIPE_COLORS.length - 1))) % STRIPE_COLORS.length;
    this.active     = true;
  }

  private draw(cx: number, cy: number, sunAngle: number): void {
    const gfx = this.gfx;
    const [col1, col2] = STRIPE_COLORS[this.stripeIdx];
    const rx   = BALLOON_W / 2;   // 12
    const bh   = BALLOON_H;       // 32
    const bx   = Math.round(cx);
    const by   = Math.round(cy);
    const topY = by - bh / 2;

    // Circular-dome profile (rounded top, tapering neck at bottom):
    //   Top  (t=0..T_PEAK): half-width = rx · √(1−((T_PEAK−t)/T_PEAK)²)
    //   Bottom (t=T_PEAK..1): half-width = rx · (NECK_W + (1−NECK_W)·cos((t−T_PEAK)/(1−T_PEAK)·π/2))
    const T_PEAK = 0.40;
    const NECK_W = 0.28;

    const y1s = new Int32Array(BALLOON_W);
    const y2s = new Int32Array(BALLOON_W);
    for (let col = 0; col < BALLOON_W; col++) {
      const nx = Math.abs(col + 0.5 - rx) / rx;
      if (nx >= 1) { y1s[col] = -1; continue; }
      const tTop = T_PEAK * (1 - Math.sqrt(1 - nx * nx));
      const tBot = nx <= NECK_W
        ? 1.0
        : T_PEAK + (1 - T_PEAK) * (2 / Math.PI) * Math.acos((nx - NECK_W) / (1 - NECK_W));
      y1s[col] = Math.round(topY + tTop * bh);
      y2s[col] = Math.round(topY + tBot * bh);
    }

    // Shadow direction: opposite side from the sun.
    // cos(sunAngle) > 0 → sun in east → shadow falls west (negative x).
    // Shadow is longer near the horizon (low elevation) and shorter at noon.
    const elev    = Math.max(0.05, Math.sin(sunAngle));
    const shadowX = Math.round(-Math.cos(sunAngle) * 3);     // ±3 px horizontal
    const shadowY = Math.round(2 + (1 - elev) * 2);          // 2 px (noon) → 4 px (horizon)

    const envBottomY = by + bh / 2;
    const gondolaY   = envBottomY + ROPE_LEN;

    // ── Drop shadow: inner (closer/darker) + outer (faint penumbra) ──────────
    for (const [frac, sa] of [[0.5, 0.18], [1.0, 0.07]] as [number, number][]) {
      const sox = Math.round(shadowX * frac);
      const soy = Math.max(1, Math.round(shadowY * frac));
      gfx.fillStyle(0x000000, sa);
      for (let col = 0; col < BALLOON_W; col++) {
        if (y1s[col] < 0) continue;
        const h = y2s[col] - y1s[col];
        if (h < 1) continue;
        gfx.fillRect(bx - rx + col + sox, y1s[col] + soy, 1, h);
      }
      gfx.fillRect(bx - GONDOLA_W / 2 + sox, gondolaY + soy, GONDOLA_W, GONDOLA_H);
    }

    // ── Balloon envelope stripes (sub-pixel AA) ───────────────────────────────
    // Each stripe boundary is positioned using cx's fractional part so boundaries
    // slide continuously rather than jumping 1px at a time with bx snaps.
    // A 0.5px blend zone at each boundary prevents the per-column colour flash.
    const stripeColW = BALLOON_W / 8;
    const subPx = cx - Math.round(cx);                // fractional pixel offset [-0.5, 0.5]
    const AA    = 0.5 / stripeColW;                   // blend zone ≈ 0.5px per boundary side
    const colorOf = (i: number): number => (((i % 2) + 2) % 2) === 0 ? col1 : col2;

    for (let col = 0; col < BALLOON_W; col++) {
      if (y1s[col] < 0) continue;
      const h = y2s[col] - y1s[col];
      if (h < 1) continue;
      const sp = (col - subPx) / stripeColW;
      const si = Math.floor(sp);
      const t  = sp - si;
      let c: number;
      if (t < AA) {
        c = lerpColor(colorOf(si - 1), colorOf(si), t / AA);
      } else if (t > 1 - AA) {
        c = lerpColor(colorOf(si), colorOf(si + 1), (t - (1 - AA)) / AA);
      } else {
        c = colorOf(si);
      }
      gfx.fillStyle(c, 1);
      gfx.fillRect(bx - rx + col, y1s[col], 1, h);
    }

    // ── Silhouette rim (1 px top and bottom) ─────────────────────────────────
    gfx.fillStyle(0x000000, 0.35);
    for (let col = 0; col < BALLOON_W; col++) {
      if (y1s[col] < 0) continue;
      gfx.fillRect(bx - rx + col, y1s[col],         1, 1);
      gfx.fillRect(bx - rx + col, y2s[col] - 1,     1, 1);
    }

    // ── Burner glow ───────────────────────────────────────────────────────────
    gfx.fillStyle(0xff9900, 0.75);
    gfx.fillRect(bx - 1, envBottomY - 2, 3, 3);
    gfx.fillStyle(0xffee88, 0.9);
    gfx.fillRect(bx,     envBottomY - 3, 1, 2);

    // ── Ropes ─────────────────────────────────────────────────────────────────
    const ropeSpread = Math.floor(GONDOLA_W / 2);  // ropes at gondola corners
    gfx.fillStyle(0x886644, 0.9);
    gfx.fillRect(bx - ropeSpread, envBottomY, 1, ROPE_LEN + 1);
    gfx.fillRect(bx + ropeSpread, envBottomY, 1, ROPE_LEN + 1);

    // ── Gondola ───────────────────────────────────────────────────────────────
    gfx.fillStyle(0x8B5E3C, 1);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY, GONDOLA_W, GONDOLA_H);
    gfx.fillStyle(0x5C3A1A, 1);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY, GONDOLA_W, 1);
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillRect(bx - GONDOLA_W / 2, gondolaY + GONDOLA_H - 1, GONDOLA_W, 1);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
