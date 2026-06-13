import Phaser from 'phaser';

const MIN_SPEED   = 11;
const MAX_SPEED   = 19;
const MIN_WAIT_MS = 100_000;
const MAX_WAIT_MS = 220_000;

// Kite dimensions
const KITE_W        = 14;
const KITE_H        = 16;
const TAIL_SEGS     = 4;
const TAIL_SEG_LEN  = 5;
const FLUTTER_FREQ  = 3.2;

// Drone dimensions
const DRONE_W   = 9;
const DRONE_H   = 4;
const ROTOR_ARM = 5;
const ROTOR_LEN = 4.5;
const ROTOR_FREQ = 22; // visual spin rate

const KITE_COLOR_PAIRS: [number, number][] = [
  [0xff4444, 0xffee44],
  [0x4488ff, 0xffffff],
  [0x44cc88, 0xffcc22],
  [0xff88cc, 0x6644ff],
];

type ToyType = 'kite' | 'drone';

export class SkyToy {
  private gfx: Phaser.GameObjects.Graphics;
  private active = false;
  private type: ToyType = 'kite';
  private x = 0;
  private y = 0;
  private vx = 0;
  private bobPhase = 0;
  private time = 0;
  private colorIdx = 0;
  private idleTimer: number;
  private sceneWidth = 800;
  private skyH = 400;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(1.25);
    this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
  }

  rebuild(sceneWidth: number, groundY: number): void {
    this.sceneWidth = sceneWidth;
    this.skyH       = groundY;
  }

  update(delta: number, elevation: number): void {
    this.gfx.clear();

    if (this.active) {
      this.time     += delta / 1000;
      this.x        += this.vx * delta / 1000;
      this.bobPhase += delta / 1000 * (this.type === 'kite' ? 0.9 : 0.5);
      const bobAmp   = this.type === 'kite' ? 4 : 1.5;
      const bobY     = this.y + Math.sin(this.bobPhase) * bobAmp;

      const half = this.type === 'kite' ? KITE_W : DRONE_W + ROTOR_ARM + ROTOR_LEN;
      if (this.x < -(half + 30) || this.x > this.sceneWidth + half + 30) {
        this.active = false;
        this.idleTimer = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
      } else if (this.type === 'kite') {
        this.drawKite(this.x, bobY);
      } else {
        this.drawDrone(this.x, bobY);
      }
    } else if (elevation > 0.05) {
      this.idleTimer -= delta;
      if (this.idleTimer <= 0) this.spawn();
    }
  }

  private spawn(): void {
    const fromLeft = Math.random() < 0.5;
    const speed    = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
    this.type      = Math.random() < 0.5 ? 'kite' : 'drone';
    this.x         = fromLeft ? -30 : this.sceneWidth + 30;
    this.y         = this.skyH * (0.12 + Math.random() * 0.35);
    this.vx        = fromLeft ? speed : -speed;
    this.bobPhase  = Math.random() * Math.PI * 2;
    this.time      = 0;
    this.colorIdx  = Math.floor(Math.random() * KITE_COLOR_PAIRS.length);
    this.active    = true;
  }

  private drawKite(cx: number, cy: number): void {
    const gfx = this.gfx;
    const [colA, colB] = KITE_COLOR_PAIRS[this.colorIdx];
    const top    = { x: cx,            y: cy - KITE_H / 2 };
    const bottom = { x: cx,            y: cy + KITE_H / 2 };
    const left   = { x: cx - KITE_W / 2, y: cy };
    const right  = { x: cx + KITE_W / 2, y: cy };

    gfx.fillStyle(colA, 1);
    gfx.fillTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
    gfx.fillStyle(colB, 1);
    gfx.fillTriangle(bottom.x, bottom.y, left.x, left.y, right.x, right.y);

    // Spars
    gfx.lineStyle(1, 0x553311, 0.6);
    gfx.beginPath();
    gfx.moveTo(top.x, top.y);
    gfx.lineTo(bottom.x, bottom.y);
    gfx.moveTo(left.x, left.y);
    gfx.lineTo(right.x, right.y);
    gfx.strokePath();

    // Fluttering tail with alternating coloured bows
    let segX = bottom.x;
    let segY = bottom.y;
    for (let i = 0; i < TAIL_SEGS; i++) {
      const nextY = segY + TAIL_SEG_LEN;
      const sway  = Math.sin(this.time * FLUTTER_FREQ + i * 0.9) * (1.5 + i * 0.8);
      const nextX = bottom.x + sway;
      gfx.lineStyle(1, 0x886644, 0.7);
      gfx.beginPath();
      gfx.moveTo(segX, segY);
      gfx.lineTo(nextX, nextY);
      gfx.strokePath();
      gfx.fillStyle(i % 2 === 0 ? colA : colB, 0.9);
      gfx.fillCircle(nextX, nextY, 1.4);
      segX = nextX;
      segY = nextY;
    }
  }

  private drawDrone(cx: number, cy: number): void {
    const gfx = this.gfx;

    // Arms
    const arms = [
      { dx: -DRONE_W / 2, dy: -DRONE_H / 2 },
      { dx:  DRONE_W / 2, dy: -DRONE_H / 2 },
      { dx: -DRONE_W / 2, dy:  DRONE_H / 2 },
      { dx:  DRONE_W / 2, dy:  DRONE_H / 2 },
    ];
    gfx.lineStyle(1, 0x222222, 0.9);
    for (const a of arms) {
      const ax = cx + a.dx;
      const ay = cy + a.dy;
      const rx = ax + Math.sign(a.dx) * ROTOR_ARM;
      const ry = ay + Math.sign(a.dy) * ROTOR_ARM;
      gfx.beginPath();
      gfx.moveTo(ax, ay);
      gfx.lineTo(rx, ry);
      gfx.strokePath();

      // Spinning rotor blur — width oscillates rapidly to suggest motion
      const spin = Math.abs(Math.sin(this.time * ROTOR_FREQ + (a.dx + a.dy) * 0.3));
      const rotorW = ROTOR_LEN * (0.5 + 0.5 * spin);
      gfx.fillStyle(0x666666, 0.45);
      gfx.fillEllipse(rx, ry, rotorW * 2, 1.2);
    }

    // Body
    gfx.fillStyle(0x2b2b33, 1);
    gfx.fillRoundedRect(cx - DRONE_W / 2, cy - DRONE_H / 2, DRONE_W, DRONE_H, 1);

    // Blinking status light
    const blink = (Math.sin(this.time * 6) + 1) / 2;
    gfx.fillStyle(0xff3333, 0.4 + blink * 0.6);
    gfx.fillCircle(cx, cy + DRONE_H / 2, 1);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
