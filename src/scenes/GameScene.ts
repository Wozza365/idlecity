import Phaser from 'phaser';
import { type GameState, clearSave, defaultState, loadGame, saveGame } from '../game/GameState';
import {
  PLOT_COUNT, MAX_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, UI_HEIGHT, STATS_BAR_H, ROAD_BAR_H,
  ROAD_H, VERGE_H, WATER_H, YARD_H,
  UNLOCK_COSTS,
  upgradeCost, perBuildingIncome, vergeUpgradeCost, waterUpgradeCost,
  roadUpgradeCost, roadIncome, vergeIncome, waterIncome,
  buildingHeight, fmt, MONO_FONT,
} from '../constants';
import { spawnFloatingText } from '../ui/FloatingText';
import { createBuilding, EmptyPlot } from '../buildings';
import { hasShadowOverlay, hasSmokeUpdate, hasFlagUpdate } from '../buildings/types';
import { Sky } from '../objects/Sky';
import { SunMoon } from '../objects/SunMoon';
import { Stars } from '../objects/Stars';
import { Road } from '../objects/Road';
import { VergeRiver } from '../objects/VergeRiver';
import { StatsBar } from '../ui/StatsBar';
import { PanelChrome } from '../ui/PanelChrome';
import { PlotUI } from '../ui/PlotUI';
import { RoadUI } from '../ui/RoadUI';
import { DevPanel, DEV_PANEL_H, DEV_PANEL_OFFSET } from '../ui/DevPanel';
import { LightingSystem, type LightSource } from '../lighting/LightingSystem';
import { CarManager } from '../objects/CarManager';
import { PedestrianManager } from '../objects/PedestrianManager';
import { WaterArea } from '../objects/WaterArea';
import { BoatManager } from '../objects/BoatManager';
import { ALL_CAR_KEYS, getCarUrl } from '../objects/CarAssets';
import { loadHtAssets } from '../objects/HighTidesAssets';
import { Clouds } from '../objects/Clouds';
import { Rain } from '../objects/Rain';
import { Snow } from '../objects/Snow';
import { SeasonSystem } from '../game/SeasonSystem';
import { Balloon } from '../objects/Balloon';
import { BirdFlock } from '../objects/BirdFlock';

interface WindowLightable { updateWindowLights(elevation: number, time?: number, gameHour?: number): void; }
const isWindowLightable = (o: unknown): o is WindowLightable =>
  o != null && typeof (o as WindowLightable).updateWindowLights === 'function';

interface HasExtraLights { extraLights: LightSource[]; }
const hasExtraLights = (o: unknown): o is HasExtraLights =>
  o != null && Array.isArray((o as HasExtraLights).extraLights);

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

  private clouds!: Clouds;
  private rain!: Rain;
  private snow!: Snow;
  private lightingSystem: LightingSystem | null = null;
  private carManager: CarManager | null = null;
  private pedestrianManager: PedestrianManager | null = null;
  private waterArea: WaterArea | null = null;
  private boatManager: BoatManager | null = null;

  // Single master clock — all day/night visuals derive from this + timeOffsetMs
  private masterClock!: Phaser.Tweens.Tween;
  private timeOffsetMs: number = 0;

  private sunAngle: number = Math.PI / 2;
  private lastWindowElev: number = 2; // out-of-range → forces first update
  private gameHour = 12;
  private _floatTickCount = 0;
  private _lastTaxTimestamp = 0;
  seasons!: SeasonSystem;

  // ── Airplane ──────────────────────────────────────────────────────────────
  private planeGfx!: Phaser.GameObjects.Graphics;
  private plane: { x: number; y: number; vx: number; blinkTimer: number; blinkOn: boolean } | null = null;
  private planeIdleTimer = 70_000 + Math.random() * 50_000;

  // ── Hot air balloon & birds ───────────────────────────────────────────────
  private balloon!: Balloon;
  private birdFlock!: BirdFlock;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Dynamic layout getters ─────────────────────────────────────────────────

  private get plotWidth(): number { return this.scale.width / PLOT_COUNT; }
  private get groundY(): number { return this.scale.height - UI_HEIGHT - ROAD_H - VERGE_H - WATER_H; }
  private get panelTop(): number { return this.scale.height - UI_HEIGHT; }
  private get colTop(): number { return this.panelTop + STATS_BAR_H + ROAD_BAR_H; }
  private get sectionW(): number { return this.scale.width / PLOT_COUNT; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  preload(): void {
    for (const key of ALL_CAR_KEYS) {
      const url = getCarUrl(key);
      if (url) this.load.image(key, url);
    }
    loadHtAssets(this);
  }

  create(): void {
    this.lights.enable();
    this.lights.setAmbientColor(0x888888);

    this.seasons = new SeasonSystem(this.state.season);
    this.rain    = new Rain(this);
    this.snow    = new Snow(this);
    this.planeGfx  = this.add.graphics().setDepth(1.5);
    this.balloon   = new Balloon(this);
    this.birdFlock = new BirdFlock(this);

    this.panelChrome = new PanelChrome(this);

    // World-layer managers — each owns its own graphics/objects
    this.clouds     = new Clouds(this);
    this.sky        = new Sky(this);
    this.road       = new Road(this);
    this.vergeRiver = new VergeRiver(this);
    this.waterArea  = new WaterArea(this);
    this.boatManager = new BoatManager(this);
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

    // Tax tick — every 250 ms; use real timestamps so background throttling doesn't slow income
    this._lastTaxTimestamp = Date.now();
    this.time.addEvent({ delay: 250, loop: true, callback: this.onTaxTick, callbackScope: this });

    // Catch up when a throttled/paused background tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') this.onTaxTick(); };
    document.addEventListener('visibilitychange', onVisible);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onVisible));

    // Autosave — every 10 s
    this.time.addEvent({ delay: 10_000, loop: true, callback: this.onAutosave, callbackScope: this });

    // Particle dot texture for tier celebrations
    const dotG = this.add.graphics();
    dotG.fillStyle(0xffffff, 1);
    dotG.fillCircle(4, 4, 4);
    dotG.generateTexture('__particle', 8, 8);
    dotG.destroy();

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

  update(_time: number, delta: number): void {
    this.seasons.update(delta);
    this.clouds.update(delta, Math.sin(this.sunAngle), this.seasons.summerWeight, this.seasons.weatherIntensity);
    this.vergeRiver.updateSeasonalColors(this.seasons.autumnWeight, this.seasons.winterWeight, this.seasons.springWeight);
    const rainIntensity = this.seasons.weatherType === 'rain' ? this.seasons.weatherIntensity : 0;
    const snowIntensity = this.seasons.weatherType === 'snow' ? this.seasons.weatherIntensity : 0;
    this.rain.update(delta, rainIntensity);
    this.snow.update(delta, snowIntensity);
    this.road.updateWeather(rainIntensity + snowIntensity * 0.3);
    const elapsed   = ((this.masterClock?.getValue() ?? 0) + this.timeOffsetMs) % 240_000;
    const gameHour  = Math.floor((elapsed / 240_000) * 24 + 12) % 24;
    this.gameHour = gameHour;
    if (this.pedestrianManager) {
      this.pedestrianManager.weatherIntensity = this.seasons.weatherIntensity;
      this.pedestrianManager.gameHour         = gameHour;
    }
    this.carManager?.applyGameHour(gameHour);
    this.carManager?.update(delta);
    this.carManager?.updateShadow(this.sunAngle);
    this.pedestrianManager?.update(delta, this.state.plots, this.plotContainers, this.sunAngle);
    this.vergeRiver.updateCyclists(delta);
    this.vergeRiver.updateShadows(this.sunAngle);
    const elevation = Math.sin(this.sunAngle);
    this.waterArea?.update(delta, elevation, this.sky.horizonColor);
    this.waterArea?.updateShadows(this.sunAngle);
    this.boatManager?.update(delta, elevation);
    this.stars.update(delta, elevation, this.sunAngle, this.scale.width);
    this.updateAirplane(delta);
    this.balloon?.update(delta, elevation);
    this.birdFlock?.update(delta, elevation);
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    for (const c of this.plotContainers) {
      if (hasSmokeUpdate(c)) c.updateSmoke(t);
      if (hasFlagUpdate(c)) c.updateFlag();
    }
  }

  // ── Layout build / rebuild ─────────────────────────────────────────────────

  private buildLayout(): void {
    const { width, height } = this.scale;

    this.sky.rebuild();
    this.clouds.rebuild(width, this.groundY);
    this.rain?.rebuild(width, height);
    this.snow?.rebuild(width, height);
    this.balloon?.rebuild(width, this.groundY);
    this.birdFlock?.rebuild(width, this.groundY);

    this.panelBg?.destroy();
    this.panelBg = this.add
      .rectangle(width / 2, (this.panelTop + height) / 2, width, height - this.panelTop, 0x1e2433)
      .setDepth(1)
      .setLighting(false);

    this.road.render(this.state.road.level, width, this.groundY);
    this.vergeRiver.render(this.state.verge.level, width, this.groundY);
    this.waterArea!.render(this.state.water.level, width, this.groundY);

    this.lightingSystem?.destroy();
    this.lightingSystem = new LightingSystem(this, this.groundY, DEV_PANEL_OFFSET + DEV_PANEL_H);

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.carManager?.destroy();
    this.carManager = new CarManager(this);
    this.carManager.rebuild(this.state.road.level, this.groundY);
    this.carManager.attachLights(this.lightingSystem);
    for (const l of this.vergeRiver.extraLights) this.lightingSystem.addLight(l);
    for (const l of this.waterArea!.extraLights)  this.lightingSystem.addLight(l);
    this.lightingSystem.setTreeOccluders(this.vergeRiver.getTreeOccluders());

    this.boatManager!.rebuild(this.state.water.level, this.groundY);
    this.boatManager!.setDockSlots(this.waterArea!.getDockSlots());
    this.boatManager!.attachLights(this.lightingSystem);

    this.pedestrianManager?.destroy();
    this.pedestrianManager = new PedestrianManager(this, this.groundY, this.plotWidth);

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
      this.state.verge,
      this.state.water,
      this.panelTop + STATS_BAR_H,
      width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);

    this.devPanel?.destroy();
    this.devPanel = new DevPanel(
      this,
      width,
      () => this.onAddGold(),
      () => this.advanceTime(),
      () => this.resetGame(),
      () => this.setMidnight(),
      () => this.skipToHighLevel(),
      () => this.advanceDay(),
      (season) => this.jumpToSeason(season),
    );
    this.add.existing(this.devPanel.container);

    this.refreshButtons();
    this.statsBar.update(this.state.gold, this.taxRate);
    this.sky.updateGradient(Math.sin(this.sunAngle), width, this.groundY, this.seasons?.winterWeight ?? 0, this.seasons?.springWeight ?? 0, this.seasons?.weatherIntensity ?? 0);
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

    const prevTier = this.buildingTier(plot.level);
    this.state.gold -= cost;
    plot.level = Math.min(plot.level + 1, MAX_LEVEL);
    this.plotContainers[index] = this.renderPlot(index);
    this.lightingSystem?.markSegmentsDirty();
    this.flashPlot(index, plot.level);
    this.showScaffolding(index, plot.level);

    const newTier = this.buildingTier(plot.level);
    if (newTier !== prevTier) this.celebrateTier(index, newTier, plot.level);
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

  private revealPlot(index: number): void {
    const building = this.plotContainers[index];
    if (!building) return;
    building.setAlpha(0);
    this.tweens.add({
      targets: building,
      alpha: 1,
      duration: 650,
      ease: 'Cubic.Out',
    });
  }

  private buildingTier(level: number): number {
    if (level <= 15) return 1;
    if (level <= 25) return 2;
    if (level <= 40) return 3;
    if (level <= 55) return 4;
    if (level <= 70) return 5;
    if (level <= 85) return 6;
    return 7;
  }

  private celebrateTier(plotIndex: number, tier: number, level: number): void {
    const TIER_NAMES = ['', 'Starter Home', 'Two-Storey House', 'Townhouse', 'Apartment Block', 'High-Rise', 'Office Block', 'Skyscraper'];
    const plotW = this.scale.width / PLOT_COUNT;
    const cx = (plotIndex + 0.5) * plotW;
    const topY = this.groundY - buildingHeight(level) - YARD_H - 12;

    // Banner
    const banner = this.add
      .text(cx, topY, `✦ ${TIER_NAMES[tier].toUpperCase()} ✦`, {
        fontSize: '13px',
        color: '#ffe066',
        fontFamily: MONO_FONT,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
        backgroundColor: '#0a1828cc',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(201)
      .setAlpha(0)
      .setScale(0.6);

    this.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 1,
      duration: 280,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: topY - 55,
          duration: 700,
          delay: 1200,
          ease: 'Quad.In',
          onComplete: () => banner.destroy(),
        });
      },
    });

    // Particle burst
    const emitter = this.add.particles(cx, topY, '__particle', {
      speed: { min: 55, max: 140 },
      angle: { min: 210, max: 330 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 550, max: 950 },
      tint: [0xffe066, 0xff8844, 0x44ddff, 0xff44cc, 0xaaffaa],
      blendMode: 'ADD',
    });
    emitter.setDepth(202);
    emitter.explode(22, cx, topY);
    this.time.delayedCall(1100, () => emitter.destroy());
  }

  private flashPlot(index: number, level: number): void {
    const plotW = this.scale.width / PLOT_COUNT;
    const cx = (index + 0.5) * plotW;
    const bh = buildingHeight(level) + YARD_H;
    const flash = this.add
      .rectangle(cx, this.groundY - bh / 2, plotW - 4, bh, 0xffffff, 0.28)
      .setDepth(20);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 350,
      ease: 'Cubic.Out',
      onComplete: () => flash.destroy(),
    });
  }

  private showScaffolding(index: number, level: number): void {
    const plotW = this.scale.width / PLOT_COUNT;
    const x0    = index * plotW + 2;
    const bh    = buildingHeight(level) + YARD_H;
    const y0    = this.groundY - bh;
    const w     = plotW - 4;

    const gfx = this.add.graphics().setDepth(9.05).setAlpha(0.65);
    gfx.lineStyle(1, 0x888888, 1);
    // Vertical scaffold poles
    for (let x = 0; x <= w; x += 12) {
      gfx.lineBetween(x0 + x, y0, x0 + x, y0 + bh);
    }
    // Horizontal scaffold boards
    for (let y = 0; y <= bh; y += 8) {
      gfx.lineBetween(x0, y0 + y, x0 + w, y0 + y);
    }

    this.tweens.add({
      targets: gfx,
      alpha:   0,
      duration: 1500,
      ease: 'Cubic.Out',
      onComplete: () => gfx.destroy(),
    });
  }

  private onPlotUnlock(index: number): void {
    const cost = UNLOCK_COSTS[index];
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    this.state.plots[index].unlocked = true;
    this.state.plots[index].level = 1;
    this.plotContainers[index] = this.renderPlot(index);
    this.lightingSystem?.markSegmentsDirty();
    this.revealPlot(index);
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
    const cost = roadUpgradeCost(this.state.road.level);
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    this.state.road.level = Math.min(this.state.road.level + 1, 10);
    this.road.render(this.state.road.level, this.scale.width, this.groundY);
    if (this.carManager && this.lightingSystem) {
      if (this.carManager.needsRebuild(this.state.road.level)) {
        this.carManager.detachLights(this.lightingSystem);
        this.carManager.rebuild(this.state.road.level, this.groundY);
        this.carManager.attachLights(this.lightingSystem);
      } else {
        const added = this.carManager.upgradeInPlace(this.state.road.level, this.groundY);
        for (const l of added) this.lightingSystem.addLight(l);
      }
    }
    this.roadUI.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.state.verge,
      this.state.water,
      this.panelTop + STATS_BAR_H,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
  }

  private onVergeUpgrade(): void {
    const cost = vergeUpgradeCost(this.state.verge.level);
    if (this.state.gold < cost) return;
    if (this.state.verge.level >= MAX_VERGE_LEVEL) return;

    this.state.gold -= cost;
    this.state.verge.level++;

    for (const l of this.vergeRiver.extraLights) this.lightingSystem?.removeLight(l);
    this.vergeRiver.render(this.state.verge.level, this.scale.width, this.groundY);
    for (const l of this.vergeRiver.extraLights) this.lightingSystem?.addLight(l);
    this.lightingSystem?.setTreeOccluders(this.vergeRiver.getTreeOccluders());

    this.roadUI.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.state.verge,
      this.state.water,
      this.panelTop + STATS_BAR_H,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();
  }

  private onWaterUpgrade(): void {
    const cost = waterUpgradeCost(this.state.water.level);
    if (this.state.gold < cost) return;
    if (this.state.water.level >= MAX_WATER_LEVEL) return;

    this.state.gold -= cost;
    this.state.water.level++;

    for (const l of this.waterArea!.extraLights) this.lightingSystem?.removeLight(l);
    this.waterArea!.render(this.state.water.level, this.scale.width, this.groundY);
    for (const l of this.waterArea!.extraLights) this.lightingSystem?.addLight(l);

    this.boatManager!.rebuild(this.state.water.level, this.groundY);
    this.boatManager!.setDockSlots(this.waterArea!.getDockSlots());
    this.boatManager!.attachLights(this.lightingSystem!);

    this.roadUI.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.state.verge,
      this.state.water,
      this.panelTop + STATS_BAR_H,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
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
    this.seasons = new SeasonSystem();
    this.buildLayout();
  }

  private updateAirplane(delta: number): void {
    const w = this.scale.width;
    const h = this.groundY;
    this.planeGfx.clear();

    if (this.plane) {
      const p = this.plane;
      p.x += p.vx * delta / 1000;
      p.blinkTimer -= delta;
      if (p.blinkTimer <= 0) {
        p.blinkOn     = !p.blinkOn;
        p.blinkTimer  = p.blinkOn ? 600 : 400;
      }

      if (p.x < -20 || p.x > w + 20) {
        this.plane = null;
        this.planeIdleTimer = 70_000 + Math.random() * 50_000;
      } else {
        // White body dot + blinking red offset dot
        this.planeGfx.fillStyle(0xffffff, 0.9);
        this.planeGfx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
        if (p.blinkOn) {
          this.planeGfx.fillStyle(0xff2222, 0.85);
          this.planeGfx.fillRect(Math.round(p.x) + (p.vx > 0 ? -3 : 2), Math.round(p.y), 1, 1);
        }
      }
    } else {
      this.planeIdleTimer -= delta;
      if (this.planeIdleTimer <= 0) {
        const fromLeft = Math.random() < 0.5;
        const altY     = h * (0.08 + Math.random() * 0.17);
        const speed    = 65 + Math.random() * 25;
        this.plane = {
          x:          fromLeft ? -10 : w + 10,
          y:          altY,
          vx:         fromLeft ? speed : -speed,
          blinkTimer: 400,
          blinkOn:    true,
        };
      }
    }
  }

  private onClockTick(): void {
    if (!this.masterClock) return;
    const elapsed = ((this.masterClock.getValue() ?? 0) + this.timeOffsetMs) % 240_000;

    // Sunrise/sunset hours vary smoothly by season via the sinusoidal c1 oscillator.
    // Summer (c1=+1): sunrise 4am, sunset 8pm (16h daylight).
    // Winter (c1=−1): sunrise 7am, sunset 5pm (10h daylight).
    const c1 = this.seasons.c1;
    const sunriseHour = 5.5 - 1.5 * c1;   // 4.0 → 7.0
    const sunsetHour  = 18.5 + 1.5 * c1;  // 20.0 → 17.0
    const afterHours  = sunsetHour - 12;
    const mornHours   = 12 - sunriseHour;
    const nightHours  = 24 - (sunsetHour - sunriseHour);
    const NC          = 0.667; // night compression — keeps night visually fast
    const msPerDayHr  = 240_000 / (afterHours + mornHours + NC * nightHours);
    const SUNSET      = afterHours * msPerDayHr;
    const SUNRISE     = SUNSET + nightHours * msPerDayHr * NC;

    if (elapsed < SUNSET) {
      // Noon→sunset: sunAngle π/2 → π
      this.sunAngle = Math.PI / 2 + (elapsed / SUNSET) * (Math.PI / 2);
    } else if (elapsed < SUNRISE) {
      // Sunset→sunrise (night): sunAngle π → 2π (fast)
      this.sunAngle = Math.PI + ((elapsed - SUNSET) / (SUNRISE - SUNSET)) * Math.PI;
    } else {
      // Sunrise→noon: sunAngle 2π → 5π/2
      this.sunAngle = 2 * Math.PI + ((elapsed - SUNRISE) / (240_000 - SUNRISE)) * (Math.PI / 2);
    }

    const elev = Math.sin(this.sunAngle);
    this.sky.updateGradient(elev, this.scale.width, this.groundY, this.seasons.winterWeight, this.seasons.springWeight, this.seasons.weatherIntensity);

    this.sunMoon.update(this.sunAngle, this.scale.width, this.groundY, this.panelTop, this.state.plots, this.plotWidth, this.seasons.moonPhase, this.seasons.c1);
    const shadowAlpha = this.sunMoon.shadowAlpha;
    for (const c of this.plotContainers) {
      if (hasShadowOverlay(c)) c.setShadowAlpha(shadowAlpha);
    }
    const wTime = performance.now() / 1000;
    // At night (elev < -0.1) force window redraw every frame for TV flicker
    if (elev < -0.1 || Math.abs(elev - this.lastWindowElev) >= 0.003) {
      this.lastWindowElev = elev;
      for (const c of this.plotContainers) {
        if (isWindowLightable(c)) c.updateWindowLights(elev, wTime, this.gameHour);
      }
    }
    this.carManager?.updateLighting(elev);
    this.boatManager?.updateLighting(elev);
    this.vergeRiver.updateLighting(elev);
    this.waterArea?.updateLighting(elev);
    this.devPanel?.updateClock(this.gameTimeString());
    this.devPanel?.updateFps(this.game.loop.actualFps);
    this.lightingSystem?.update(this.sunAngle);
  }

  private advanceTime(): void {
    this.timeOffsetMs = (this.timeOffsetMs + 240_000 / 24) % 240_000;
  }

  private advanceDay(): void {
    this.seasons.gameDayCount++;
  }

  private jumpToSeason(season: string): void {
    const offsets: Record<string, number> = { Summer: 0, Autumn: 10, Winter: 20, Spring: 30 };
    const yearBase = Math.floor(this.seasons.gameDayCount / 40) * 40;
    this.seasons.gameDayCount = yearBase + (offsets[season] ?? 0);
  }

  private setMidnight(): void {
    const MIDNIGHT_ELAPSED = 120_000;
    const current = this.masterClock?.getValue() ?? 0;
    this.timeOffsetMs = ((MIDNIGHT_ELAPSED - current) % 240_000 + 240_000) % 240_000;
  }

  private skipToHighLevel(): void {
    const SKIP_LEVELS = [75, 60, 45, 30, 15];
    this.state.road.level  = 10;
    this.state.verge.level = MAX_VERGE_LEVEL;
    this.state.water.level = MAX_WATER_LEVEL;
    for (let i = 0; i < PLOT_COUNT; i++) {
      this.state.plots[i].unlocked = true;
      this.state.plots[i].level = SKIP_LEVELS[i] ?? 1;
    }
    this.buildLayout();
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
    total += roadIncome(this.state.road.level);
    total += vergeIncome(this.state.verge.level);
    total += waterIncome(this.state.water.level);
    return total;
  }

  private onTaxTick(): void {
    const now = Date.now();
    const elapsed = now - this._lastTaxTimestamp;
    this._lastTaxTimestamp = now;
    this.state.gold += this.taxRate * (elapsed / 1000);
    this.statsBar.update(this.state.gold, this.taxRate);
    this.refreshButtons();

    this._floatTickCount++;
    if (this._floatTickCount >= 12) {
      this._floatTickCount = 0;
      this.spawnFloatingIncome();
    }
  }

  private spawnFloatingIncome(): void {
    const plots = this.state.plots;
    const plotW = this.scale.width / PLOT_COUNT;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      if (!plot.unlocked) continue;
      const base = perBuildingIncome(plot.level);
      const neighbours =
        (i > 0 && plots[i - 1].unlocked ? 1 : 0) +
        (i < plots.length - 1 && plots[i + 1].unlocked ? 1 : 0);
      const incomeFor3s = base * (1 + neighbours * 0.15) * 3;
      const cx = (i + 0.5) * plotW;
      const topY = this.groundY - buildingHeight(plot.level) - YARD_H - 8;
      spawnFloatingText(this, cx, topY, `+${fmt(incomeFor3s)}`);
    }
  }

  // ── Save & notification ────────────────────────────────────────────────────

  private onAutosave(): void {
    this.state.season = this.seasons.toSaveState();
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
    if (hasExtraLights(oldBuilding)) {
      for (const l of oldBuilding.extraLights) this.lightingSystem?.removeLight(l);
    }
    oldBuilding?.destroy();
    const x    = this.plotLeft(index);
    const plot = this.state.plots[index];

    const building = plot.unlocked
      ? createBuilding(this, x, this.plotWidth, this.groundY, plot.level, savedParticles)
      : new EmptyPlot(this, x, this.plotWidth, this.groundY);

    building.setDepth(9);
    this.add.existing(building);
    if (hasExtraLights(building)) {
      for (const l of building.extraLights) this.lightingSystem?.addLight(l);
    }
    return building;
  }
}
