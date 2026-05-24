import Phaser from 'phaser';
import { type GameState, type PlotState, clearSave, defaultState, loadGame, saveGame } from '../game/GameState';
import {
  PLOT_COUNT, MAX_LEVEL, UI_HEIGHT, STATS_BAR_H, ROAD_H, VERGE_H, RIVER_H, YARD_H,
  UNLOCK_COSTS,
  upgradeCost, buildingHeight, perBuildingIncome, lerpColor, sunColorAtElevation, fmt,
} from '../constants';
import { createBuilding, EmptyPlot } from '../buildings';
import { Sky } from '../objects/Sky';

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
  private vergeRiverGraphics!: Phaser.GameObjects.Graphics;
  private buildingShadowGfx!: Phaser.GameObjects.Graphics;
  private panelChromeGfx!: Phaser.GameObjects.Graphics;

  private roadUiContainer!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private taxRateText!: Phaser.GameObjects.Text;
  private saveNotification!: Phaser.GameObjects.Text;

  // Sky manager: owns skyGfx (rebuilt on layout) + nightOverlay (persistent tween target)
  private sky!: Sky;
  // Panel background — destroyed and recreated on resize
  private panelBg!: Phaser.GameObjects.Rectangle;

  // Dev panel
  private devPanelContainer!: Phaser.GameObjects.Container;
  private clockText?: Phaser.GameObjects.Text;

  // Single master clock — all day/night visuals derive from this + timeOffsetMs
  private masterClock!: Phaser.Tweens.Tween;
  private timeOffsetMs: number = 0;

  private sunAngle: number = Math.PI / 2;
  private sunCircle!: Phaser.GameObjects.Arc;
  private moonCircle!: Phaser.GameObjects.Arc;
  private sunGlowSprite!: Phaser.GameObjects.Image;
  private sunGroundGlow!: Phaser.GameObjects.Ellipse;
  private sunLight!: Phaser.GameObjects.Light;

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

    // Persistent graphics layers — depth-ordered, never destroyed
    this.vergeRiverGraphics = this.add.graphics().setDepth(6);
    this.roadGraphics       = this.add.graphics().setDepth(7);
    this.buildingShadowGfx  = this.add.graphics().setDepth(9.5);
    this.panelChromeGfx     = this.add.graphics().setDepth(10);

    // Sky manager — creates nightOverlay (persistent) and initial skyGfx
    this.sky = new Sky(this);

    // Build all layout-dependent visuals
    this.buildLayout();

    // Sun/moon objects — created once after layout (sun reads groundY)
    this.setupSun();

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

    // Sky rebuild: destroys old skyGfx and creates a fresh one at depth 0
    this.sky.rebuild();

    this.panelBg?.destroy();
    this.panelBg = this.add
      .rectangle(width / 2, (this.panelTop + height) / 2, width, height - this.panelTop, 0x1e2433)
      .setDepth(1);

    this.renderRoad();
    this.renderVergeAndRiver();

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
    this.updateSun();
  }

  // ── Resize handler ─────────────────────────────────────────────────────────

  private onResize(): void {
    const { width, height } = this.scale;

    this.sky.resize(width, height);
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

    const row1Y = 16;
    const row2Y = 42;
    container.add(this.add.rectangle(width / 2, 29, width, 58, 0x000000, 0.6));

    const btnW  = 120;
    const gap   = 8;
    const leftX = (width - btnW * 2 - gap) / 2 + btnW / 2;
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
    const elapsed  = ((this.masterClock?.getValue() ?? 0) + this.timeOffsetMs) % 240_000;
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
    this.updateSun();
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

  // ── Day/night: sun & lighting ──────────────────────────────────────────────

  private setupSun(): void {
    const { width } = this.scale;
    const cx = width / 2;

    // Glow texture: opaque Gaussian from white (centre) → black (edge).
    // Black pixels add nothing in ADD blend mode, bypassing premultiplied-alpha
    // banding. 30 stops trace a smooth Gaussian so there are no visible kinks.
    const texSize   = 512;
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width  = texSize;
    glowCanvas.height = texSize;
    const ctx2d = glowCanvas.getContext('2d')!;
    const half  = texSize / 2;
    const grad  = ctx2d.createRadialGradient(half, half, 0, half, half, half);
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const v = Math.round(Math.exp(-t * t * 7) * 255);
      grad.addColorStop(t, `rgb(${v},${v},${v})`);
    }
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, texSize, texSize);
    this.textures.addCanvas('sun-glow', glowCanvas);

    this.moonCircle    = this.add.arc(cx, this.groundY, 16, 0, 360, false, 0xd0d0e8, 1).setDepth(2);
    this.sunGlowSprite = this.add.image(cx, 80, 'sun-glow')
      .setDisplaySize(300, 300)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3);
    this.sunCircle     = this.add.arc(cx, 80, 20, 0, 360, false, 0xfff8aa, 1).setDepth(5);
    this.sunGroundGlow = this.add
      .ellipse(cx, this.groundY + 6, Math.round(width * 0.5), 22, 0xfffae0, 0)
      .setDepth(6);
    this.sunLight = this.lights.addLight(cx, 80, Math.max(800, width * 2), 0xffeeaa, 3.2);
  }

  private updateSun(): void {
    if (!this.sunCircle) return;
    const a = this.sunAngle;
    const { width } = this.scale;
    const cx     = width / 2;
    const orbitX = width * 0.95;
    const orbitY = Math.round(this.groundY * 0.90);

    const elevation = Math.sin(a);
    const sunX      = cx - Math.cos(a) * orbitX;
    const sunY      = this.groundY - elevation * orbitY;
    const sunAbove  = elevation > 0.02;

    const moonElev = Math.sin(a + Math.PI);
    const moonX    = cx - Math.cos(a + Math.PI) * orbitX;
    const moonY    = this.groundY - moonElev * orbitY;

    this.sunCircle.setPosition(sunX, sunY).setVisible(sunAbove);
    this.moonCircle.setPosition(moonX, moonY).setVisible(moonElev > 0.02);
    this.sunGlowSprite.setPosition(sunX, sunY).setVisible(sunAbove);

    this.sunGroundGlow
      .setPosition(sunX, this.groundY + 6)
      .setVisible(sunAbove)
      .setAlpha(Math.max(0, elevation * 0.22));

    this.sunLight.x         = sunX;
    this.sunLight.y         = sunY;
    this.sunLight.intensity = Math.max(0, elevation * 3.2);

    const sunColor = sunColorAtElevation(elevation);
    this.sunCircle.setFillStyle(sunColor);
    this.sunGlowSprite.setTint(sunColor);
    this.sunLight.setColor(sunColor);

    const ambMin  = elevation >= 0 ? Math.max(0.08, 0.28 - elevation) : 0.08;
    const amb     = Math.max(ambMin, elevation * 0.55 + 0.14);
    const ambTint = lerpColor(0xff8833, 0xffffff, Math.min(1, elevation * 3));
    const ar = Math.round(((ambTint >> 16) & 0xff) * amb);
    const ag = Math.round(((ambTint >> 8)  & 0xff) * amb);
    const ab = Math.round( (ambTint        & 0xff) * amb);
    this.lights.setAmbientColor((ar << 16) | (ag << 8) | ab);

    this.drawBuildingShadows(a, elevation);
  }

  /**
   * Draws soft ground shadows using parallel sun rays with multi-sample
   * penumbra simulation. NUM_SAMPLES point lights are spread across the
   * sun disc; each casts a shadow at 1/N alpha. Overlapping umbra regions
   * reach full alpha while penumbra edges appear softer.
   */
  private drawBuildingShadows(sunAngle: number, elevation: number): void {
    const gfx = this.buildingShadowGfx;
    gfx.clear();
    if (elevation <= 0.02) return;

    const totalAlpha = Math.min(0.99, elevation * 1.26 + 0.18);

    const maxShadow   = ROAD_H + VERGE_H + RIVER_H;
    const shadowExtent = Math.max(6, maxShadow * Math.pow(1 - elevation, 0.5));
    const shadBot      = Math.min(this.groundY + shadowExtent, this.panelTop);

    const NUM_SAMPLES  = 11;
    const DISC_SPREAD  = 0.10;
    const MAX_LEAN_RATIO = Math.cos(0.35) / Math.sin(0.35);

    for (let s = 0; s < NUM_SAMPLES; s++) {
      const t      = (s / (NUM_SAMPLES - 1)) - 0.5;
      const sAngle = sunAngle + t * DISC_SPREAD;
      const sElev  = Math.sin(sAngle);
      const sHoriz = Math.cos(sAngle);
      if (sElev <= 0.01) continue;

      const leanRate = Math.max(-MAX_LEAN_RATIO, Math.min(MAX_LEAN_RATIO, sHoriz / sElev));
      gfx.fillStyle(0x000022, totalAlpha / NUM_SAMPLES);

      for (let i = 0; i < PLOT_COUNT; i++) {
        const plot = this.state.plots[i];
        if (!plot.unlocked) continue;

        const x  = this.plotLeft(i);
        const w  = this.plotWidth;
        const h  = buildingHeight(plot.level);
        const bw = plot.level <= 15 ? Math.round(w * 0.82) : w;
        const bx = plot.level <= 15 ? x + Math.round((w - bw) / 2) : x;

        if (plot.level <= 15) {
          const buildGY  = this.groundY - YARD_H;
          const roofHVal = Math.round(bw * 0.42);
          const mid      = bx + Math.round(bw / 2);
          const lean     = leanRate * (shadowExtent + YARD_H);

          const p1x = bx,            p1y = buildGY;
          const p2x = bx + bw,       p2y = buildGY;
          const p3x = bx + bw + lean, p3y = shadBot;
          const p4x = bx + lean,      p4y = shadBot;

          gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
          gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);

          const peakShadX = mid + leanRate * (shadowExtent + YARD_H + h + roofHVal);
          if (leanRate >= 0 && peakShadX > p3x) {
            gfx.fillTriangle(p2x, p2y, p3x, p3y, peakShadX, shadBot);
          } else if (leanRate < 0 && peakShadX < p4x) {
            gfx.fillTriangle(p1x, p1y, p4x, p4y, peakShadX, shadBot);
          }
        } else {
          const lean = leanRate * shadowExtent;
          const p1x = bx,            p1y = this.groundY;
          const p2x = bx + bw,       p2y = this.groundY;
          const p3x = bx + bw + lean, p3y = shadBot;
          const p4x = bx + lean,      p4y = shadBot;

          gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
          gfx.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y);
        }
      }
    }
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

  // ── Road rendering ─────────────────────────────────────────────────────────

  private roadUpgradeCost(): number {
    const lvl = this.state.road.level;
    return lvl === 0 ? 200 : lvl * lvl * 50;
  }

  private renderRoad(): void {
    const gfx   = this.roadGraphics;
    gfx.clear();
    const { width } = this.scale;
    const level = this.state.road.level;
    const gy    = this.groundY;

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
    // Level 9–10: Highway
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

  private renderVergeAndRiver(): void {
    const gfx    = this.vergeRiverGraphics;
    gfx.clear();
    const { width } = this.scale;
    const vergeY = this.groundY + ROAD_H;
    const riverY = vergeY + VERGE_H;

    gfx.fillStyle(0x4a8c3a, 1);
    gfx.fillRect(0, vergeY, width, VERGE_H);

    gfx.fillStyle(0x2a6ab5, 1);
    gfx.fillRect(0, riverY, width, RIVER_H);
  }

  // ── Road UI ────────────────────────────────────────────────────────────────

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
