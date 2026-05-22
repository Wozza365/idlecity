import Phaser from 'phaser';

// ── Constants ──────────────────────────────────────────────────────────────────

const PLOT_COUNT = 5;
const PLOT_WIDTH = 160;
const PLOT_BASE_HEIGHT = 140;
const HEIGHT_PER_LEVEL = 2;
const MAX_LEVEL = 100;
const PLOT_GAP = 24;
const GROUND_Y = 480;
const PANEL_TOP = GROUND_Y + 20;   // top of the bottom UI panel (500)
const STATS_BAR_H = 44;            // height reserved for the global stats row
const COL_TOP = PANEL_TOP + STATS_BAR_H; // where column content begins (544)
const SECTION_W = 1280 / PLOT_COUNT;     // column width (256px)

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlotState {
  id: number;
  unlocked: boolean;
  level: number; // 1–100 when unlocked; 0 when locked
}

// ── Scene ──────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private plotStates: PlotState[] = Array.from({ length: PLOT_COUNT }, (_, i) => ({
    id: i,
    unlocked: i === 0,
    level: i === 0 ? 1 : 0,
  }));

  private gold: number = 0;

  private plotContainers: Phaser.GameObjects.Container[] = [];
  private uiContainers: Phaser.GameObjects.Container[] = [];

  // Stats bar text refs — set in drawStatsBar()
  private goldText!: Phaser.GameObjects.Text;
  private taxRateText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this.drawBackground();

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.drawPanelChrome();
    this.drawStatsBar();

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.uiContainers[i] = this.renderUISection(i);
    }

    // Tax tick — fires every second
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.onTaxTick,
      callbackScope: this,
    });
  }

  // ── Tax system ─────────────────────────────────────────────────────────────

  /**
   * Tax rate = sum of levels across all unlocked buildings.
   * More buildings and higher levels both increase income.
   */
  private get taxRate(): number {
    return this.plotStates
      .filter((p) => p.unlocked)
      .reduce((sum, p) => sum + p.level, 0);
  }

  private onTaxTick(): void {
    this.gold += this.taxRate;
    this.updateStats();
  }

  private updateStats(): void {
    this.goldText.setText(`Balance: ${fmt(this.gold)}`);
    this.taxRateText.setText(`Tax Rate: ${fmt(this.taxRate)}/s`);
  }

  // ── Height helper ──────────────────────────────────────────────────────────

  private buildingHeight(level: number): number {
    const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
    return PLOT_BASE_HEIGHT + (clamped - 1) * HEIGHT_PER_LEVEL;
  }

  // ── Layout helper ──────────────────────────────────────────────────────────

  private plotLeft(index: number): number {
    const totalWidth = PLOT_COUNT * PLOT_WIDTH + (PLOT_COUNT - 1) * PLOT_GAP;
    const startX = (this.scale.width - totalWidth) / 2;
    return startX + index * (PLOT_WIDTH + PLOT_GAP);
  }

  // ── Background ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { width, height } = this.scale;

    // Sky
    this.add.rectangle(width / 2, GROUND_Y / 2, width, GROUND_Y, 0x16213e);

    // Ground strip
    this.add.rectangle(width / 2, GROUND_Y + 10, width, 20, 0x555e6b);

    // UI panel background
    this.add.rectangle(width / 2, (PANEL_TOP + height) / 2, width, height - PANEL_TOP, 0x1e2433);
  }

  /** Static chrome: panel top border, stats divider, column dividers. */
  private drawPanelChrome(): void {
    const { width, height } = this.scale;
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x3a4a5a, 1);

    // Panel top border
    gfx.moveTo(0, PANEL_TOP).lineTo(width, PANEL_TOP).strokePath();

    // Stats bar bottom border
    gfx.moveTo(0, COL_TOP).lineTo(width, COL_TOP).strokePath();

    // Column dividers (below stats bar only)
    for (let i = 1; i < PLOT_COUNT; i++) {
      const x = i * SECTION_W;
      gfx.moveTo(x, COL_TOP).lineTo(x, height).strokePath();
    }
  }

  // ── Stats bar ──────────────────────────────────────────────────────────────

  private drawStatsBar(): void {
    const { width } = this.scale;
    const midY = PANEL_TOP + STATS_BAR_H / 2;

    this.taxRateText = this.add
      .text(24, midY, `Tax Rate: ${fmt(this.taxRate)}/s`, {
        fontSize: '15px',
        color: '#88ccff',
      })
      .setOrigin(0, 0.5);

    this.goldText = this.add
      .text(width - 24, midY, `Balance: ${fmt(this.gold)}`, {
        fontSize: '15px',
        color: '#ffd966',
      })
      .setOrigin(1, 0.5);
  }

  // ── Plot rendering ─────────────────────────────────────────────────────────

  private renderPlot(index: number): Phaser.GameObjects.Container {
    this.plotContainers[index]?.destroy();

    const x = this.plotLeft(index);
    const container = this.add.container(0, 0);

    if (this.plotStates[index].unlocked) {
      this.buildBuilding(container, x, this.plotStates[index].level);
    } else {
      this.buildEmptyPlot(container, x);
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
    container.add(this.add.rectangle(cx, top + h / 2, w, h, 0x7b3f2a));

    // Roof ledge — cement grey
    container.add(this.add.rectangle(cx, top - 5, w + 8, 12, 0x9aa2a8));
  }

  private buildEmptyPlot(container: Phaser.GameObjects.Container, x: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1b2e, 0.7);
    gfx.fillRect(x, GROUND_Y - PLOT_BASE_HEIGHT, PLOT_WIDTH, PLOT_BASE_HEIGHT);
    gfx.lineStyle(2, 0x3a3d5c, 1);
    gfx.strokeRect(x, GROUND_Y - PLOT_BASE_HEIGHT, PLOT_WIDTH, PLOT_BASE_HEIGHT);
    container.add(gfx);
  }

  // ── UI panel columns ───────────────────────────────────────────────────────

  private renderUISection(index: number): Phaser.GameObjects.Container {
    this.uiContainers[index]?.destroy();

    const container = this.add.container(0, 0);
    const cx = index * SECTION_W + SECTION_W / 2;
    const plot = this.plotStates[index];

    // Building label
    container.add(
      this.add
        .text(cx, COL_TOP + 20, `Building ${index + 1}`, { fontSize: '14px', color: '#8899aa' })
        .setOrigin(0.5)
    );

    if (plot.unlocked) {
      this.buildUpgradeSection(container, cx, plot, index);
    } else {
      this.buildUnlockSection(container, cx, index);
    }

    return container;
  }

  private buildUpgradeSection(
    container: Phaser.GameObjects.Container,
    cx: number,
    plot: PlotState,
    index: number
  ): void {
    const atMax = plot.level >= MAX_LEVEL;

    container.add(
      this.add
        .text(cx, COL_TOP + 54, `Level ${plot.level} / ${MAX_LEVEL}`, {
          fontSize: '13px',
          color: '#ddeeff',
        })
        .setOrigin(0.5)
    );

    const btnColor = atMax ? 0x2a2a3a : 0x1a5276;
    const btn = this.add
      .rectangle(cx, COL_TOP + 92, 120, 30, btnColor)
      .setInteractive({ useHandCursor: !atMax });
    container.add(btn);

    container.add(
      this.add
        .text(cx, COL_TOP + 92, atMax ? 'Max Level' : '▲ Upgrade', {
          fontSize: '13px',
          color: atMax ? '#555566' : '#cce8ff',
        })
        .setOrigin(0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x2471a3));
      btn.on('pointerout', () => btn.setFillStyle(0x1a5276));
      btn.on('pointerdown', () => {
        this.plotStates[index].level = Math.min(plot.level + 1, MAX_LEVEL);
        this.plotContainers[index] = this.renderPlot(index);
        this.uiContainers[index] = this.renderUISection(index);
        this.updateStats();
      });
    }
  }

  private buildUnlockSection(
    container: Phaser.GameObjects.Container,
    cx: number,
    index: number
  ): void {
    container.add(
      this.add
        .text(cx, COL_TOP + 54, '🔒  Locked', { fontSize: '13px', color: '#555566' })
        .setOrigin(0.5)
    );

    const btn = this.add
      .rectangle(cx, COL_TOP + 92, 120, 30, 0x2d6b1a)
      .setInteractive({ useHandCursor: true });
    container.add(btn);

    container.add(
      this.add
        .text(cx, COL_TOP + 92, 'Unlock', { fontSize: '13px', color: '#e8ffe8' })
        .setOrigin(0.5)
    );

    btn.on('pointerover', () => btn.setFillStyle(0x3d8a22));
    btn.on('pointerout', () => btn.setFillStyle(0x2d6b1a));
    btn.on('pointerdown', () => {
      this.plotStates[index].unlocked = true;
      this.plotStates[index].level = 1;
      this.plotContainers[index] = this.renderPlot(index);
      this.uiContainers[index] = this.renderUISection(index);
      this.updateStats();
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a number as a compact $ string. */
function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.floor(n)}`;
}
