import Phaser from 'phaser';
import { type RoadState, type VergeState, type WaterState } from '../game/GameState';
import {
  ROAD_BAR_H, MAX_VERGE_LEVEL, MAX_WATER_LEVEL,
  fmt, UI_FONT, MONO_FONT,
  roadUpgradeCost,
  vergeTierName, vergeUpgradeCost,
  waterTierName, waterUpgradeCost,
} from '../constants';

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  drawNormal: () => void;
  drawDisabled: () => void;
  isHovered: () => boolean;
}

export class RoadUI {
  readonly container: Phaser.GameObjects.Container;
  private roadActionRef:  ActionRef | null = null;
  private vergeActionRef: ActionRef | null = null;
  private waterActionRef: ActionRef | null = null;

  constructor(
    scene: Phaser.Scene,
    road: RoadState,
    verge: VergeState,
    water: WaterState,
    rowTop: number,
    width: number,
    onRoadUpgrade: () => void,
    onVergeUpgrade: () => void,
    onWaterUpgrade: () => void,
  ) {
    const container = scene.add.container(0, 0).setDepth(11);
    const sectionW  = width / 3;

    this.buildRoadSection(scene, container, sectionW * 0.5, rowTop, sectionW, road, onRoadUpgrade);
    this.buildVergeSection(scene, container, sectionW * 1.5, rowTop, sectionW, verge, onVergeUpgrade);
    this.buildWaterSection(scene, container, sectionW * 2.5, rowTop, sectionW, water, onWaterUpgrade);

    // Subtle vertical dividers between sections
    const divGfx = scene.add.graphics();
    divGfx.lineStyle(1, 0x2a3a4a, 1);
    divGfx.moveTo(sectionW,     rowTop + 6).lineTo(sectionW,     rowTop + ROAD_BAR_H - 6).strokePath();
    divGfx.moveTo(sectionW * 2, rowTop + 6).lineTo(sectionW * 2, rowTop + ROAD_BAR_H - 6).strokePath();
    container.add(divGfx);

    this.container = container;
  }

  private buildRoadSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    rowTop: number,
    sectionW: number,
    road: RoadState,
    onUpgrade: () => void,
  ): void {
    const atMax = road.level >= 10;
    const cost  = roadUpgradeCost(road.level);
    const btnW  = Math.min(sectionW - 24, 200);
    const btnH  = 34;
    const btnY  = rowTop + 24;

    container.add(
      scene.add
        .text(cx, rowTop + 13, this.roadTierName(road.level), { fontSize: '11px', color: '#88aacc', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );

    const btnGfx = scene.add.graphics();

    if (atMax) {
      btnGfx.fillStyle(0x111820, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      container.add(btnGfx);
      container.add(
        scene.add
          .text(cx, btnY + btnH / 2, 'MAX', { fontSize: '10px', color: '#334455', fontFamily: UI_FONT })
          .setOrigin(0.5)
      );
      return;
    }

    const drawNormal = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0d1f3a, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x2a65aa, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawHover = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x183860, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x3a88cc, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawDisabled = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0e1420, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
    };

    drawNormal();
    container.add(btnGfx);

    const btn = scene.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, btnY + btnH / 2, `▲  Lv ${road.level + 1}   ${fmt(cost)}`, {
          fontSize: '11px', color: '#88c4f0', fontFamily: MONO_FONT,
        })
        .setOrigin(0.5)
    );

    let hovered = false;
    btn.on('pointerover', () => { hovered = true;  drawHover(); });
    btn.on('pointerout',  () => { hovered = false; drawNormal(); });
    btn.on('pointerdown', onUpgrade);

    this.roadActionRef = { btn, getCost: () => cost, drawNormal, drawDisabled, isHovered: () => hovered };
  }

  private buildVergeSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    rowTop: number,
    sectionW: number,
    verge: VergeState,
    onUpgrade: () => void,
  ): void {
    const atMax = verge.level >= MAX_VERGE_LEVEL;
    const cost  = vergeUpgradeCost(verge.level);
    const btnW  = Math.min(sectionW - 24, 200);
    const btnH  = 34;
    const btnY  = rowTop + 24;

    container.add(
      scene.add
        .text(cx, rowTop + 13, vergeTierName(verge.level), { fontSize: '11px', color: '#88cc88', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );

    const btnGfx = scene.add.graphics();

    if (atMax) {
      btnGfx.fillStyle(0x111811, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      container.add(btnGfx);
      container.add(
        scene.add
          .text(cx, btnY + btnH / 2, 'MAX', { fontSize: '10px', color: '#334433', fontFamily: UI_FONT })
          .setOrigin(0.5)
      );
      return;
    }

    const drawNormal = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0d2010, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x2a7a2a, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawHover = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x183820, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x3aaa3a, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawDisabled = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0e1410, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
    };

    drawNormal();
    container.add(btnGfx);

    const btn = scene.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, btnY + btnH / 2, `▲  Lv ${verge.level + 1}   ${fmt(cost)}`, {
          fontSize: '11px', color: '#88f0a0', fontFamily: MONO_FONT,
        })
        .setOrigin(0.5)
    );

    let hovered = false;
    btn.on('pointerover', () => { hovered = true;  drawHover(); });
    btn.on('pointerout',  () => { hovered = false; drawNormal(); });
    btn.on('pointerdown', onUpgrade);

    this.vergeActionRef = { btn, getCost: () => cost, drawNormal, drawDisabled, isHovered: () => hovered };
  }

  private buildWaterSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    rowTop: number,
    sectionW: number,
    water: WaterState,
    onUpgrade: () => void,
  ): void {
    const atMax = water.level >= MAX_WATER_LEVEL;
    const cost  = waterUpgradeCost(water.level);
    const btnW  = Math.min(sectionW - 24, 200);
    const btnH  = 34;
    const btnY  = rowTop + 24;

    container.add(
      scene.add
        .text(cx, rowTop + 13, waterTierName(water.level), { fontSize: '11px', color: '#88ccee', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );

    const btnGfx = scene.add.graphics();

    if (atMax) {
      btnGfx.fillStyle(0x111820, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      container.add(btnGfx);
      container.add(
        scene.add
          .text(cx, btnY + btnH / 2, 'MAX', { fontSize: '10px', color: '#334455', fontFamily: UI_FONT })
          .setOrigin(0.5)
      );
      return;
    }

    const drawNormal = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0a1f30, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x2a7aaa, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawHover = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x163850, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
      btnGfx.fillStyle(0x3aaace, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 4, tr: 4, bl: 0, br: 0 });
    };
    const drawDisabled = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0e1820, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
    };

    drawNormal();
    container.add(btnGfx);

    const btn = scene.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, btnY + btnH / 2, `▲  Lv ${water.level + 1}   ${fmt(cost)}`, {
          fontSize: '11px', color: '#88d8f8', fontFamily: MONO_FONT,
        })
        .setOrigin(0.5)
    );

    let hovered = false;
    btn.on('pointerover', () => { hovered = true;  drawHover(); });
    btn.on('pointerout',  () => { hovered = false; drawNormal(); });
    btn.on('pointerdown', onUpgrade);

    this.waterActionRef = { btn, getCost: () => cost, drawNormal, drawDisabled, isHovered: () => hovered };
  }

  private roadTierName(level: number): string {
    if (level === 0) return 'None';
    if (level <= 2)  return 'Dirt Track';
    if (level <= 4)  return 'Gravel';
    if (level <= 6)  return 'Paved';
    if (level <= 8)  return 'Two-Lane';
    return 'Highway';
  }

  refresh(gold: number): void {
    for (const ref of [this.roadActionRef, this.vergeActionRef, this.waterActionRef]) {
      if (!ref) continue;
      const canAfford = gold >= ref.getCost();
      if (canAfford) {
        ref.btn.setInteractive({ useHandCursor: true });
        if (!ref.isHovered()) ref.drawNormal();
      } else {
        ref.btn.disableInteractive();
        ref.drawDisabled();
      }
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
