import Phaser from 'phaser';
import { type GameState, clearSave, defaultState, loadGame, saveGame } from '../game/GameState';
import {
  PLOT_COUNT, MAX_LEVEL, UI_HEIGHT, STATS_BAR_H, ROAD_BAR_H, ROAD_H, VERGE_H, RIVER_H,
  UNLOCK_COSTS,
  upgradeCost, perBuildingIncome,
} from '../constants';
import { createBuilding, EmptyPlot } from '../buildings';
import { Sky } from '../objects/Sky';
import { SunMoon } from '../objects/SunMoon';
import { Stars } from '../objects/Stars';
import { Road } from '../objects/Road';
import { VergeRiver } from '../objects/VergeRiver';
import { StatsBar } from '../ui/StatsBar';
import { PanelChrome } from '../ui/PanelChrome';
import { PlotUI } from '../ui/PlotUI';
import { RoadUI } from '../ui/RoadUI';
import { DevPanel } from '../ui/DevPanel';
import { DirectionalLightTest } from '../objects/DirectionalLightTest';

interface WindowLightable { updateWindowLights(elevation: number): void; }
const isWindowLightable = (o: unknown): o is WindowLightable =>
  typeof (o as WindowLightable).updateWindowLights === 'function';

// ── Scene ──────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private state: GameState = loadGame(PLOT_COUNT);

  private plotContainers: Phaser.GameObjects.Container[] = [];
  private plotUIs: PlotUI[] = [];

  // UI managers
  private panelChrome!: PanelChrome;

  private statsBar!: StatsBar;
  private roadUI!: RoadUI;
  private devPanel!: DevPanel;
  private saveNotification!: Phaser.GameObjects.Text;

  // World-layer managers
  private sky!: Sky;
  private sunMoon!: SunMoon;
  private stars!: Stars;
  private road!: Road;
  private vergeRiver!: VergeRiver;

  // Panel background — destroyed and recreated on resize
  private panelBg!: Phaser.GameObjects.Rectangle;

  private dirLightTest: DirectionalLightTest | null = null;

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
  private get colTop(): number { return this.panelTop + STATS_BAR_H + ROAD_BAR_H; }
  private get sectionW(): number { return this.scale.width / PLOT_COUNT; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this.lights.enable();
    this.lights.setAmbientColor(0x888888);

    this.panelChrome = new PanelChrome(this);

    // World-layer managers — each owns its own graphics/objects
    this.sky        = new Sky(this);
    this.road       = new Road(this);
    this.vergeRiver = new VergeRiver(this);
    this.sunMoon    = new SunMoon(this, this.groundY);
    this.stars      = new Stars(this, this.groundY);

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
      .setDepth(1)
      .setLighting(false);

    this.road.render(this.state.road.level, width, this.groundY);
    this.vergeRiver.render(width, this.groundY);

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.dirLightTest?.destroy(this);
    this.dirLightTest = new DirectionalLightTest(this, width, this.groundY);

    this.panelChrome.draw(width, height, this.panelTop, this.colTop, this.sectionW);

    this.statsBar?.destroy();
    this.statsBar = new StatsBar(this, this.panelTop, width);

    const nextUnlock = this.state.plots.findIndex(p => !p.unlocked);
    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotUIs[i]?.destroy();
      this.plotUIs[i] = new PlotUI(
        this,
        i,
        this.state.plots[i],
        this.sectionW,
        this.colTop,
        () => this.onPlotUpgrade(i),
        () => this.onPlotUnlock(i),
        i === nextUnlock,
      );
      this.add.existing(this.plotUIs[i].container);
    }

    this.roadUI?.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.panelTop + STATS_BAR_H,
      width,
      () => this.onRoadUpgrade()
    );
    this.add.existing(this.roadUI.container);

    this.devPanel?.destroy();
    this.devPanel = new DevPanel(
      this,
      width,
      () => this.onAddGold(),
      () => this.advanceTime(),
      () => this.resetGame()
    );
    this.add.existing(this.devPanel.container);

    this.refreshButtons();
    this.statsBar.update(this.state.gold, this.taxRate);
    this.sky.updateGradient(Math.sin(this.sunAngle), width, this.groundY);
    this.sunMoon.update(this.sunAngle, width, this.groundY, this.panelTop, this.state.plots, this.plotWidth);
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  private onResize(): void {
    const { width, height } = this.scale;

    this.sky.resize(width, height);
    this.sunMoon.resize(width);
    this.stars.resize();
    this.saveNotification?.setPosition(width - 12, 12);

    this.buildLayout();
  }

  // ── UI callbacks ───────────────────────────────────────────────────────────

  private onPlotUpgrade(index: number): void {
    const plot = this.state.plots[index];
    const cost = upgradeCost(plot.level);
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    plot.level = Math.min(plot.level + 1, MAX_LEVEL);
    this.plotContainers[index] = this.renderPlot(index);
    this.plotUIs[index].destroy();
    this.plotUIs[index] = new PlotUI(
      this,
      index,
      plot,
      this.sectionW,
      this.colTop,
      () => this.onPlotUpgrade(index),
      () => this.onPlotUnlock(index),
      false,
    );
    this.add.existing(this.plotUIs[index].container);
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
  }

  private onPlotUnlock(index: number): void {
    const cost = UNLOCK_COSTS[index];
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    this.state.plots[index].unlocked = true;
    this.state.plots[index].level = 1;
    this.plotContainers[index] = this.renderPlot(index);
    const nextUnlock = this.state.plots.findIndex(p => !p.unlocked);
    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotUIs[i].destroy();
      this.plotUIs[i] = new PlotUI(
        this,
        i,
        this.state.plots[i],
        this.sectionW,
        this.colTop,
        () => this.onPlotUpgrade(i),
        () => this.onPlotUnlock(i),
        i === nextUnlock,
      );
      this.add.existing(this.plotUIs[i].container);
    }
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
  }

  private onRoadUpgrade(): void {
    const cost = this.state.road.level === 0 ? 200 : this.state.road.level * this.state.road.level * 50;
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    this.state.road.level = Math.min(this.state.road.level + 1, 10);
    this.road.render(this.state.road.level, this.scale.width, this.groundY);
    this.roadUI.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.panelTop + STATS_BAR_H,
      this.scale.width,
      () => this.onRoadUpgrade()
    );
    this.add.existing(this.roadUI.container);
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
  }

  private onAddGold(): void {
    this.state.gold += 1_000_000_000;
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
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

    // Piecewise angle: sun rises at 4am (elapsed=160k), peaks at noon (0), sets at 8pm (80k).
    // Day (160k ms) moves at half speed of night (80k ms) so day lasts 16 game-hours.
    const SUNSET   = 100_000;  // elapsed at 10pm
    const SUNRISE  = 160_000;  // elapsed at 4am
    if (elapsed < SUNSET) {
      // Noon→8pm: sunAngle π/2 → π
      this.sunAngle = Math.PI / 2 + (elapsed / SUNSET) * (Math.PI / 2);
    } else if (elapsed < SUNRISE) {
      // 8pm→4am (night): sunAngle π → 2π (fast)
      this.sunAngle = Math.PI + ((elapsed - SUNSET) / (SUNRISE - SUNSET)) * Math.PI;
    } else {
      // 4am→noon: sunAngle 2π → 5π/2
      this.sunAngle = 2 * Math.PI + ((elapsed - SUNRISE) / (240_000 - SUNRISE)) * (Math.PI / 2);
    }

    const elev = Math.sin(this.sunAngle);
    this.sky.updateGradient(elev, this.scale.width, this.groundY);
    this.sky.updateOverlay(elev);
    this.sunMoon.update(this.sunAngle, this.scale.width, this.groundY, this.panelTop, this.state.plots, this.plotWidth);
    this.stars.update(elev, this.sunAngle, this.scale.width);
    for (const c of this.plotContainers) {
      if (isWindowLightable(c)) c.updateWindowLights(elev);
    }
    this.devPanel?.updateClock(this.gameTimeString());
    this.dirLightTest?.update();
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
      total += base * (1 + neighbours * 0.15);
    }
    return total;
  }

  private onTaxTick(): void {
    this.state.gold += this.taxRate / 10;
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
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
    for (const ui of this.plotUIs) {
      ui?.refresh(this.state.gold);
    }
    this.roadUI?.refresh(this.state.gold);
  }

  // ── Layout helpers ─────────────────────────────────────────────────────────

  private plotLeft(index: number): number {
    return index * this.plotWidth;
  }

  // ── Plot rendering ─────────────────────────────────────────────────────────

  private renderPlot(index: number): Phaser.GameObjects.Container {
    const oldBuilding = this.plotContainers[index];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedParticles: object[] = (oldBuilding as any)?.getSmokeParticles?.() ?? [];
    oldBuilding?.destroy();
    const x    = this.plotLeft(index);
    const plot = this.state.plots[index];

    const building = plot.unlocked
      ? createBuilding(this, x, this.plotWidth, this.groundY, plot.level, savedParticles)
      : new EmptyPlot(this, x, this.plotWidth, this.groundY);

    building.setDepth(9);
    this.add.existing(building);
    return building;
  }
}
