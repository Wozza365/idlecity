import Phaser from 'phaser';
import { type GameState, type PlotState, loadGame, saveGame } from '../game/GameState';

// ── Constants ──────────────────────────────────────────────────────────────────

const PLOT_COUNT = 5;
const PLOT_WIDTH = 160;
const PLOT_BASE_HEIGHT = 140;
const HEIGHT_PER_LEVEL = 2;
const MAX_LEVEL = 100;
const PLOT_GAP = 24;
const GROUND_Y = 480;
const PANEL_TOP = GROUND_Y + 20;
const STATS_BAR_H = 44;
const COL_TOP = PANEL_TOP + STATS_BAR_H;
const SECTION_W = 1280 / PLOT_COUNT;

/** Gold required to unlock each building slot (index = building id). */
const UNLOCK_COSTS: readonly number[] = [0, 500, 2_500, 15_000, 100_000];

/** Gold required to upgrade from `level` to `level + 1`. Quadratic scaling. */
function upgradeCost(level: number): number {
  return level * level * 10;
}

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal reference kept per action button so enable/disable can be refreshed each tick. */
interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  activeColor: number;
}

// ── Scene ──────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  /** Single source of truth for all persistent game data. */
  private state: GameState = loadGame(PLOT_COUNT);

  private plotContainers: Phaser.GameObjects.Container[] = [];
  private uiContainers: Phaser.GameObjects.Container[] = [];
  private actionRefs: (ActionRef | null)[] = new Array(PLOT_COUNT + 1).fill(null); // +1 for road

  private roadGraphics!: Phaser.GameObjects.Graphics;
  private roadUiContainer!: Phaser.GameObjects.Container;

  private goldText!: Phaser.GameObjects.Text;
  private taxRateText!: Phaser.GameObjects.Text;
  private saveNotification!: Phaser.GameObjects.Text;

  /** Sky background rectangle — colour is updated each frame by the day/night tween. */
  private skyRect!: Phaser.GameObjects.Rectangle;

  /** Full-screen dark overlay that fades in at night. */
  private nightOverlay!: Phaser.GameObjects.Rectangle;

  /** 0 = full day, 1 = full night. Driven by the repeating tween counter. */
  private timeOfDay = 0;

  /** Current sun orbit angle in radians. PI/2 = noon at startup. */
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

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this.lights.enable();
    this.lights.setAmbientColor(0x888888);
    this.drawBackground();
    this.setupSun();
    this.roadGraphics = this.add.graphics();
    this.renderRoad();

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.plotContainers[i] = this.renderPlot(i);
    }

    this.drawPanelChrome();
    this.drawStatsBar();

    for (let i = 0; i < PLOT_COUNT; i++) {
      this.uiContainers[i] = this.renderUISection(i);
    }

    this.roadUiContainer = this.renderRoadUI();

    this.refreshButtons();
    this.updateStats();

    // Tax tick — every 100ms (1/10 of taxRate per tick = same per-second rate)
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: this.onTaxTick,
      callbackScope: this,
    });

    // Autosave — every 10 seconds
    this.time.addEvent({
      delay: 10_000,
      loop: true,
      callback: this.onAutosave,
      callbackScope: this,
    });

    // ── Day/night cycle ──────────────────────────────────────────────────────

    // Full-screen overlay at depth 50 (above buildings, below save notification)
    this.nightOverlay = this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0x000022
      )
      .setAlpha(0)
      .setDepth(50);

    // Fade the overlay in and out (0 = day, 0.55 = night), 2 min each way = 4 min full cycle
    this.tweens.add({
      targets: this.nightOverlay,
      alpha: 0.55,
      duration: 120_000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Drive timeOfDay value in sync so the sky colour can be interpolated
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 120_000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        this.timeOfDay = tween.getValue() ?? 0;
        this.updateSkyColour();
      },
    });

    // Sun orbit — linear full circle (no yoyo) so east/west rise/set are distinct
    this.tweens.addCounter({
      from: Math.PI / 2,
      to: Math.PI / 2 + Math.PI * 2,
      duration: 240_000,
      repeat: -1,
      ease: 'Linear',
      onUpdate: (tween): void => {
        this.sunAngle = tween.getValue() ?? Math.PI / 2;
        this.updateSun();
      },
    });

    // Save notification (created last so it sits above everything)
    this.saveNotification = this.add
      .text(this.scale.width - 12, 12, '✓ Saved successfully', {
        fontSize: '12px',
        color: '#88ffaa',
        backgroundColor: '#162416',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0)
      .setAlpha(0)
      .setDepth(100);
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

  // ── Layout helper ──────────────────────────────────────────────────────────

  private plotLeft(index: number): number {
    const totalWidth = PLOT_COUNT * PLOT_WIDTH + (PLOT_COUNT - 1) * PLOT_GAP;
    const startX = (this.scale.width - totalWidth) / 2;
    return startX + index * (PLOT_WIDTH + PLOT_GAP);
  }

  // ── Background ─────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { width, height } = this.scale;
    this.skyRect = this.add.rectangle(width / 2, GROUND_Y / 2, width, GROUND_Y, 0x4a7fb5);
    this.skyRect.setPipeline('Light2D'); // sky responds to the sun Phaser light
    // Gray ground strip removed — renderRoad() covers this band
    this.add.rectangle(width / 2, (PANEL_TOP + height) / 2, width, height - PANEL_TOP, 0x1e2433);
  }

  private drawPanelChrome(): void {
    const { width, height } = this.scale;
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x3a4a5a, 1);
    gfx.moveTo(0, PANEL_TOP).lineTo(width, PANEL_TOP).strokePath();
    gfx.moveTo(0, COL_TOP).lineTo(width, COL_TOP).strokePath();
    for (let i = 1; i < PLOT_COUNT; i++) {
      const x = i * SECTION_W;
      gfx.moveTo(x, COL_TOP).lineTo(x, height).strokePath();
    }
  }

  private drawStatsBar(): void {
    const { width } = this.scale;
    const midY = PANEL_TOP + STATS_BAR_H / 2;
    this.taxRateText = this.add
      .text(24, midY, '', { fontSize: '15px', color: '#88ccff' })
      .setOrigin(0, 0.5);
    this.goldText = this.add
      .text(width - 24, midY, '', { fontSize: '15px', color: '#ffd966' })
      .setOrigin(1, 0.5);
  }

  // ── Plot rendering ─────────────────────────────────────────────────────────

  private renderPlot(index: number): Phaser.GameObjects.Container {
    this.plotContainers[index]?.destroy();
    const x = this.plotLeft(index);
    const container = this.add.container(0, 0);
    if (this.state.plots[index].unlocked) {
      this.buildBuilding(container, x, this.state.plots[index].level);
    } else {
      this.buildEmptyPlot(container, x);
    }
    return container;
  }

  private buildBuilding(container: Phaser.GameObjects.Container, x: number, level: number): void {
    const w = PLOT_WIDTH;
    const h = this.buildingHeight(level);
    const top = GROUND_Y - h;

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

  /** Tier 1 — House (levels 1–15): narrow brick building with pitched roof and chimney. */
  private buildTier1House(
    container: Phaser.GameObjects.Container,
    x: number,
    w: number,
    h: number,
    top: number
  ): void {
    const gfx = this.add.graphics();

    // Narrower footprint — 80% of full width, centred on plot
    const bw = Math.round(w * 0.8);
    const bx = x + (w - bw) / 2;

    // Main brick body
    gfx.fillStyle(0xb5651d, 1);
    gfx.fillRect(bx, top, bw, h);

    // Pitched roof (triangle sitting on top of the body)
    const roofHeight = Math.round(bw * 0.45);
    gfx.fillStyle(0x7a3b10, 1);
    gfx.fillTriangle(
      bx - 4, top,               // bottom-left of roof
      bx + bw + 4, top,           // bottom-right of roof
      bx + bw / 2, top - roofHeight // apex
    );

    // Chimney (small rectangle poking above the roof on the right side)
    const chimneyW = Math.round(bw * 0.12);
    const chimneyH = Math.round(roofHeight * 0.6);
    const chimneyX = bx + Math.round(bw * 0.65);
    gfx.fillStyle(0x8b4513, 1);
    gfx.fillRect(chimneyX, top - roofHeight + Math.round(roofHeight * 0.3) - chimneyH, chimneyW, chimneyH);

    // Windows — two small squares in the lower half of the body
    const winSize = Math.round(bw * 0.18);
    const winY = top + Math.round(h * 0.45);
    const winSpacing = Math.round(bw * 0.28);
    const winBaseX = bx + Math.round((bw - winSpacing - winSize) / 2);
    gfx.fillStyle(0xffe8a0, 1);
    gfx.fillRect(winBaseX, winY, winSize, winSize);
    gfx.fillRect(winBaseX + winSpacing, winY, winSize, winSize);

    // Door — small rectangle at ground level centred
    const doorW = Math.round(bw * 0.22);
    const doorH = Math.round(h * 0.28);
    gfx.fillStyle(0x5c3317, 1);
    gfx.fillRect(bx + Math.round((bw - doorW) / 2), GROUND_Y - doorH, doorW, doorH);

    container.add(gfx);
  }

  /** Tier 2 — Low-rise apartment (levels 16–35): full-width sandy building with parapet and window rows. */
  private buildTier2Apartment(
    container: Phaser.GameObjects.Container,
    x: number,
    w: number,
    h: number,
    top: number
  ): void {
    const gfx = this.add.graphics();

    // Main body
    gfx.fillStyle(0xd4a96a, 1);
    gfx.fillRect(x, top, w, h);

    // Flat parapet strip at the very top
    const parapetH = 10;
    gfx.fillStyle(0xbf8c50, 1);
    gfx.fillRect(x, top, w, parapetH);

    // Window grid — 2 columns, rows determined by available height
    const winW = Math.round(w * 0.18);
    const winH = Math.round(winW * 1.5);
    const cols = 3;
    const hPad = Math.round(w / (cols + 1));
    const vSpacing = Math.round(h / 4);
    const rows = Math.max(2, Math.floor((h - parapetH - 20) / vSpacing));

    gfx.fillStyle(0x88aacc, 1);
    for (let row = 0; row < rows; row++) {
      const wy = top + parapetH + 16 + row * vSpacing;
      if (wy + winH > GROUND_Y - 8) continue;
      for (let col = 0; col < cols; col++) {
        const wx = x + hPad * (col + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }

    container.add(gfx);
  }

  /** Tier 3 — Mid-rise office (levels 36–65): full-width modern facade with floor lines and window grid. */
  private buildTier3Office(
    container: Phaser.GameObjects.Container,
    x: number,
    w: number,
    h: number,
    top: number
  ): void {
    const gfx = this.add.graphics();

    // Main body
    gfx.fillStyle(0x5a7a8a, 1);
    gfx.fillRect(x, top, w, h);

    // Thin horizontal floor lines
    const floorH = 22;
    const numFloors = Math.floor(h / floorH);
    gfx.lineStyle(1, 0x3d5a66, 1);
    for (let f = 1; f < numFloors; f++) {
      const ly = top + f * floorH;
      gfx.moveTo(x, ly).lineTo(x + w, ly).strokePath();
    }

    // Window grid — 4 columns per floor, leaving a margin each side
    const cols = 4;
    const winW = Math.round(w * 0.12);
    const winH = Math.round(floorH * 0.55);
    const hGap = Math.round(w / (cols + 1));

    gfx.fillStyle(0xaad4e8, 0.85);
    for (let f = 0; f < numFloors; f++) {
      const wy = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > GROUND_Y - 4) continue;
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }

    container.add(gfx);
  }

  /** Tier 4 — Skyscraper (levels 66–100): dark glass tower with dense window grid and antenna. */
  private buildTier4Skyscraper(
    container: Phaser.GameObjects.Container,
    x: number,
    w: number,
    h: number,
    top: number
  ): void {
    const gfx = this.add.graphics();

    // Main dark glass body
    gfx.fillStyle(0x1a2a3a, 1);
    gfx.fillRect(x, top, w, h);

    // Narrow antenna / spire on top
    const antennaW = 4;
    const antennaH = 24;
    gfx.fillStyle(0x8899aa, 1);
    gfx.fillRect(x + Math.round((w - antennaW) / 2), top - antennaH, antennaW, antennaH);

    // Dense window grid covering most of the facade
    const floorH = 16;
    const numFloors = Math.floor(h / floorH);
    const cols = 5;
    const winW = Math.round(w * 0.1);
    const winH = Math.round(floorH * 0.6);
    const hGap = Math.round(w / (cols + 1));

    for (let f = 0; f < numFloors; f++) {
      const wy = top + f * floorH + Math.round((floorH - winH) / 2);
      if (wy + winH > GROUND_Y - 4) continue;
      // Alternate row accent colours for the glassy look
      const isAccentRow = f % 3 === 0;
      gfx.fillStyle(0x88ccff, isAccentRow ? 0.55 : 0.25);
      for (let c = 0; c < cols; c++) {
        const wx = x + hGap * (c + 1) - winW / 2;
        gfx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      }
    }

    // Thin bright trim line at the very top of the body
    gfx.fillStyle(0x446688, 1);
    gfx.fillRect(x, top, w, 4);

    container.add(gfx);
  }

  private buildEmptyPlot(container: Phaser.GameObjects.Container, x: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a1b2e, 0.7);
    gfx.fillRect(x, GROUND_Y - PLOT_BASE_HEIGHT, PLOT_WIDTH, PLOT_BASE_HEIGHT);
    gfx.lineStyle(2, 0x3a3d5c, 1);
    gfx.strokeRect(x, GROUND_Y - PLOT_BASE_HEIGHT, PLOT_WIDTH, PLOT_BASE_HEIGHT);
    container.add(gfx);
  }

  // ── Day/night helpers ──────────────────────────────────────────────────────

  private updateSkyColour(): void {
    const dayColour = 0x4a7fb5;
    const nightColour = 0x0a0a1a;
    this.skyRect.setFillStyle(lerpColor(dayColour, nightColour, this.timeOfDay));
  }

  // ── Sun & lighting ─────────────────────────────────────────────────────────

  private setupSun(): void {
    const { width } = this.scale;
    const cx = width / 2;

    // Moon — shows on the opposite side of the sky from the sun
    this.moonCircle = this.add.arc(cx, GROUND_Y, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(1);

    // Sun rays — drawn behind the sun disc
    this.sunRaysGfx = this.add.graphics().setDepth(2);

    // Sun glow halo
    this.sunGlowArc = this.add.arc(cx, 100, 44, 0, 360, false, 0xffe066, 0.3).setDepth(3);

    // Sun disc — bright core
    this.sunCircle = this.add.arc(cx, 100, 20, 0, 360, false, 0xfff8aa, 1).setDepth(4);

    // Elliptical pool of light on the ground below the sun
    this.sunGroundGlow = this.add.ellipse(cx, GROUND_Y + 6, 340, 28, 0xfffae0, 0).setDepth(5);

    // Phaser point light — large enough to cover the full scene width
    this.sunLight = this.lights.addLight(cx, 100, 960, 0xffeeaa, 3.2);

    this.updateSun();
  }

  private updateSun(): void {
    const a = this.sunAngle;
    const { width } = this.scale;
    const cx = width / 2;
    const orbitRadius = 350;

    const elevation = Math.sin(a); // 1 = noon overhead, 0 = horizon, −1 = midnight
    const sunX = cx - Math.cos(a) * cx * 0.7; // east → centre → west arc
    const sunY = GROUND_Y - elevation * orbitRadius;
    const sunAbove = elevation > 0.02;

    // Moon on the opposite side of the orbit
    const moonElev = Math.sin(a + Math.PI);
    const moonX = cx - Math.cos(a + Math.PI) * cx * 0.7;
    const moonY = GROUND_Y - moonElev * orbitRadius;

    this.sunCircle.setPosition(sunX, sunY).setVisible(sunAbove);
    this.sunGlowArc.setPosition(sunX, sunY).setVisible(sunAbove);
    this.moonCircle.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.drawSunRays(sunX, sunY, sunAbove);

    // Ground light pool — wider and brighter when the sun is high
    this.sunGroundGlow
      .setPosition(sunX, GROUND_Y + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    // Move the Phaser point light and scale intensity with sun elevation
    this.sunLight.x = sunX;
    this.sunLight.y = sunY;
    this.sunLight.intensity = Math.max(0, elevation * 3.2);

    // Ambient light: bright grey at noon, near-black at midnight
    const amb = Math.max(0.08, elevation * 0.55 + 0.14);
    const av = Math.round(amb * 255);
    this.lights.setAmbientColor((av << 16) | (av << 8) | av);
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

    const container = this.add.container(0, 0);
    const cx = index * SECTION_W + SECTION_W / 2;
    const plot = this.state.plots[index];

    container.add(
      this.add
        .text(cx, COL_TOP + 18, `Building ${index + 1}`, { fontSize: '14px', color: '#8899aa' })
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
        .text(cx, COL_TOP + 48, `Level ${plot.level} / ${MAX_LEVEL}`, {
          fontSize: '13px',
          color: '#ddeeff',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, COL_TOP + 64, `Earns: ${fmt(perBuildingIncome(plot.level))}/s`, {
          fontSize: '11px',
          color: '#88ddaa',
        })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, COL_TOP + 82, atMax ? '' : `Cost: ${fmt(cost)}`, {
          fontSize: '12px',
          color: '#99aabb',
        })
        .setOrigin(0.5)
    );

    const btn = this.add
      .rectangle(cx, COL_TOP + 104, 130, 30, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(cx, COL_TOP + 104, atMax ? 'Max Level' : '▲ Upgrade', {
          fontSize: '13px',
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
        .text(cx, COL_TOP + 48, '🔒  Locked', { fontSize: '13px', color: '#555566' })
        .setOrigin(0.5)
    );

    container.add(
      this.add
        .text(cx, COL_TOP + 72, `Cost: ${fmt(cost)}`, { fontSize: '12px', color: '#99aabb' })
        .setOrigin(0.5)
    );

    const btn = this.add
      .rectangle(cx, COL_TOP + 104, 130, 30, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(cx, COL_TOP + 104, 'Unlock', { fontSize: '13px', color: '#e8ffe8' })
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

  /** Returns the upgrade cost for the road given its current level. */
  private roadUpgradeCost(): number {
    const lvl = this.state.road.level;
    return lvl === 0 ? 200 : lvl * lvl * 50;
  }

  /** Redraws the road strip at GROUND_Y based on current road level. */
  private renderRoad(): void {
    const gfx = this.roadGraphics;
    gfx.clear();
    const { width } = this.scale;
    const level = this.state.road.level;

    if (level === 0) {
      // Plain gray ground strip (original look before any road is built)
      gfx.fillStyle(0x555e6b, 1);
      gfx.fillRect(0, GROUND_Y, width, 20);
      return;
    }

    if (level <= 2) {
      // Dirt track — brown, 24px tall with scattered pebble dots
      const roadH = 24;
      gfx.fillStyle(0x6b4c2a, 1);
      gfx.fillRect(0, GROUND_Y, width, roadH);
      gfx.fillStyle(0x8a6040, 1);
      for (let px = 10; px < width; px += 28) {
        gfx.fillCircle(px, GROUND_Y + 8, 2);
        gfx.fillCircle(px + 14, GROUND_Y + 16, 2);
      }
      return;
    }

    if (level <= 4) {
      // Gravel road — darker gray, 28px tall with speckles
      const roadH = 28;
      gfx.fillStyle(0x555555, 1);
      gfx.fillRect(0, GROUND_Y, width, roadH);
      gfx.fillStyle(0x6e6e6e, 1);
      for (let px = 5; px < width; px += 18) {
        gfx.fillRect(px, GROUND_Y + 6, 3, 2);
        gfx.fillRect(px + 9, GROUND_Y + 18, 3, 2);
      }
      return;
    }

    if (level <= 6) {
      // Paved road — asphalt, 32px tall, white dashed centre line
      const roadH = 32;
      const midY = GROUND_Y + roadH / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, GROUND_Y, width, roadH);
      gfx.fillStyle(0xffffff, 1);
      for (let px = 0; px < width; px += 34) {
        gfx.fillRect(px, midY - 1, 20, 2);
      }
      return;
    }

    if (level <= 8) {
      // Two-lane road — asphalt, 36px tall, solid edge lines + dashed centre
      const roadH = 36;
      const midY = GROUND_Y + roadH / 2;
      gfx.fillStyle(0x333333, 1);
      gfx.fillRect(0, GROUND_Y, width, roadH);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, GROUND_Y + 2, width, 2);
      gfx.fillRect(0, GROUND_Y + roadH - 4, width, 2);
      for (let px = 0; px < width; px += 34) {
        gfx.fillRect(px, midY - 1, 20, 2);
      }
      return;
    }

    // Level 9–10 — Highway: darkest asphalt, 40px tall, 3 dashed lane dividers, yellow edge lines
    const roadH = 40;
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(0, GROUND_Y, width, roadH);
    // Yellow edge lines
    gfx.fillStyle(0xffd700, 1);
    gfx.fillRect(0, GROUND_Y + 2, width, 2);
    gfx.fillRect(0, GROUND_Y + roadH - 4, width, 2);
    // Three white dashed lane dividers
    gfx.fillStyle(0xffffff, 1);
    for (const frac of [0.25, 0.5, 0.75]) {
      const dy = Math.round(GROUND_Y + roadH * frac) - 1;
      for (let px = 0; px < width; px += 34) {
        gfx.fillRect(px, dy, 20, 2);
      }
    }
  }

  // ── Road UI ────────────────────────────────────────────────────────────────

  /** Display name for the current road tier. */
  private roadTierName(): string {
    const lvl = this.state.road.level;
    if (lvl === 0) return 'None';
    if (lvl <= 2) return 'Dirt Track';
    if (lvl <= 4) return 'Gravel';
    if (lvl <= 6) return 'Paved';
    if (lvl <= 8) return 'Two-Lane';
    return 'Highway';
  }

  /** Creates (or re-creates) the road upgrade button in the stats bar. */
  private renderRoadUI(): Phaser.GameObjects.Container {
    this.roadUiContainer?.destroy();
    // Clear the road action ref slot (index PLOT_COUNT)
    this.actionRefs[PLOT_COUNT] = null;

    const container = this.add.container(0, 0);
    const { width } = this.scale;
    const midY = PANEL_TOP + STATS_BAR_H / 2;
    const atMax = this.state.road.level >= 10;
    const cost = this.roadUpgradeCost();

    // Centred label showing tier name
    container.add(
      this.add
        .text(width / 2, midY - 10, `Road: ${this.roadTierName()}`, {
          fontSize: '12px',
          color: '#aabbcc',
        })
        .setOrigin(0.5, 0.5)
    );

    const btnW = 180;
    const btn = this.add
      .rectangle(width / 2, midY + 10, btnW, 22, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      this.add
        .text(
          width / 2,
          midY + 10,
          atMax ? 'Road: Max Level' : `▲ Road Lv ${this.state.road.level + 1}  ${fmt(cost)}`,
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

/** Per-building income with diminishing returns: level^0.75 * 10, floored. */
function perBuildingIncome(level: number): number {
  return Math.floor(Math.pow(level, 0.75) * 10);
}


/** Linearly interpolate between two packed RGB colours. */
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
