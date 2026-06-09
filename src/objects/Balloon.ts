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

// Canvas texture local dimensions and anchor point
const CT_PAD = 2;                                          // padding around balloon
const CT_W   = BALLOON_W + CT_PAD * 2;                    // 28
const CT_H   = BALLOON_H + ROPE_LEN + GONDOLA_H + CT_PAD * 2; // 45
const CT_CX  = CT_W / 2;                                  // 14  – local balloon centre x
const CT_CY  = CT_PAD + BALLOON_H / 2;                    // 18  – local balloon centre y
const CT_TOP = CT_CY - BALLOON_H / 2;                     //  2  – local top of envelope

const T_PEAK = 0.40;
const NECK_W = 0.28;

const STRIPE_COLORS: [number, number][] = [
  [0xff2200, 0xffdd00],  // Red / Golden yellow
  [0x0044ee, 0xffffff],  // Cobalt blue / White
  [0xcc00cc, 0x00ffee],  // Magenta / Cyan
  [0xff6600, 0x0066ff],  // Orange / Sky blue
  [0x00cc44, 0xffee00],  // Lime green / Yellow
];

// Smooth balloon outline sampled at 4× horizontal resolution for Canvas 2D path.
// These coordinates are in canvas-local space (constant, independent of world position).
const PROFILE_STEPS = BALLOON_W * 4;
const profileTopX: number[] = [];
const profileTopY: number[] = [];
const profileBotX: number[] = [];
const profileBotY: number[] = [];
for (let i = 0; i <= PROFILE_STEPS; i++) {
  const col = (i / PROFILE_STEPS) * BALLOON_W;
  const nx  = Math.abs(col - BALLOON_W / 2) / (BALLOON_W / 2);
  if (nx > 1) continue;
  const tTop = T_PEAK * (1 - Math.sqrt(1 - nx * nx));
  const tBot = nx <= NECK_W
    ? 1.0
    : T_PEAK + (1 - T_PEAK) * (2 / Math.PI) * Math.acos((nx - NECK_W) / (1 - NECK_W));
  profileTopX.push(CT_CX - BALLOON_W / 2 + col);
  profileTopY.push(CT_TOP + tTop * BALLOON_H);
  profileBotX.push(CT_CX - BALLOON_W / 2 + col);
  profileBotY.push(CT_TOP + tBot * BALLOON_H);
}

// Shadow profile uses 1-px column granularity (matches the Phaser Graphics pixel grid)
const shadowY1s = new Int32Array(BALLOON_W);
const shadowY2s = new Int32Array(BALLOON_W);
for (let col = 0; col < BALLOON_W; col++) {
  const nx = Math.abs(col + 0.5 - BALLOON_W / 2) / (BALLOON_W / 2);
  if (nx >= 1) { shadowY1s[col] = -1; continue; }
  const tTop = T_PEAK * (1 - Math.sqrt(1 - nx * nx));
  const tBot = nx <= NECK_W
    ? 1.0
    : T_PEAK + (1 - T_PEAK) * (2 / Math.PI) * Math.acos((nx - NECK_W) / (1 - NECK_W));
  shadowY1s[col] = Math.round(tTop * BALLOON_H);   // relative to balloon top
  shadowY2s[col] = Math.round(tBot * BALLOON_H);
}

function numToHex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export class Balloon {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private img: Phaser.GameObjects.Image | null = null;
  private canvasTex: Phaser.Textures.CanvasTexture | null = null;
  private texKey = 'balloon-body';

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
    this.scene = scene;
    this.gfx   = scene.add.graphics().setDepth(1.2);
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

      if (this.x < -(BALLOON_W + 200) || this.x > this.sceneWidth + BALLOON_W + 200) {
        this.active = false;
        this.img?.setVisible(false);
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else {
        this.img?.setPosition(this.x, bobY);
        this.drawShadow(this.x, bobY, sunAngle);
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
    this.bake();
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
    this.bake();
  }

  // Render the balloon body (everything except the shadow) into a canvas texture
  // once per spawn.  Canvas 2D anti-aliases path edges naturally, so the
  // silhouette stays smooth even though Phaser's own pipeline is pixel-perfect.
  private bake(): void {
    const [col1, col2] = STRIPE_COLORS[this.stripeIdx];

    if (!this.canvasTex) {
      this.canvasTex = this.scene.textures.createCanvas(this.texKey, CT_W, CT_H)!;
    }

    const ctx = this.canvasTex.getContext();
    ctx.clearRect(0, 0, CT_W, CT_H);

    // ── Build smooth balloon outline as a Path2D ──────────────────────────────
    const path = new Path2D();
    // Top arc: left to right
    for (let i = 0; i < profileTopX.length; i++) {
      if (i === 0) path.moveTo(profileTopX[i], profileTopY[i]);
      else         path.lineTo(profileTopX[i], profileTopY[i]);
    }
    // Bottom arc: right to left
    for (let i = profileBotX.length - 1; i >= 0; i--) {
      path.lineTo(profileBotX[i], profileBotY[i]);
    }
    path.closePath();

    // ── Clip to balloon shape, then fill stripes ──────────────────────────────
    ctx.save();
    ctx.clip(path);

    const stripeW = BALLOON_W / 8;
    for (let s = 0; s < 8; s++) {
      ctx.fillStyle = s % 2 === 0 ? numToHex(col1) : numToHex(col2);
      ctx.fillRect(CT_CX - BALLOON_W / 2 + s * stripeW, CT_TOP, stripeW, BALLOON_H);
    }

    ctx.restore();

    // ── Stroke the outline for a subtle dark rim (Canvas 2D AA'd stroke) ──────
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.40)';
    ctx.lineWidth   = 1;
    ctx.stroke(path);

    // ── Burner glow ───────────────────────────────────────────────────────────
    const envBotY = CT_CY + BALLOON_H / 2;
    ctx.fillStyle = 'rgba(255, 153, 0, 0.75)';
    ctx.fillRect(CT_CX - 1, envBotY - 2, 3, 3);
    ctx.fillStyle = 'rgba(255, 238, 136, 0.9)';
    ctx.fillRect(CT_CX, envBotY - 3, 1, 2);

    // ── Ropes ─────────────────────────────────────────────────────────────────
    const ropeSpread = Math.floor(GONDOLA_W / 2);
    ctx.fillStyle = 'rgba(136, 102, 68, 0.9)';
    ctx.fillRect(CT_CX - ropeSpread, envBotY,     1, ROPE_LEN + 1);
    ctx.fillRect(CT_CX + ropeSpread, envBotY,     1, ROPE_LEN + 1);

    // ── Gondola ───────────────────────────────────────────────────────────────
    const gondolaY = envBotY + ROPE_LEN;
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(CT_CX - GONDOLA_W / 2, gondolaY, GONDOLA_W, GONDOLA_H);
    ctx.fillStyle = '#5C3A1A';
    ctx.fillRect(CT_CX - GONDOLA_W / 2, gondolaY, GONDOLA_W, 1);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(CT_CX - GONDOLA_W / 2, gondolaY + GONDOLA_H - 1, GONDOLA_W, 1);

    this.canvasTex.refresh();

    if (!this.img) {
      this.img = this.scene.add.image(this.x, this.y, this.texKey)
        .setDepth(1.2)
        .setOrigin(CT_CX / CT_W, CT_CY / CT_H);
    } else {
      this.img.setTexture(this.texKey);
    }
    this.img.setVisible(true);
  }

  // Per-frame shadow only: depends on sunAngle so cannot be baked.
  private drawShadow(cx: number, cy: number, sunAngle: number): void {
    const gfx = this.gfx;
    const rx   = BALLOON_W / 2;
    const bx   = Math.round(cx);
    const topY = Math.round(cy) - BALLOON_H / 2;

    const elev    = Math.max(0.05, Math.sin(sunAngle));
    const shadowX = Math.round(-Math.cos(sunAngle) * 3);
    const shadowY = Math.round(2 + (1 - elev) * 2);
    const envBotY = Math.round(cy) + BALLOON_H / 2;
    const gondolaY = envBotY + ROPE_LEN;

    for (const [frac, sa] of [[0.5, 0.18], [1.0, 0.07]] as [number, number][]) {
      const sox = Math.round(shadowX * frac);
      const soy = Math.max(1, Math.round(shadowY * frac));
      gfx.fillStyle(0x000000, sa);
      for (let col = 0; col < BALLOON_W; col++) {
        if (shadowY1s[col] < 0) continue;
        const h = shadowY2s[col] - shadowY1s[col];
        if (h < 1) continue;
        gfx.fillRect(bx - rx + col + sox, topY + shadowY1s[col] + soy, 1, h);
      }
      gfx.fillRect(bx - GONDOLA_W / 2 + sox, gondolaY + soy, GONDOLA_W, GONDOLA_H);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.img?.destroy();
    if (this.canvasTex) this.scene.textures.remove(this.texKey);
  }
}
