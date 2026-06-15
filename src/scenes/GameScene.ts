import Phaser from 'phaser';
import { type GameState, clearSave, defaultState, loadGame, saveGame } from '../game/GameState';
import { advanceTime as advanceTimeOffset, computeSunAngle, elapsedMs, gameTimeString, setMidnight as computeMidnightOffset } from '../game/TimeOfDaySystem';
import { buildingTier, plotIncomeWithNeighbourBonus, taxRate, updatePopulation } from '../game/EconomySystem';
import { addDevGold, jumpToSeasonOffset, skipToHighLevelState } from '../game/DevActions';
import {
  PLOT_COUNT, MAX_LEVEL, MAX_ROAD_LEVEL, MAX_VERGE_LEVEL, MAX_WATER_LEVEL, UI_HEIGHT, STATS_BAR_H, ROAD_BAR_H,
  ROAD_H, VERGE_H, WATER_H, YARD_H,
  UNLOCK_COSTS,
  upgradeCost, vergeUpgradeCost, waterUpgradeCost,
  roadUpgradeCost,
  buildingHeight, fmt,
} from '../constants';
import { spawnFloatingText } from '../ui/FloatingText';
import { createBuilding, EmptyPlot } from '../buildings';
import { attachBuildingShadow } from '../buildings/buildingShadow';
import { hasShadowOverlay, hasSmokeUpdate, hasFlagUpdate } from '../buildings/types';
import { Sky } from '../objects/Sky';
import { SunMoon } from '../objects/SunMoon';
import { Stars } from '../objects/Stars';
import { Road } from '../objects/Road';
import { VergeRiver } from '../objects/VergeRiver';
import { StatsBar } from '../ui/StatsBar';
import { TownNameSign, TOWN_RENAME_COST } from '../ui/TownNameSign';
import { PanelChrome } from '../ui/PanelChrome';
import { PlotUI } from '../ui/PlotUI';
import { RoadUI } from '../ui/RoadUI';
import { DevPanel, DEV_PANEL_H, DEV_PANEL_OFFSET } from '../ui/DevPanel';
import { MenuUI } from '../ui/MenuUI';
import { LightingSystem, type LightSource } from '../lighting/LightingSystem';
import { CarManager } from '../objects/CarManager';
import { PedestrianManager } from '../objects/PedestrianManager';
import { WaterArea } from '../objects/WaterArea';
import { BoatManager } from '../objects/BoatManager';
import { ALL_CAR_KEYS, getCarUrl } from '../objects/CarAssets';
import { PERSON_DEFS, getPersonUrl } from '../objects/PedestrianAssets';
import { ALL_BOAT_KEYS, getBoatUrl } from '../objects/BoatAssets';
import { CYCLIST_KEYS, getCyclistUrl, CYCLIST_FRAME_WIDTH, CYCLIST_FRAME_HEIGHT } from '../objects/CyclistAssets';
import { FURNITURE_KEYS, getFurnitureUrl } from '../objects/VergeFurnitureAssets';
import { FLOWER_KEYS, getFlowerUrl } from '../objects/FlowerAssets';
import { TREE_KEYS, getTreeUrl } from '../objects/TreeAssets';
import { PIGEON_KEY, getPigeonUrl, PIGEON_FRAME_WIDTH, PIGEON_FRAME_HEIGHT } from '../objects/PigeonAssets';
import { STAR_KEY, getStarUrl } from '../objects/StarAssets';
import { BIRD_KEY, getBirdUrl, BIRD_FRAME_WIDTH, BIRD_FRAME_HEIGHT } from '../objects/BirdAssets';
import { WATER_STRUCTURE_KEYS, getWaterStructureUrl } from '../objects/WaterStructureAssets';
import { loadHtAssets } from '../objects/HighTidesAssets';
import { Clouds } from '../objects/Clouds';
import { Rain } from '../objects/Rain';
import { Snow } from '../objects/Snow';
import { WeatherAccumulation } from '../objects/WeatherAccumulation';
import { SeasonSystem } from '../game/SeasonSystem';
import { Airplane } from '../objects/Airplane';
import { TierCelebrationFx } from './TierCelebrationFx';
import { Balloon } from '../objects/Balloon';
import { BirdFlock } from '../objects/BirdFlock';
import { PigeonManager } from '../objects/PigeonManager';
import { SkyToy } from '../objects/SkyToy';
import { getTheme } from '../theme/themes';
import type { ThemeDefinition } from '../theme/ThemeTypes';
import { LoadingScreen } from '../ui/LoadingScreen';

// ── Bottom-sheet panel tuning ───────────────────────────────────────────────
const PANEL_SLIDE_MS = 280;
const PANEL_AUTO_COLLAPSE_MS = 30_000;

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
  private townSign!: TownNameSign;
  private roadUI!: RoadUI;
  private devPanel!: DevPanel;
  private menuUI!: MenuUI;
  private loadingScreen!: LoadingScreen;
  private saveNotification!: Phaser.GameObjects.Text;
  private activeTheme!: ThemeDefinition;

  // World-layer managers
  private sky!: Sky;
  private sunMoon!: SunMoon;
  private stars!: Stars;
  private road!: Road;
  private vergeRiver!: VergeRiver;

  // Panel background — destroyed and recreated on resize
  private panelBg!: Phaser.GameObjects.Rectangle;
  // Background for the expandable upgrade panel — slides with its content
  private expandPanelBg!: Phaser.GameObjects.Rectangle;

  // Expandable bottom-sheet panel state
  private panelExpanded = false;
  private panelOffset = UI_HEIGHT;
  private panelTween: Phaser.Tweens.Tween | null = null;
  private autoCollapseTimer: Phaser.Time.TimerEvent | null = null;

  private clouds!: Clouds;
  private rain!: Rain;
  private snow!: Snow;
  private weatherAccumulation!: WeatherAccumulation;
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
  private _lastPlayTimeTimestamp = Date.now();
  seasons!: SeasonSystem;

  private cursorLight: LightSource | null = null;
  private cursorOverCanvas = false;

  // ── Airplane ──────────────────────────────────────────────────────────────
  private airplane!: Airplane;

  // ── Tier-upgrade celebration FX ──────────────────────────────────────────
  private tierCelebrationFx!: TierCelebrationFx;

  // ── Hot air balloon & birds ───────────────────────────────────────────────
  private balloon!: Balloon;
  private birdFlock!: BirdFlock;
  private pigeonManager!: PigeonManager;
  private skyToy!: SkyToy;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Dynamic layout getters ─────────────────────────────────────────────────

  private get plotWidth(): number { return this.scale.width / PLOT_COUNT; }
  // Bottom of the game world — always-visible top edge of the collapsed panel (StatsBar only).
  private get collapsedPanelTop(): number { return this.scale.height - STATS_BAR_H; }
  private get groundY(): number { return this.collapsedPanelTop - ROAD_H - VERGE_H - WATER_H; }
  // Top of the fully-expanded panel (StatsBar + RoadUI + PlotUI columns).
  private get panelTop(): number { return this.scale.height - UI_HEIGHT; }
  private get colTop(): number { return this.panelTop + ROAD_BAR_H; }
  private get sectionW(): number { return this.scale.width / PLOT_COUNT; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  preload(): void {
    for (const key of ALL_CAR_KEYS) {
      const url = getCarUrl(key);
      if (url) this.load.image(key, url);
    }
    for (const def of PERSON_DEFS) {
      const url = getPersonUrl(def.key);
      if (url) this.load.spritesheet(def.key, url, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
    }
    for (const key of ALL_BOAT_KEYS) {
      const url = getBoatUrl(key);
      if (url) this.load.image(key, url);
    }
    for (const key of CYCLIST_KEYS) {
      const url = getCyclistUrl(key);
      if (url) this.load.spritesheet(key, url, { frameWidth: CYCLIST_FRAME_WIDTH, frameHeight: CYCLIST_FRAME_HEIGHT });
    }
    for (const key of FURNITURE_KEYS) {
      const url = getFurnitureUrl(key);
      if (url) this.load.image(key, url);
    }
    for (const key of FLOWER_KEYS) {
      const url = getFlowerUrl(key);
      if (url) this.load.image(key, url);
    }
    for (const key of TREE_KEYS) {
      const url = getTreeUrl(key);
      if (url) this.load.image(key, url);
    }
    {
      const url = getPigeonUrl(PIGEON_KEY);
      if (url) this.load.spritesheet(PIGEON_KEY, url, { frameWidth: PIGEON_FRAME_WIDTH, frameHeight: PIGEON_FRAME_HEIGHT });
    }
    {
      const url = getStarUrl(STAR_KEY);
      if (url) this.load.image(STAR_KEY, url);
    }
    {
      const url = getBirdUrl(BIRD_KEY);
      if (url) this.load.spritesheet(BIRD_KEY, url, { frameWidth: BIRD_FRAME_WIDTH, frameHeight: BIRD_FRAME_HEIGHT });
    }
    for (const key of WATER_STRUCTURE_KEYS) {
      const url = getWaterStructureUrl(key);
      if (url) this.load.image(key, url);
    }
    loadHtAssets(this);
  }

  create(): void {
    this.lights.enable();

    this.seasons             = new SeasonSystem(this.state.season);
    this.rain                = new Rain(this);
    this.snow                = new Snow(this);
    this.weatherAccumulation = new WeatherAccumulation(this);
    this.airplane  = new Airplane(this);
    this.balloon   = new Balloon(this);
    this.birdFlock = new BirdFlock(this);
    this.pigeonManager = new PigeonManager(this);
    this.skyToy        = new SkyToy(this);

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

    this.loadingScreen = new LoadingScreen(this, this.scale.width, this.scale.height);

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
    const onVisible = () => {
      this._lastPlayTimeTimestamp = Date.now();
      if (document.visibilityState === 'visible') this.onTaxTick();
    };
    document.addEventListener('visibilitychange', onVisible);
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onVisible));

    // Save on tab close / navigation away
    const onBeforeUnload = () => { this.state.season = this.seasons.toSaveState(); saveGame(this.state); };
    window.addEventListener('beforeunload', onBeforeUnload);
    this.events.once('shutdown', () => window.removeEventListener('beforeunload', onBeforeUnload));

    // Cursor spotlight — track whether pointer is over the game canvas
    const onMouseEnter = () => { this.cursorOverCanvas = true; };
    const onMouseLeave = () => { this.cursorOverCanvas = false; };
    this.game.canvas.addEventListener('mouseenter', onMouseEnter);
    this.game.canvas.addEventListener('mouseleave', onMouseLeave);
    this.events.once('shutdown', () => {
      this.game.canvas.removeEventListener('mouseenter', onMouseEnter);
      this.game.canvas.removeEventListener('mouseleave', onMouseLeave);
    });

    // Autosave — every 10 s
    this.time.addEvent({ delay: 10_000, loop: true, callback: this.onAutosave, callbackScope: this });

    this.tierCelebrationFx = new TierCelebrationFx(this);

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
    this.weatherAccumulation.update(delta, rainIntensity, snowIntensity, Math.sin(this.sunAngle), this.sky.horizonColor);
    const elapsed   = elapsedMs(this.masterClock?.getValue() ?? 0, this.timeOffsetMs);
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
    this.airplane.update(delta, this.scale.width, this.groundY);
    this.balloon?.update(delta, elevation, this.sunAngle);
    this.birdFlock?.update(delta, elevation);
    this.skyToy?.update(delta, elevation);
    this.pigeonManager?.update(delta, this.state.plots, this.pedestrianManager?.getXPositions() ?? [], this.sunAngle);
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    for (const c of this.plotContainers) {
      if (hasSmokeUpdate(c)) c.updateSmoke(t);
      if (hasFlagUpdate(c)) c.updateFlag();
    }

    if (this.cursorLight) {
      if (this.cursorOverCanvas) {
        const ptr = this.input.activePointer;
        this.cursorLight.x = ptr.x;
        this.cursorLight.y = ptr.y;
      } else {
        this.cursorLight.x = -9999;
        this.cursorLight.y = -9999;
      }
    }
  }

  // ── Layout build / rebuild ─────────────────────────────────────────────────

  private buildLayout(): void {
    const { width, height } = this.scale;
    this.activeTheme = getTheme(this.state.selectedSkin);
    this.lights.setAmbientColor(this.activeTheme.params.ambientLightColor);

    this.sky.rebuild();
    this.clouds.rebuild(width, this.groundY);
    this.rain?.rebuild(width, height, this.collapsedPanelTop);
    this.snow?.rebuild(width, height, this.collapsedPanelTop);
    this.weatherAccumulation?.rebuild(width, this.groundY);
    this.balloon?.rebuild(width, this.groundY);
    this.birdFlock?.rebuild(width, this.groundY);
    this.skyToy?.rebuild(width, this.groundY);
    this.pigeonManager?.rebuild(this.groundY, this.plotWidth);

    this.panelBg?.destroy();
    this.panelBg = this.add
      .rectangle(width / 2, (this.collapsedPanelTop + height) / 2, width, height - this.collapsedPanelTop, 0x1e2433)
      .setDepth(1)
      .setLighting(false);

    // Background for the expandable panel — overlays the game area when slid up
    this.expandPanelBg?.destroy();
    this.expandPanelBg = this.add
      .rectangle(width / 2, (this.panelTop + this.collapsedPanelTop) / 2, width, this.collapsedPanelTop - this.panelTop, 0x1e2433)
      .setDepth(9.9)
      .setLighting(false);

    this.road.render(this.state.road.level, width, this.groundY, this.activeTheme.palette.road);
    this.vergeRiver.render(this.state.verge.level, width, this.groundY, this.activeTheme.palette.verge, this.activeTheme.params);
    this.waterArea!.render(this.state.water.level, width, this.groundY, this.activeTheme.palette.water);

    this.lightingSystem?.destroy();
    this.lightingSystem = new LightingSystem(this, this.groundY, DEV_PANEL_OFFSET + DEV_PANEL_H);

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.carManager?.destroy();
    this.carManager = new CarManager(this);
    this.carManager.rebuild(this.state.road.level, this.groundY, this.activeTheme.params.carSpeedMultiplier);
    this.carManager.attachLights(this.lightingSystem);
    for (const l of this.vergeRiver.extraLights) this.lightingSystem.addLight(l);
    for (const l of this.waterArea!.extraLights)  this.lightingSystem.addLight(l);
    this.lightingSystem.setTreeOccluders(this.vergeRiver.getTreeOccluders());

    // Cursor spotlight — lazy-create once, then re-add to each rebuilt lightingSystem
    if (!this.cursorLight) {
      this.cursorLight = { x: -9999, y: -9999, radius: 380, color: 0xfff5e8, intensity: 0.45, cursorLight: true };
    }
    this.lightingSystem.addLight(this.cursorLight);

    this.boatManager!.rebuild(this.state.water.level, this.groundY);
    this.boatManager!.setDockSlots(this.waterArea!.getDockSlots());
    this.boatManager!.attachLights(this.lightingSystem);

    this.pedestrianManager?.destroy();
    this.pedestrianManager = new PedestrianManager(this, this.groundY, this.plotWidth, this.activeTheme.params.pedestrianSpeedMultiplier);

    this.panelChrome.draw(width, this.panelTop, this.collapsedPanelTop, this.colTop, this.sectionW);

    this.statsBar?.destroy();
    this.statsBar = new StatsBar(this, this.collapsedPanelTop, width, () => this.togglePanel());
    this.statsBar.setExpanded(this.panelExpanded);

    if (this.townSign) {
      // Reuse the existing instance so an open rename dialog (and its
      // focused input) survives a layout rebuild — e.g. when the on-screen
      // keyboard closes and the viewport resizes back.
      this.townSign.resize(width);
    } else {
      this.townSign = new TownNameSign(
        this,
        width,
        () => this.state.townName,
        (newName) => {
          if (this.state.gold < TOWN_RENAME_COST) return false;
          this.state.gold -= TOWN_RENAME_COST;
          this.state.townName = newName;
          this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
          return true;
        },
      );
    }

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
      this.panelTop,
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
      () => this.balloon?.forceSpawn(),
      (key) => this.boatManager?.forceSpawn(key),
    );
    this.add.existing(this.devPanel.container);

    if (this.menuUI) {
      this.menuUI.resize(width, height);
    } else {
      this.menuUI = new MenuUI(this, width, height, () => this.state, (i) => this.onSkinSelect(i));
    }

    this.applyPanelOffset(this.panelOffset);

    this.refreshButtons();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.sky.updateGradient(Math.sin(this.sunAngle), width, this.groundY, this.seasons?.winterWeight ?? 0, this.seasons?.springWeight ?? 0, this.seasons?.weatherIntensity ?? 0, this.activeTheme.palette.sky);
    this.sunMoon.update(this.sunAngle, width, this.groundY, this.collapsedPanelTop, this.state.plots, this.plotWidth);
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  private onResize(): void {
    // On mobile, opening the on-screen keyboard shrinks the viewport and
    // fires a window 'resize' event. Rebuilding the whole layout here would
    // destroy/recreate the rename dialog (and its focused input) the instant
    // the keyboard opens. Skip the rebuild while a text input is focused —
    // it'll run again once the input blurs and the keyboard closes.
    if (document.activeElement instanceof HTMLInputElement) return;

    const { width, height } = this.scale;

    this.sky.resize(width, height);
    this.sunMoon.resize(width);
    this.stars.resize();
    this.saveNotification?.setPosition(width - 12, 12);
    this.loadingScreen?.resize(width, height);

    this.buildLayout();
  }

  // ── Expandable bottom-sheet panel ───────────────────────────────────────────

  // Shifts the upgrade panel (RoadUI/PlotUI columns + their chrome/background)
  // down by `offset` px from their fully-expanded position. offset=0 is fully
  // expanded; offset=UI_HEIGHT pushes the whole panel below the screen, leaving
  // only the fixed StatsBar visible.
  private applyPanelOffset(offset: number): void {
    this.panelChrome.slidingGfx.y = offset;
    this.expandPanelBg.y = (this.panelTop + this.collapsedPanelTop) / 2 + offset;
    this.roadUI.container.y = offset;
    for (const ui of this.plotUIs) ui.container.y = offset;
  }

  private togglePanel(): void {
    if (this.panelExpanded) this.collapsePanel();
    else this.expandPanel();
  }

  private expandPanel(): void {
    if (!this.panelExpanded) {
      this.panelExpanded = true;
      this.statsBar.setExpanded(true);
      this.animatePanelTo(0);
    }
    this.resetAutoCollapseTimer();
  }

  private collapsePanel(): void {
    if (!this.panelExpanded) return;
    this.panelExpanded = false;
    this.statsBar.setExpanded(false);
    this.animatePanelTo(UI_HEIGHT);
    this.clearAutoCollapseTimer();
  }

  // Resets the auto-collapse timer when the player interacts with an upgrade
  // button while the panel is expanded, so it doesn't slide away mid-tap.
  private touchPanel(): void {
    if (this.panelExpanded) this.resetAutoCollapseTimer();
  }

  private animatePanelTo(target: number): void {
    this.panelTween?.stop();
    this.panelTween = this.tweens.addCounter({
      from: this.panelOffset,
      to: target,
      duration: PANEL_SLIDE_MS,
      ease: 'Cubic.Out',
      onUpdate: () => {
        this.panelOffset = this.panelTween?.getValue() ?? target;
        this.applyPanelOffset(this.panelOffset);
      },
    });
  }

  private resetAutoCollapseTimer(): void {
    this.clearAutoCollapseTimer();
    this.autoCollapseTimer = this.time.delayedCall(PANEL_AUTO_COLLAPSE_MS, () => this.collapsePanel());
  }

  private clearAutoCollapseTimer(): void {
    this.autoCollapseTimer?.remove();
    this.autoCollapseTimer = null;
  }

  // ── UI callbacks ───────────────────────────────────────────────────────────

  private onPlotUpgrade(index: number): void {
    const plot = this.state.plots[index];
    const cost = upgradeCost(plot.level, index);
    if (this.state.gold < cost) return;

    const prevTier = this.buildingTier(plot.level);
    this.state.gold -= cost;
    plot.level = Math.min(plot.level + 1, MAX_LEVEL);
    this.plotContainers[index] = this.renderPlot(index);
    this.lightingSystem?.markSegmentsDirty();
    this.tierCelebrationFx.flashPlot(index, plot.level, this.plotWidth, this.groundY);
    this.tierCelebrationFx.showScaffolding(index, plot.level, this.plotWidth, this.groundY);

    const newTier = this.buildingTier(plot.level);
    if (newTier !== prevTier) this.tierCelebrationFx.celebrateTier(index, newTier, plot.level, this.plotWidth, this.groundY);
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
    this.plotUIs[index].container.y = this.panelOffset;
    this.touchPanel();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
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
    return buildingTier(level);
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
      this.plotUIs[i].container.y = this.panelOffset;
    }
    this.touchPanel();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();
  }

  // ── Skin/theme switching ───────────────────────────────────────────────────

  private applySkin(index: number): void {
    if (this.state.selectedSkin === index) return;
    this.state.selectedSkin = index;
    saveGame(this.state);
    this.loadingScreen.show();
    this.time.delayedCall(0, () => {
      this.buildLayout();
      this.loadingScreen.hide();
    });
  }

  private onSkinSelect(index: number): void {
    this.applySkin(index);
    this.menuUI.refreshSkinsTab();
  }

  private onRoadUpgrade(): void {
    const cost = roadUpgradeCost(this.state.road.level);
    if (this.state.gold < cost) return;

    this.state.gold -= cost;
    this.state.road.level = Math.min(this.state.road.level + 1, MAX_ROAD_LEVEL);
    this.road.render(this.state.road.level, this.scale.width, this.groundY, this.activeTheme.palette.road);
    if (this.carManager && this.lightingSystem) {
      if (this.carManager.needsRebuild(this.state.road.level)) {
        this.carManager.detachLights(this.lightingSystem);
        this.carManager.rebuild(this.state.road.level, this.groundY, this.activeTheme.params.carSpeedMultiplier);
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
      this.panelTop,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);
    this.roadUI.container.y = this.panelOffset;
    this.touchPanel();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();
  }

  private onVergeUpgrade(): void {
    const cost = vergeUpgradeCost(this.state.verge.level);
    if (this.state.gold < cost) return;
    if (this.state.verge.level >= MAX_VERGE_LEVEL) return;

    this.state.gold -= cost;
    this.state.verge.level++;

    for (const l of this.vergeRiver.extraLights) this.lightingSystem?.removeLight(l);
    this.vergeRiver.render(this.state.verge.level, this.scale.width, this.groundY, this.activeTheme.palette.verge, this.activeTheme.params);
    for (const l of this.vergeRiver.extraLights) this.lightingSystem?.addLight(l);
    this.lightingSystem?.setTreeOccluders(this.vergeRiver.getTreeOccluders());

    this.roadUI.destroy();
    this.roadUI = new RoadUI(
      this,
      this.state.road,
      this.state.verge,
      this.state.water,
      this.panelTop,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);
    this.roadUI.container.y = this.panelOffset;
    this.touchPanel();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();
  }

  private onWaterUpgrade(): void {
    const cost = waterUpgradeCost(this.state.water.level);
    if (this.state.gold < cost) return;
    if (this.state.water.level >= MAX_WATER_LEVEL) return;

    this.state.gold -= cost;
    this.state.water.level++;

    for (const l of this.waterArea!.extraLights) this.lightingSystem?.removeLight(l);
    this.waterArea!.render(this.state.water.level, this.scale.width, this.groundY, this.activeTheme.palette.water);
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
      this.panelTop,
      this.scale.width,
      () => this.onRoadUpgrade(),
      () => this.onVergeUpgrade(),
      () => this.onWaterUpgrade(),
    );
    this.add.existing(this.roadUI.container);
    this.roadUI.container.y = this.panelOffset;
    this.touchPanel();
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();
  }

  private onAddGold(): void {
    addDevGold(this.state);
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();
  }


  private resetGame(): void {
    clearSave();
    this.state = defaultState(PLOT_COUNT);
    this.seasons = new SeasonSystem();
    this.buildLayout();
  }

  private onClockTick(): void {
    if (!this.masterClock) return;
    const elapsed = elapsedMs(this.masterClock.getValue() ?? 0, this.timeOffsetMs);

    this.sunAngle = computeSunAngle(elapsed, this.seasons.c1);

    const elev = Math.sin(this.sunAngle);
    this.sky.updateGradient(elev, this.scale.width, this.groundY, this.seasons.winterWeight, this.seasons.springWeight, this.seasons.weatherIntensity, this.activeTheme.palette.sky);

    this.sunMoon.update(this.sunAngle, this.scale.width, this.groundY, this.collapsedPanelTop, this.state.plots, this.plotWidth, this.seasons.moonPhase, this.seasons.c1);
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
    this.devPanel?.updateClock(gameTimeString(elapsedMs(this.masterClock.getValue() ?? 0, this.timeOffsetMs)));
    this.devPanel?.updateFps(this.game.loop.actualFps);
    this.lightingSystem?.update(this.sunAngle, this.seasons.moonPhase);
  }

  private advanceTime(): void {
    this.timeOffsetMs = advanceTimeOffset(this.timeOffsetMs);
  }

  private advanceDay(): void {
    this.seasons.gameDayCount++;
  }

  private jumpToSeason(season: string): void {
    this.seasons.gameDayCount = jumpToSeasonOffset(this.seasons.gameDayCount, season);
  }

  private setMidnight(): void {
    this.timeOffsetMs = computeMidnightOffset(this.masterClock?.getValue() ?? 0);
  }

  private skipToHighLevel(): void {
    skipToHighLevelState(this.state);
    this.buildLayout();
  }

  // ── Tax system ─────────────────────────────────────────────────────────────

  private get taxRate(): number {
    return taxRate(this.state);
  }

  private updatePopulation(dtSeconds: number): void {
    updatePopulation(this.state, dtSeconds);
  }

  private onTaxTick(): void {
    const now = Date.now();
    const elapsed = now - this._lastTaxTimestamp;
    this._lastTaxTimestamp = now;
    const earned = this.taxRate * (elapsed / 1000);
    this.state.gold += earned;
    this.state.stats.totalMoneyEarned += earned;
    this.updatePopulation(elapsed / 1000);
    this.statsBar.update(this.state.gold, this.taxRate, this.state.population);
    this.refreshButtons();

    if (document.visibilityState === 'visible') {
      this.state.stats.totalPlayTimeMs += now - this._lastPlayTimeTimestamp;
    }
    this._lastPlayTimeTimestamp = now;

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
      const incomeFor3s = plotIncomeWithNeighbourBonus(plots, i) * 3;
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
      ? createBuilding(this, x, this.plotWidth, this.groundY, plot.level, this.activeTheme.palette.building, this.activeTheme.params, savedParticles)
      : new EmptyPlot(this, x, this.plotWidth, this.groundY, this.activeTheme.palette.building.emptyPlot);

    building.setDepth(9);
    this.add.existing(building);
    attachBuildingShadow(this, building, x, this.plotWidth, this.groundY);
    if (hasExtraLights(building)) {
      for (const l of building.extraLights) this.lightingSystem?.addLight(l);
    }
    return building;
  }
}
