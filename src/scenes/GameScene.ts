import Phaser from 'phaser';
import { type GameState, type PlotState, loadGame, saveGame } from '../game/GameState';

// ── Constants ──────────────────────────────────────────────────────────────────

const PLOT_COUNT = 5;
const PLOT_BASE_HEIGHT = 60;
const HEIGHT_PER_LEVEL = 6;
const MAX_LEVEL = 100;
const UI_HEIGHT = 200;    // fixed UI panel height at the bottom
const STATS_BAR_H = 54;   // top strip of UI panel (road + income + balance)
const ROAD_H = 48;        // road strip between sky and UI panel

/** Gold required to unlock each building slot (index = building id). */
const UNLOCK_COSTS: readonly number[] = [0, 500, 2_500, 15_000, 100_000];

/** Gold required to upgrade from `level` to `level + 1`. Quadratic scaling. */
function upgradeCost(level: number): number {
  return level * level * 10;
}

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

  // Graphics layers created once in create(), redrawn on layout changes
  private roadGraphics!: Phaser.GameObjects.Graphics;
  private buildingShadowGfx!: Phaser.GameObjects.Graphics;
  private panelChromeGfx!: Phaser.GameObjects.Graphics;

  private roadUiContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private taxRateText!: Phaser.GameObjects.Text;
  private saveNotification!: Phaser.GameObjects.Text;

  // Background rects — destroyed and recreated on resize
  private skyRect!: Phaser.GameObjects.Rectangle;
  private panelBg!: Phaser.GameObjects.Rectangle;

  // Night overlay — repositioned on resize, never recreated (tween target)
  private nightOverlay!: Phaser.GameObjects.Rectangle;

  // Dev panel
  private devPanelContainer!: Phaser.GameObjects.Container;

  // Single master clock — all day/night visuals derive from this + timeOffsetMs
  private masterClock!: Phaser.Tweens.Tween;
  private timeOffsetMs: number = 0;

  private timeOfDay = 0;
  private sunAngle: number = Math.PI / 2;
  private sunCircle!: Phaser.GameObjects.Arc;
  private sunGlowArc!: Phaser.GameObjects.Arc;
  private moonCircle!: Phaser.GameObjects.Arc;
  private sunRaysGfx!: Phaser.GameObjects.Graphics;
  private sunGroundGlow!: Phaser.GameObjects.Ellipse;
  private sunLight!: Phaser.GameObjects.Light;

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Dynamic layout getters ─────────────────────────────────────────────────
  // All positions are computed from the live canvas size so they stay correct
  // after any browser resize or orientation change.

  private get plotWidth(): number { return this.scale.width / PLOT_COUNT; }
  private get groundY(): number { return this.scale.height - UI_HEIGHT - ROAD_H; }
  private get panelTop(): number { return this.scale.height - UI_HEIGHT; }
  private get colTop(): number { return this.panelTop + STATS_BAR_H; }
  private get sectionW(): number { return this.scale.width / PLOT_COUNT; }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this.lights.enable();
    this.lights.setAmbientColor(0x888888);

    // Persistent graphics layers — depth-ordered, never destroyed
    this.roadGraphics      = this.add.graphics().setDepth(7);
    this.buildingShadowGfx = this.add.graphics().setDepth(8);
    this.panelChromeGfx    = this.add.graphics().setDepth(10);

    // Build all layout-dependent visuals
    this.buildLayout();

    // Sun/moon objects — created once after layout (sun reads groundY)
    this.setupSun();

    const { width, height } = this.scale;

    // Night overlay: kept alive across resizes so the day/night tween continues
    this.nightOverlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000022)
      .setAlpha(0)
      .setDepth(50);

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

    // Master clock: 0→240_000 ms, linear, loops forever.
    // All day/night state is derived from (clock + timeOffsetMs) % 240_000
    // so advanceTime() can simply add to timeOffsetMs with no tween seeking.
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

    // Sky + panel backgrounds (destroy old ones first)
    this.skyRect?.destroy();
    this.panelBg?.destroy();
    this.skyRect = this.add
      .rectangle(width / 2, this.groundY / 2, width, this.groundY, 0x4a7fb5)
      .setDepth(0);
    this.skyRect.setPipeline('Light2D');
    this.panelBg = this.add
      .rectangle(width / 2, (this.panelTop + height) / 2, width, height - this.panelTop, 0x1e2433)
      .setDepth(1);

    this.renderRoad();

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
    this.updateSun();
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  private onResize(): void {
    const { width, height } = this.scale;

    // Reposition persistent objects that are never destroyed
    this.nightOverlay?.setPosition(width / 2, height / 2).setSize(width, height);
    this.saveNotification?.setPosition(width - 12, 12);
    if (this.sunGroundGlow) this.sunGroundGlow.setDisplaySize(Math.round(width * 0.5), 22);
    if (this.sunLight) this.sunLight.radius = Math.max(800, width * 2);

    this.buildLayout();
  }

  // ── Dev panel ──────────────────────────────────────────────────────────────

  private buildDevPanel(): void {
    this.devPanelContainer?.destroy();
    const { width } = this.scale;
    const container = this.add.container(0, 0).setDepth(90);

    container.add(this.add.rectangle(width / 2, 22, width, 44, 0x000000, 0.6));

    const btnW = 130;
    const gap = 8;
    const leftX = (width - btnW * 2 - gap) / 2 + btnW / 2;
    const rightX = leftX + btnW + gap;

    const btn1 = this.add
      .rectangle(leftX, 22, btnW, 30, 0x1a4400)
      .setInteractive({ useHandCursor: true });
    container.add(btn1);
    container.add(
      this.add.text(leftX, 22, '+$100K', { fontSize: '13px', color: '#88ff88' }).setOrigin(0.5)
    );
    btn1.on('pointerover', () => btn1.setFillStyle(0x285e00));
    btn1.on('pointerout', () => btn1.setFillStyle(0x1a4400));
    btn1.on('pointerdown', () => {
      this.state.gold += 100_000;
      this.updateStats();
      this.refreshButtons();
    });

    const btn2 = this.add
      .rectangle(rightX, 22, btnW, 30, 0x001444)
      .setInteractive({ useHandCursor: true });
    container.add(btn2);
    container.add(
      this.add.text(rightX, 22, '+1 hr', { fontSize: '13px', color: '#88aaff' }).setOrigin(0.5)
    );
    btn2.on('pointerover', () => btn2.setFillStyle(0x001e5e));
    btn2.on('pointerout', () => btn2.setFillStyle(0x001444));
    btn2.on('pointerdown', () => this.advanceTime());

    this.devPanelContainer = container;
  }

  private onClockTick(): void {
    if (!this.masterClock) return;
    const elapsed = ((this.masterClock.getValue() ?? 0) + this.timeOffsetMs) % 240_000;

    // Sun completes one full orbit per 240s cycle
    this.sunAngle = Math.PI / 2 + (elapsed / 240_000) * Math.PI * 2;

    // timeOfDay: 0 = noon (bright), 1 = midnight (dark). Cosine gives smooth
    // natural transitions without needing a separate easing tween.
    const phase = (elapsed / 240_000) * Math.PI * 2;
    this.timeOfDay = (1 - Math.cos(phase)) / 2;

    this.updateSkyColour();
    this.nightOverlay?.setAlpha(this.timeOfDay * 0.55);
    this.updateSun();
  }

  private advanceTime(): void {
    // Advance by 1/24 of the 240s cycle (= 1 game hour = 10s real time)
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

  // ── Height helper ──────────────────────────────────────────────────────────

  private buildingHeight(level: number): number {
    const clamped = Math.max(1, Math.min(level, MAX_LEVEL));
    return PLOT_BASE_HEIGHT + (clamped - 1) * HEIGHT_PER_LEVEL;
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
    const x = this.plotLeft(index);
    const container = this.add.container(0, 0).setDepth(9);
    if (this.state.plots[index].unlocked) {
      this.buildBuilding(container, x, this.state.plots[index].level);
    } else {
      this.buildEmptyPlot(container, x);
    }
    return container;
  }

  private buildBuilding(container: Phaser.GameObjects.Container, x: number, level: number): void {
    const w = this.plotWidth;
    const h = this.buildingHeight(level);
    const top = this.groundY - h;

    if (level <= 15) {
      this.buildTier1House(container, x, w, h, top);
    } else if (level <= 35) {
      this.buildTier2Apartment(container, x, w, h, top);
    } else if (level <= 65) {
      this.buildTier3Office(container, x, w, h, top);
    } else {
      this.buildTier4Skyscraper(container, x, w, h, top);
    }
  }

  private buildTier1House(
    container: Phaser.GameObjects.Container,
    x: number, w: number, h: number, top: number
  ): void {
    const bw = Math.round(w * 0.8);
    const bx = x + (w - bw) / 2;

    const body = this.add.rectangle(bx + bw / 2, top + h / 2, bw, h, 0xb5651d);
    body.setPipeline('Light2D');
    container.add(body);

    const gfx = this.add.graphics();
    const roofHeight = Math.round(bw * 0.45);
    gfx.fillStyle(0x7a3b10, 1);
    gfx.fillTriangle(bx - 4, top, bx + bw + 4, top, bx + bw / 2, top - roofHeight);

    const chimneyW = Math.round(bw * 0.12);
    const chimneyH = Math.round(roofHeight * 0.6);
    const chimneyX = bx + Math.round(bw * 0.65);
    gfx.fillStyle(0x8b4513, 1);
    gfx.fillRect(chimneyX, top - roofHeight + Math.round(roofHeight * 0.3) - chimneyH, chimneyW, chimneyH);

    const winSize = Math.round(bw * 0.18);
    const winY = top + Math.round(h * 0.45);
    const winSpacing = Math.round(bw * 0.28);
    const winBaseX = bx + Math.round((bw - winSpacing - winSize) / 2);
    gfx.fillStyle(0xffe8a0, 1);
    gfx.fillRect(winBaseX, winY, winSize, winSize);
    gfx.fillRect(winBaseX + winSpacing, winY, winSize, winSize);

    const doorW = Math.round(bw * 0.22);
    const doorH = Math.round(h * 0.28);
    gfx.fillStyle(0x5c3317, 1);
    gfx.fillRect(bx + Math.round((bw - doorW) / 2), this.groundY - doorH, doorW, doorH);

    container.add(gfx);
  }

  private buildTier2Apartment(
    container: Phaser.GameObjects.Container,
    x: number, w: number, h: number, top: number
  ): void {
    const body = this.add.rectangle(x + w / 2, top + h / 2, w, h, 0xd4a96a);
    body.setPipeline('Light2D');
    container.add(body);

    const gfx = this.add.graphics();
    const parapetH = 10;
    gfx.fillStyle(0xbf8c50, 1);
    gfx.fillRect(x, top, w, parapetH);

    const winW = Math.round(w * 0.18);
    const winH = Math.round(winW * 1.5);
    const cols = 3;
    const hPad = Math.round(w / (cols + 1));
    const vSpacing = Math.round(h / 4);
    const rows = Math.max(2, Math.floor((h - parapetH - 20) / vSpacing));

    gfx.fillStyle(0x88aacc, 1);
    for (let row = 0; row < rows; row++) {
      const wy = top + parapetH + 16 + row * vSpacing;
      if (wy + winH > this.groundY - 8) continue;
      for (let col = 0; col < cols; col++) {
        const wx = x + hPad * (col + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    container.add(gfx);
  }

  private buildTier3Office(
    container: Phaser.GameObjects.Container,
    x: number, w: number, h: number, top: number
  ): void {
    const body = this.add.rectangle(x + w / 2, top + h / 2, w, h, 0x5a7a8a);
    body.setPipeline('Light2D');
    container.add(body);

    const gfx = this.add.graphics();
    const floorH = 22;
    const numFloors = Math.floor(h / floorH);
    gfx.lineStyle(1, 0x3d5a66, 1);
    for (let f = 1; f < numFloors; f++) {
      const ly = top + f * floorH;
      gfx.moveTo(x, ly).lineTo(x + w, ly).strokePath();
    }

    const cols = 4;
    const winW = Math.round(w * 0.12);
    const winH = Math.round(floorH * 0.55);
    const hGap = Math.round(w / (cols + 1));
    gfx.fillStyle(0xaad4e8, 0.85);
    for (let f = 0; f < numFloors; f++) {
      const wy = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > this.groundY - 4) continue;
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    container.add(gfx);
  }

  private buildTier4Skyscraper(
    container: Phaser.GameObjects.Container,
    x: number, w: number, h: number, top: number
  ): void {
    const body = this.add.rectangle(x + w / 2, top + h / 2, w, h, 0x1a2a3a);
    body.setPipeline('Light2D');
    container.add(body);

    const gfx = this.add.graphics();
    const antennaW = 4;
    const antennaH = 24;
    gfx.fillStyle(0x8899aa, 1);
    gfx.fillRect(x + Math.round((w - antennaW) / 2), top - antennaH, antennaW, antennaH);

    const floorH = 16;
    const numFloors = Math.floor(h / floorH);
    const cols = 5;
    const winW = Math.round(w * 0.1);
    const winH = Math.round(floorH * 0.6);
    const hGap = Math.round(w / (cols + 1));
    for (let f = 0; f < numFloors; f++) {
      const wy = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > this.groundY - 4) continue;
      const isAccentRow = f % 3 === 0;
      gfx.fillStyle(0x88ccff, isAccentRow ? 0.55 : 0.25);
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }
    gfx.fillStyle(0x446688, 1);
    gfx.fillRect(x, top, w, 4);
    container.add(gfx);
  }

  private buildEmptyPlot(container: Phaser.GameObjects.Container, x: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1b2e, 0.7);
    gfx.fillRect(x, this.groundY - PLOT_BASE_HEIGHT, this.plotWidth, PLOT_BASE_HEIGHT);
    gfx.lineStyle(2, 0x3a3d5c, 1);
    gfx.strokeRect(x, this.groundY - PLOT_BASE_HEIGHT, this.plotWidth, PLOT_BASE_HEIGHT);
    container.add(gfx);
  }

  // ── Day/night helpers ──────────────────────────────────────────────────────

  private updateSkyColour(): void {
    this.skyRect?.setFillStyle(lerpColor(0x4a7fb5, 0x0a0a1a, this.timeOfDay));
  }

  // ── Sun & lighting ─────────────────────────────────────────────────────────

  private setupSun(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const gy = this.groundY;

    this.moonCircle   = this.add.arc(cx, gy, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(2);
    this.sunRaysGfx   = this.add.graphics().setDepth(3);
    this.sunGlowArc   = this.add.arc(cx, 80, 44, 0, 360, false, 0xffe066, 0.3).setDepth(4);
    this.sunCircle    = this.add.arc(cx, 80, 20, 0, 360, false, 0xfff8aa, 1).setDepth(5);
    this.sunGroundGlow = this.add
      .ellipse(cx, gy + 6, Math.round(width * 0.5), 22, 0xfffae0, 0)
      .setDepth(6);
    this.sunLight = this.lights.addLight(cx, 80, Math.max(800, width * 2), 0xffeeaa, 3.2);
  }

  private updateSun(): void {
    if (!this.sunCircle) return;
    const a = this.sunAngle;
    const { width } = this.scale;
    const cx = width / 2;
    const orbitX = width * 0.95;
    const orbitY = Math.round(this.groundY * 0.90);

    const elevation = Math.sin(a);
    const sunX = cx - Math.cos(a) * orbitX;
    const sunY = this.groundY - elevation * orbitY;
    const sunAbove = elevation > 0.02;

    const moonElev = Math.sin(a + Math.PI);
    const moonX = cx - Math.cos(a + Math.PI) * orbitX;
    const moonY = this.groundY - moonElev * orbitY;

    this.sunCircle.setPosition(sunX, sunY).setVisible(sunAbove);
    this.sunGlowArc.setPosition(sunX, sunY).setVisible(sunAbove);
    this.moonCircle.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.drawSunRays(sunX, sunY, sunAbove);

    this.sunGroundGlow
      .setPosition(sunX, this.groundY + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    this.sunLight.x = sunX;
    this.sunLight.y = sunY;
    this.sunLight.intensity = Math.max(0, elevation * 3.2);

    const amb = Math.max(0.08, elevation * 0.55 + 0.14);
    const av = Math.round(amb * 255);
    this.lights.setAmbientColor((av << 16) | (av << 8) | av);

    this.drawBuildingShadows(a, elevation);
  }

  /**
   * Draws soft ground shadows using parallel sun rays (accurate for a
   * distant light source) with multi-sample penumbra simulation.
   *
   * The sun is treated as an extended disc of angular width DISC_SPREAD.
   * NUM_SAMPLES point lights are spread across that disc; each casts a
   * shadow at 1/N alpha. Overlapping umbra regions reach full alpha while
   * the non-overlapping penumbra edges appear softer.
   */
  private drawBuildingShadows(sunAngle: number, elevation: number): void {
    const gfx = this.buildingShadowGfx;
    gfx.clear();
    if (elevation <= 0.02) return;

    const totalAlpha = Math.min(0.66, elevation * 0.84 + 0.12);
    const shadowH = ROAD_H - 4;

    const NUM_SAMPLES = 5;
    const DISC_SPREAD = 0.10; // radians (~5.7°) — wider = softer penumbra

    // Clamp the lean-to-height ratio so all buildings share the same shadow
    // angle regardless of height. Equivalent to a minimum effective sun
    // elevation of ~20° — prevents near-horizon runaway without inconsistency.
    const MAX_LEAN_RATIO = Math.cos(0.35) / Math.sin(0.35); // ~2.74

    for (let s = 0; s < NUM_SAMPLES; s++) {
      const t = (s / (NUM_SAMPLES - 1)) - 0.5; // −0.5 … +0.5
      const sAngle = sunAngle + t * DISC_SPREAD;
      const sElev = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev <= 0.01) continue;

      // Same lean angle for every building height (parallel-ray physics).
      const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));

      gfx.fillStyle(0x000022, totalAlpha / NUM_SAMPLES);

      for (let i = 0; i < PLOT_COUNT; i++) {
        const plot = this.state.plots[i];
        if (!plot.unlocked) continue;

        const x = this.plotLeft(i);
        const w = this.plotWidth;
        const h = this.buildingHeight(plot.level);
        const bw = plot.level <= 15 ? Math.round(w * 0.8) : w;
        const bx = plot.level <= 15 ? x + (w - bw) / 2 : x;

        const lean = leanRate * h;

        const p1x = bx,              p1y = this.groundY;
        const p2x = bx + bw,         p2y = this.groundY;
        const p3x = bx + bw + lean,  p3y = this.groundY + shadowH;
        const p4x = bx + lean,       p4y = this.groundY + shadowH;

        gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
        gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);
      }
    }
  }

  private drawSunRays(cx: number, cy: number, visible: boolean): void {
    const gfx = this.sunRaysGfx;
    gfx.clear();
    if (!visible) return;

    const numRays = 12;
    const innerR = 24;
    const outerR = 72;
    const halfAngle = 0.11;
    gfx.fillStyle(0xffe066, 0.22);
    for (let i = 0; i < numRays; i++) {
      const angle = (i / numRays) * Math.PI * 2;
      gfx.fillTriangle(
        cx + Math.cos(angle - halfAngle) * innerR,
        cy + Math.sin(angle - halfAngle) * innerR,
        cx + Math.cos(angle + halfAngle) * innerR,
        cy + Math.sin(angle + halfAngle) * innerR,
        cx + Math.cos(angle) * outerR,
        cy + Math.sin(angle) * outerR
      );
    }
  }

  // ── UI panel columns ───────────────────────────────────────────────────────

  private renderUISection(index: number): Phaser.GameObjects.Container {
    this.uiContainers[index]?.destroy();
    this.actionRefs[index] = null;

    const container = this.add.container(0, 0).setDepth(11);
    const cx = index * this.sectionW + this.sectionW / 2;
    const plot = this.state.plots[index];

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
    const cost = upgradeCost(plot.level);

    container.add(
      this.add
        .text(cx, this.colTop + 40, `Lv ${plot.level}/${MAX_LEVEL}`, {
          fontSize: '14px',
          color: '#ddeeff',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, this.colTop + 62, `${fmt(perBuildingIncome(plot.level))}/s`, {
          fontSize: '12px',
          color: '#88ddaa',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, this.colTop + 82, atMax ? '' : `${fmt(cost)}`, {
          fontSize: '12px',
          color: '#99aabb',
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
          fontSize: '12px',
          color: atMax ? '#555566' : '#cce8ff',
        })
        .setOrigin(0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x2471a3));
      btn.on('pointerout', () => btn.setFillStyle(0x1a5276));
      btn.on('pointerdown', (): void => {
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.plots[index].level = Math.min(plot.level + 1, MAX_LEVEL);
        this.plotContainers[index] = this.renderPlot(index);
        this.uiContainers[index] = this.renderUISection(index);
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
    btn.on('pointerout', () => btn.setFillStyle(0x2d6b1a));
    btn.on('pointerdown', (): void => {
      if (this.state.gold < cost) return;
      this.state.gold -= cost;
      this.state.plots[index].unlocked = true;
      this.state.plots[index].level = 1;
      this.plotContainers[index] = this.renderPlot(index);
      this.uiContainers[index] = this.renderUISection(index);
      this.updateStats();
      this.refreshButtons();
    });

    this.actionRefs[index] = { btn, getCost: (): number => cost, activeColor: 0x2d6b1a };
  }

  // ── Road rendering ─────────────────────────────────────────────────────────

  private roadUpgradeCost(): number {
    const lvl = this.state.road.level;
    return lvl === 0 ? 200 : lvl * lvl * 50;
  }

  private renderRoad(): void {
    const gfx = this.roadGraphics;
    gfx.clear();
    const { width } = this.scale;
    const level = this.state.road.level;
    const gy = this.groundY;

    if (level === 0) {
      gfx.fillStyle(0x555e6b, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      return;
    }
    if (level <= 2) {
      gfx.fillStyle(0x6b4c2a, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0x8a6040, 1);
      for (let px = 10; px < width; px += 28) {
        gfx.fillCircle(px, gy + 8, 2);
        gfx.fillCircle(px + 14, gy + 16, 2);
      }
      return;
    }
    if (level <= 4) {
      gfx.fillStyle(0x555555, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0x6e6e6e, 1);
      for (let px = 5; px < width; px += 18) {
        gfx.fillRect(px, gy + 5, 3, 2);
        gfx.fillRect(px + 9, gy + 14, 3, 2);
      }
      return;
    }
    if (level <= 6) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    if (level <= 8) {
      const midY = gy + ROAD_H / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, gy, width, ROAD_H);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, gy + 2, width, 2);
      gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, midY - 1, 20, 2);
      return;
    }
    // Level 9-10 — Highway
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(0, gy, width, ROAD_H);
    gfx.fillStyle(0xffd700, 1);
    gfx.fillRect(0, gy + 2, width, 2);
    gfx.fillRect(0, gy + ROAD_H - 4, width, 2);
    gfx.fillStyle(0xffffff, 1);
    for (const frac of [0.25, 0.5, 0.75]) {
      const dy = Math.round(gy + ROAD_H * frac) - 1;
      for (let px = 0; px < width; px += 34) gfx.fillRect(px, dy, 20, 2);
    }
  }

  // ── Road UI ────────────────────────────────────────────────────────────────

  private roadTierName(): string {
    const lvl = this.state.road.level;
    if (lvl === 0) return 'None';
    if (lvl <= 2) return 'Dirt Track';
    if (lvl <= 4) return 'Gravel';
    if (lvl <= 6) return 'Paved';
    if (lvl <= 8) return 'Two-Lane';
    return 'Highway';
  }

  private renderRoadUI(): Phaser.GameObjects.Container {
    this.roadUiContainer?.destroy();
    this.actionRefs[PLOT_COUNT] = null;

    const container = this.add.container(0, 0).setDepth(11);
    const { width } = this.scale;
    const midY = this.panelTop + STATS_BAR_H / 2;
    const atMax = this.state.road.level >= 10;
    const cost = this.roadUpgradeCost();

    container.add(
      this.add
        .text(width / 2, midY - 13, `Road: ${this.roadTierName()}`, {
          fontSize: '12px',
          color: '#aabbcc',
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
      btn.on('pointerout', () => btn.setFillStyle(0x5a3e00));
      btn.on('pointerdown', (): void => {
        if (this.state.gold < cost) return;
        this.state.gold -= cost;
        this.state.road.level = Math.min(this.state.road.level + 1, 10);
        this.renderRoad();
        this.roadUiContainer = this.renderRoadUI();
        this.updateStats();
        this.refreshButtons();
      });
      this.actionRefs[PLOT_COUNT] = { btn, getCost: (): number => cost, activeColor: 0x5a3e00 };
    }

    return container;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function perBuildingIncome(level: number): number {
  return Math.floor(Math.pow(level, 0.75) * 10);
}

function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
