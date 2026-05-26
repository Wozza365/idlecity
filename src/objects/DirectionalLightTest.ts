import Phaser from 'phaser';

const SHADOW_LEN = 200;

export class DirectionalLightTest {
  private readonly light: Phaser.GameObjects.Light;
  private readonly gfx:   Phaser.GameObjects.Graphics;
  private readonly cx: number;
  private readonly cy: number;

  constructor(scene: Phaser.Scene, screenW: number, groundY: number) {
    this.cx = screenW / 2;
    this.cy = groundY / 2;

    this.light = scene.lights.addLight(this.cx, this.cy, 120, 0xfff2cc, 1.5);

    this.gfx = scene.add.graphics().setDepth(12);
    this.draw();
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  update(): void {}

  destroy(scene: Phaser.Scene): void {
    scene.lights.removeLight(this.light);
    this.gfx.destroy();
  }

  private shadowFor(
    // two "far" corners of the box face pointing away from the light
    ax: number, ay: number,
    bx: number, by: number,
    // two "near" corners (the face closest to the light — used as shadow base)
    cx: number, cy: number,
    dx: number, dy: number,
  ): void {
    const lx = this.cx, ly = this.cy;

    const project = (px: number, py: number) => {
      const vx = px - lx, vy = py - ly;
      const mag = Math.sqrt(vx * vx + vy * vy);
      return { x: px + (vx / mag) * SHADOW_LEN, y: py + (vy / mag) * SHADOW_LEN };
    };

    const pa = project(ax, ay);
    const pb = project(bx, by);

    this.gfx.fillStyle(0x000000, 0.45);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.gfx as any).fillPoints([
      { x: cx, y: cy },
      { x: dx, y: dy },
      pb,
      pa,
    ], true);
  }

  private draw(): void {
    const lx = this.cx, ly = this.cy;
    const gap  = 8;   // distance from light centre to near edge of each box
    const long = 20;  // half-length of box
    const thin = 3;   // half-thickness of box

    // Top box (horizontal, above light)
    const top = { x: lx - long, y: ly - gap - thin * 2, w: long * 2, h: thin * 2 };
    // Left box (vertical, left of light)
    const left = { x: lx - gap - thin * 2, y: ly - long, w: thin * 2, h: long * 2 };
    // Right box (vertical, right of light)
    const right = { x: lx + gap, y: ly - long, w: thin * 2, h: long * 2 };

    this.gfx.clear();

    // Shadows (drawn first so boxes sit on top)
    // Top box: far face = top edge
    this.shadowFor(
      top.x,          top.y,
      top.x + top.w,  top.y,
      top.x,          top.y + top.h,
      top.x + top.w,  top.y + top.h,
    );
    // Left box: far face = left edge
    this.shadowFor(
      left.x,           left.y,
      left.x,           left.y + left.h,
      left.x + left.w,  left.y,
      left.x + left.w,  left.y + left.h,
    );
    // Right box: far face = right edge
    this.shadowFor(
      right.x + right.w,  right.y,
      right.x + right.w,  right.y + right.h,
      right.x,            right.y,
      right.x,            right.y + right.h,
    );

    // Boxes
    this.gfx.fillStyle(0x888899, 1);
    this.gfx.fillRect(top.x,   top.y,   top.w,   top.h);
    this.gfx.fillRect(left.x,  left.y,  left.w,  left.h);
    this.gfx.fillRect(right.x, right.y, right.w, right.h);

    // Light source dot
    this.gfx.fillStyle(0xffffaa, 1);
    this.gfx.fillCircle(lx, ly, 5);
  }
}
