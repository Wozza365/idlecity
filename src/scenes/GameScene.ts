import Phaser from 'phaser';
import { type GameState, type PlotState, clearSave, defaultState, loadGame, saveGame } from '../game/GameState';
import {
  PLOT_COUNT, MAX_LEVEL, UI_HEIGHT, STATS_BAR_H, ROAD_H, VERGE_H, RIVER_H,
  UNLOCK_COSTS,
  upgradeCost, perBuildingIncome, fmt,
} from '../constants';
import { createBuilding, EmptyPlot } from '../buildings';
import { Sky } from '../objects/Sky';
import { SunMoon } from '../objects/SunMoon';
import { Road } from '../objects/Road';
import { VergeRiver } from '../objects/VergeRiver';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  activeColor: number;
}

// ── Scene ──────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private state: GameState = loadGame(PLOT_COUNT);

  private plotContainers: Phaser.GameObjects.Container[] = [];
  private uiContainers: Phaser.GameObjects.Container[] = [];
  private actionRefs: (ActionRef | null)[] = new Array(PLOT_COUNT + 1).fill(null);

  // Persistent graphics layer — depth-ordered, never destroyed
  private panelChromeGfx!: Phaser.GameObjects.Graphics;

  private roadUiContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private taxRateText!: Phaser.GameObjects.Text;
  private saveNotification!: Phaser.GameObjects.Text;

  // World-layer managers
  private sky!: Sky;
  private sunMoon!: SunMoon;
  private road!: Road;
  private vergeRiver!: VergeRiver;

  // Panel background — destroyed and recreated on resize
  private panelBg!: Phaser.GameObjects.Rectangle;

  // Dev panel
  private devPanelContainer!: Phaser.GameObjects.Container;
  private clockText?: Phaser.GameObjects.Text;

  // Single master clock — all day/night visuals derive from this + timeOffsetMs
  private masterClock!: Phaser.Tweens.Tween;
  private timeOffsetMs: number = 0;

  private sunAngle: number = Math.PI / 2;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Dynamic layout getters ─────────────────────────────────────────────────

  private get plotWidth(): number { return this.scale.width / PLOT_COUNT; }
  private get groundY(): number { return this.scale.height - UI_HEIGHT - ROAD_H - VERGE_H - RIVER_H; }
  private get panelTop(): number { return this.scale.height - UI_HEIGHT; }
  private get colTop(): number { return this.panelTop + STATS_BAR_H; }
  private get sectionW(): number { return this.scale.width / PLOT_COUNT; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this.lights.enable();
    this.lights.setAmbientColor(0x888888);

    this.panelChromeGfx = this.add.graphics().setDepth(10);

    // World-layer managers — each owns its own graphics/objects
    this.sky        = new Sky(this);
    this.road       = new Road(this);
    this.vergeRiver = new VergeRiver(this);
    this.sunMoon    = new SunMoon(this, this.groundY);

    // Build all layout-dependent visuals
    this.buildLayout();

    const { width } = this.scale;

    // Save notification
    this.saveNotification = this.add
      .text(width - 12, 12, '✓ Saved', {
        fontSize: '13px',
        color: '#88ffaa',
        backgroundColor: '#162416',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setAlpha(0)
      .setDepth(100);

    // Resize listener
    this.scale.on('resize', this.onResize, this);

    // Tax tick — every 100 ms
    this.time.addEvent({ delay: 100, loop: true, callback: this.onTaxTick, callbackScope: this });

    // Autosave — every 10 s
    this.time.addEvent({ delay: 10_000, loop: true, callback: this.onAutosave, callbackScope: this });

    // Master clock: 0→240_000 ms, linear, loops forever
    this.masterClock = this.tweens.addCounter({
      from: 0,
      to: 240_000,
      duration: 240_000,
      repeat: -1,
      ease: 'Linear',
      onUpdate: () => this.onClockTick(),
    });
  }

  // ── Layout build / rebuild ─────────────────────────────────────────────────

  private buildLayout(): void {
    const { width, height } = this.scale;

    this.sky.rebuild();

    this.panelBg?.destroy();
    this.panelBg = this.add
      .rectangle(width / 2, (this.panelTop + height) / 2, width, height - this.panelTop, 0x1e2433)
      .setDepth(1);

    this.road.render(this.state.road.level, width, this.groundY);
    this.vergeRiver.render(width, this.groundY);

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.drawPanelChrome();

    this.goldText?.destroy();
    this.taxRateText?.destroy();
    this.drawStatsBar();

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.uiContainers[i] = this.renderUISection(i);
    }

    this.roadUiContainer = this.renderRoadUI();
    this.buildDevPanel();

    this.refreshButtons();
    this.updateStats();
    this.sky.updateGradient(Math.sin(this.sunAngle), width, this.groundY);
    this.sunMoon.update(this.sunAngle, width, this.groundY, this.panelTop, this.state.plots, this.plotWidth);
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  private onResize(): void {
    const { width, height } = this.scale;

    this.sky.resize(width, height);
    this.sunMoon.resize(width);
    this.saveNotification?.setPosition(width - 12, 12);

    this.buildLayout();
  }

  // ── Dev panel ──────────────────────────────────────────────────────────────

  private buildDevPanel(): void {
    this.devPanelContainer?.destroy();
    const { width } = this.scale;
    const container = this.add.container(0, 0).setDepth(90);

    const row1Y  = 16;
    const row2Y  = 42;
    container.add(this.add.rectangle(width / 2, 29, width, 58, 0x000000, 0.6));

    const btnW   = 120;
    const gap    = 8;
    const leftX  = (width - btnW * 2 - gap) / 2 + btnW / 2;
    const rightX = leftX + btnW + gap;

    const btn1 = this.add
      .rectangle(leftX, row1Y, btnW, 26, 0x1a4400)
      .setInteractive({ useHandCursor: true });
    container.add(btn1);
    container.add(
      this.add.text(leftX, row1Y, '+$100K', { fontSize: '13px', color: '#88ff88' }).setOrigin(0.5)
    );
    btn1.on('pointerover', () => btn1.setFillStyle(0x285e00));
    btn1.on('pointerout',  () => btn1.setFillStyle(0x1a4400));
    btn1.on('pointerdown', () => {
      this.state.gold += 100_000;
      this.updateStats();
      this.refreshButtons();
    });

    const btn2 = this.add
      .rectangle(rightX, row1Y, btnW, 26, 0x001444)
      .setInteractive({ useHandCursor: true });
    container.add(btn2);
    container.add(
      this.add.text(rightX, row1Y, '+1 hr', { fontSize: '13px', color: '#88aaff' }).setOrigin(0.5)
    );
    btn2.on('pointerover', () => btn2.setFillStyle(0x001e5e));
    btn2.on('pointerout',  () => btn2.setFillStyle(0x001444));
    btn2.on('pointerdown', () => this.advanceTime());

    // Row 2: clock (left) + reset (right)
    this.clockText = this.add
      .text(width / 2 - 70, row2Y, this.gameTimeString(), {
        fontSize: '13px', color: '#aaccff', fontFamily: 'monospace',
      })
      .setOrigin(0.5);
    container.add(this.clockText);

    const resetBtn = this.add
      .rectangle(width / 2 + 60, row2Y, 110, 22, 0x440000)
      .setInteractive({ useHandCursor: true });
    container.add(resetBtn);
    container.add(
      this.add.text(width / 2 + 60, row2Y, 'Reset All', { fontSize: '12px', color: '#ff8888' }).setOrigin(0.5)
    );
    resetBtn.on('pointerover', () => resetBtn.setFillStyle(0x661111));
    resetBtn.on('pointerout',  () => resetBtn.setFillStyle(0x440000));
    resetBtn.on('pointerdown', () => this.resetGame());

    this.devPanelContainer = container;
  }

  private gameTimeString(): string {
    const elapsed   = ((this.masterClock?.getValue() ?? 0) + this.timeOffsetMs) % 240_000;
    const totalMins = (elapsed / 240_000) * 24 * 60;
    const hour = Math.floor(12 + totalMins / 60) % 24;
    const min  = Math.floor(totalMins) % 60;
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  private resetGame(): void {
    clearSave();
    this.state = defaultState(PLOT_COUNT);
    this.buildLayout();
  }

  private onClockTick(): void {
    if (!this.masterClock) return;
    const elapsed = ((this.masterClock.getValue() ?? 0) + this.timeOffsetMs) % 240_000;

    this.sunAngle = Math.PI / 2 + (elapsed / 240_000) * Math.PI * 2;

    const elev = Math.sin(this.sunAngle);
    this.sky.updateGradient(elev, this.scale.width, this.groundY);
    this.sky.updateOverlay(elev);
    this.sunMoon.update(this.sunAngle, this.scale.width, this.groundY, this.panelTop, this.state.plots, this.plotWidth);
    this.clockText?.setText(this.gameTimeString());
  }

  private advanceTime(): void {
    this.timeOffsetMs = (this.timeOffsetMs + 240_000 / 24) % 240_000;
  }

  // ── Tax system ─────────────────────────────────────────────────────────────

  private get taxRate(): number {
    const plots = this.state.plots;
    let total = 0;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      if (!plot.unlocked) continue;
      const base = perBuildingIncome(plot.level);
      const neighbours =
        (i > 0 && plots[i - 1].unlocked ? 1 : 0) +
        (i < plots.length - 1 && plots[i + 1].unlocked ? 1 : 0);
      total += Math.floor(base * (1 + neighbours * 0.15));
    }
    return total;
  }

  private onTaxTick(): void {
    this.state.gold += this.taxRate / 10;
    this.updateStats();
    this.refreshButtons();
  }

  private updateStats(): void {
    this.goldText.setText(`Balance: ${fmt(this.state.gold)}`);
    this.taxRateText.setText(`Income: ${fmt(this.taxRate)}/s`);
  }

  // ── Save & notification ────────────────────────────────────────────────────

  private onAutosave(): void {
    saveGame(this.state);
    this.showSaveNotification();
  }

  private showSaveNotification(): void {
    this.tweens.killTweensOf(this.saveNotification);
    this.saveNotification.setAlpha(1);
    this.tweens.add({
      targets: this.saveNotification,
      alpha: 0,
      delay: 1_500,
      duration: 600,
      ease: 'Power1',
    });
  }

  // ── Button affordability ───────────────────────────────────────────────────

  private refreshButtons(): void {
    for (const ref of this.actionRefs) {
      if (!ref) continue;
      const canAfford = this.state.gold >= ref.getCost();
      if (canAfford) {
        ref.btn.setInteractive({ useHandCursor: true });
        ref.btn.setFillStyle(ref.activeColor);
      } else {
        ref.btn.disableInteractive();
        ref.btn.setFillStyle(0x252535);
      }
    }
  }

  // ── Layout helpers ─────────────────────────────────────────────────────────

  private plotLeft(index: number): number {
    return index * this.plotWidth;
  }

  // ── Panel chrome & stats bar ───────────────────────────────────────────────

  private drawPanelChrome(): void {
    const { width, height } = this.scale;
    const gfx = this.panelChromeGfx;
    gfx.clear();
    gfx.lineStyle(1, 0x3a4a5a, 1);
    gfx.moveTo(0, this.panelTop).lineTo(width, this.panelTop).strokePath();
    gfx.moveTo(0, this.colTop).lineTo(width, this.colTop).strokePath();
    for (let i = 1; i < PLOT_COUNT; i++) {
      const x = i * this.sectionW;
      gfx.moveTo(x, this.colTop).lineTo(x, height).strokePath();
    }
  }

  private drawStatsBar(): void {
    const { width } = this.scale;
    const midY = this.panelTop + STATS_BAR_H / 2;
    this.taxRateText = this.add
      .text(8, midY, '', { fontSize: '15px', color: '#88ccff' })
      .setOrigin(0, 0.5)
      .setDepth(11);
    this.goldText = this.add
      .text(width - 8, midY, '', { fontSize: '15px', color: '#ffd966' })
      .setOrigin(1, 0.5)
      .setDepth(11);
  }

  // ── Plot rendering ─────────────────────────────────────────────────────────

  private renderPlot(index: number): Phaser.GameObjects.Container {
    this.plotContainers[index]?.destroy();
    const x    = this.plotLeft(index);
    const plot = this.state.plots[index];

    const building = plot.unlocked
      ? createBuilding(this, x, this.plotWidth, this.groundY, plot.level)
      : new EmptyPlot(this, x, this.plotWidth, this.groundY);

    building.setDepth(9);
    this.add.existing(building);
    return building;
  }

  // ── UI panel columns ───────────────────────────────────────────────────────

  private renderUISection(index: number): Phaser.GameObjects.Container {
    this.uiContainers[index]?.destroy();
    this.actionRefs[index] = null;

    const container = this.add.container(0, 0).setDepth(11);
    const cx        = index * this.sectionW + this.sectionW / 2;
    const plot      = this.state.plots[index];

    container.add(
      this.add
        .text(cx, this.colTop + 16, `Bldg ${index + 1}`, { fontSize: '13px', color: '#8899aa' })
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
    const cost  = upgradeCost(plot.level);

    container.add(
      this.add
        .text(cx, this.colTop + 40, `Lv ${plot.level}/${MAX_LEVEL}`, {
          fontSize: '14px', color: '#ddeeff',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, this.colTop + 62, `${fmt(perBuildingIncome(plot.level))}/s`, {
          fontSize: '12px', color: '#88ddaa',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, this.colTop + 82, atMax ? '' : `${fmt(cost)}`, {
          fontSize: '12px', color: '#99aabb',
        })
        .setOrigin(0.5)
    );

    const btn = this.add
      .rectangle(cx, this.colTop + 118, 82, 44, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(cx, this.colTop + 118, atMax ? 'Max' : '▲ Upgrade', {
          fontSize: '12px', color: atMax ? '#555566' : '#cce8ff',
        })
        .setOrigin(0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x2471a3));
      btn.on('pointerout',  () => btn.setFillStyle(0x1a5276));
      btn.on('pointerdown', (): void => {
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.plots[index].level = Math.min(plot.level + 1, MAX_LEVEL);
        this.plotContainers[index] = this.renderPlot(index);
        this.uiContainers[index]   = this.renderUISection(index);
        this.updateStats();
        this.refreshButtons();
      });
      this.actionRefs[index] = { btn, getCost: (): number => cost, activeColor: 0x1a5276 };
    }
  }

  private buildUnlockSection(
    container: Phaser.GameObjects.Container,
    cx: number,
    index: number
  ): void {
    const cost = UNLOCK_COSTS[index];

    container.add(
      this.add
        .text(cx, this.colTop + 40, '🔒', { fontSize: '18px', color: '#555566' })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, this.colTop + 68, `${fmt(cost)}`, { fontSize: '12px', color: '#99aabb' })
        .setOrigin(0.5)
    );

    const btn = this.add
      .rectangle(cx, this.colTop + 110, 82, 44, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(cx, this.colTop + 110, 'Unlock', { fontSize: '13px', color: '#e8ffe8' })
        .setOrigin(0.5)
    );

    btn.on('pointerover', () => btn.setFillStyle(0x3d8a22));
    btn.on('pointerout',  () => btn.setFillStyle(0x2d6b1a));
    btn.on('pointerdown', (): void => {
      if (this.state.gold < cost) return;
      this.state.gold -= cost;
      this.state.plots[index].unlocked = true;
      this.state.plots[index].level    = 1;
      this.plotContainers[index] = this.renderPlot(index);
      this.uiContainers[index]   = this.renderUISection(index);
      this.updateStats();
      this.refreshButtons();
    });

    this.actionRefs[index] = { btn, getCost: (): number => cost, activeColor: 0x2d6b1a };
  }

  // ── Road UI ────────────────────────────────────────────────────────────────

  private roadUpgradeCost(): number {
    const lvl = this.state.road.level;
    return lvl === 0 ? 200 : lvl * lvl * 50;
  }

  private roadTierName(): string {
    const lvl = this.state.road.level;
    if (lvl === 0)  return 'None';
    if (lvl <= 2)   return 'Dirt Track';
    if (lvl <= 4)   return 'Gravel';
    if (lvl <= 6)   return 'Paved';
    if (lvl <= 8)   return 'Two-Lane';
    return 'Highway';
  }

  private renderRoadUI(): Phaser.GameObjects.Container {
    this.roadUiContainer?.destroy();
    this.actionRefs[PLOT_COUNT] = null;

    const container = this.add.container(0, 0).setDepth(11);
    const { width } = this.scale;
    const midY      = this.panelTop + STATS_BAR_H / 2;
    const atMax     = this.state.road.level >= 10;
    const cost      = this.roadUpgradeCost();

    container.add(
      this.add
        .text(width / 2, midY - 13, `Road: ${this.roadTierName()}`, {
          fontSize: '12px', color: '#aabbcc',
        })
        .setOrigin(0.5, 0.5)
    );

    const btn = this.add
      .rectangle(width / 2, midY + 12, 130, 26, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(
          width / 2, midY + 12,
          atMax ? 'Road: Max' : `▲ Lv ${this.state.road.level + 1}  ${fmt(cost)}`,
          { fontSize: '11px', color: atMax ? '#555566' : '#cce8ff' }
        )
        .setOrigin(0.5, 0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x7a5500));
      btn.on('pointerout',  () => btn.setFillStyle(0x5a3e00));
      btn.on('pointerdown', (): void => {
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.road.level = Math.min(this.state.road.level + 1, 10);
        this.road.render(this.state.road.level, this.scale.width, this.groundY);
        this.roadUiContainer = this.renderRoadUI();
        this.updateStats();
        this.refreshButtons();
      });
      this.actionRefs[PLOT_COUNT] = { btn, getCost: (): number => cost, activeColor: 0x5a3e00 };
    }

    return container;
  }
}
