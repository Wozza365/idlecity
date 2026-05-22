import Phaser from 'phaser';

const PLOT_COUNT = 5;
const PLOT_WIDTH = 160;
const PLOT_BASE_HEIGHT = 140;
const HEIGHT_PER_LEVEL = 2;
const MAX_LEVEL = 100;
const PLOT_GAP = 24;
const GROUND_Y = 480;

interface PlotState {
  id: number;
  unlocked: boolean;
  level: number; // 1–100 when unlocked; 0 when locked
}

export class GameScene extends Phaser.Scene {
  private plotStates: PlotState[] = Array.from({ length: PLOT_COUNT }, (_, i) => ({
    id: i,
    unlocked: i === 0,
    level: i === 0 ? 1 : 0,
  }));

  private plotContainers: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.drawBackground();
    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  /** Returns pixel height for a given level (1–MAX_LEVEL). */
  private buildingHeight(level: number): number {
    const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
    return PLOT_BASE_HEIGHT + (clamped - 1) * HEIGHT_PER_LEVEL;
  }

  private plotLeft(index: number): number {
    const totalWidth = PLOT_COUNT * PLOT_WIDTH + (PLOT_COUNT - 1) * PLOT_GAP;
    const startX = (this.scale.width - totalWidth) / 2;
    return startX + index * (PLOT_WIDTH + PLOT_GAP);
  }

  // ── Background ────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { width, height } = this.scale;

    // Sky
    this.add.rectangle(width / 2, GROUND_Y / 2, width, GROUND_Y, 0x16213e);

    // Ground strip
    this.add.rectangle(width / 2, GROUND_Y + 10, width, 20, 0x555e6b);

    // Panel area below ground
    this.add.rectangle(
      width / 2,
      (GROUND_Y + 20 + height) / 2,
      width,
      height - GROUND_Y - 20,
      0x1e2433
    );
  }

  // ── Plot rendering ────────────────────────────────────────────────────────

  private renderPlot(index: number): Phaser.GameObjects.Container {
    this.plotContainers[index]?.destroy();

    const x = this.plotLeft(index);
    const container = this.add.container(0, 0);

    if (this.plotStates[index].unlocked) {
      this.buildBuilding(container, x, this.plotStates[index].level);
    } else {
      this.buildLockedPlot(container, x, index);
    }

    return container;
  }

  private buildBuilding(
    container: Phaser.GameObjects.Container,
    x: number,
    level: number
  ): void {
    const w = PLOT_WIDTH;
    const h = this.buildingHeight(level);
    const top = GROUND_Y - h;
    const cx = x + w / 2;

    // Main body — brick red
    const body = this.add.rectangle(cx, top + h / 2, w, h, 0x7b3f2a);
    container.add(body);

    // Roof ledge — cement grey
    const roof = this.add.rectangle(cx, top - 5, w + 8, 12, 0x9aa2a8);
    container.add(roof);
  }

  private buildLockedPlot(
    container: Phaser.GameObjects.Container,
    x: number,
    index: number
  ): void {
    const w = PLOT_WIDTH;
    const h = PLOT_BASE_HEIGHT;
    const top = GROUND_Y - h;
    const cx = x + w / 2;
    const cy = top + h / 2;

    // Dim background + border
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1e2433, 0.9);
    gfx.fillRect(x, top, w, h);
    gfx.lineStyle(2, 0x3a3d5c, 1);
    gfx.strokeRect(x, top, w, h);
    container.add(gfx);

    // Lock icon
    const lockIcon = this.add.text(cx, cy - 18, '🔒', { fontSize: '24px' }).setOrigin(0.5);
    container.add(lockIcon);

    // Unlock button
    const btn = this.add
      .rectangle(cx, cy + 22, 104, 28, 0x2d6b1a)
      .setInteractive({ useHandCursor: true });
    container.add(btn);

    const btnLabel = this.add
      .text(cx, cy + 22, 'Unlock', { fontSize: '13px', color: '#e8ffe8' })
      .setOrigin(0.5);
    container.add(btnLabel);

    btn.on('pointerover', () => btn.setFillStyle(0x3d8a22));
    btn.on('pointerout', () => btn.setFillStyle(0x2d6b1a));
    btn.on('pointerdown', () => {
      this.plotStates[index].unlocked = true;
      this.plotStates[index].level = 1;
      this.plotContainers[index] = this.renderPlot(index);
    });
  }
}
