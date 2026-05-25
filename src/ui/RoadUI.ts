import Phaser from 'phaser';
import { type RoadState } from '../game/GameState';
import { ROAD_BAR_H, fmt, UI_FONT, MONO_FONT } from '../constants';

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  drawNormal: () => void;
  drawDisabled: () => void;
  isHovered: () => boolean;
}

export class RoadUI {
  readonly container: Phaser.GameObjects.Container;
  private roadActionRef: ActionRef | null = null;

  constructor(
    scene: Phaser.Scene,
    road: RoadState,
    rowTop: number,
    width: number,
    onUpgrade: () => void,
  ) {
    const container = scene.add.container(0, 0).setDepth(11);
    const sectionW  = width / 3;

    this.buildRoadSection(scene, container, sectionW * 0.5, rowTop, sectionW, road, onUpgrade);
    this.buildPlaceholderSection(scene, container, sectionW * 1.5, rowTop, sectionW, 'VERGE');
    this.buildPlaceholderSection(scene, container, sectionW * 2.5, rowTop, sectionW, 'WATER');

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
    const cost  = this.roadUpgradeCost(road.level);
    const btnW  = Math.min(sectionW - 24, 200);
    const btnH  = 24;
    const btnY  = rowTop + 34;

    container.add(
      scene.add
        .text(cx, rowTop + 11, 'ROAD', { fontSize: '10px', color: '#4a5a6a', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );
    container.add(
      scene.add
        .text(cx, rowTop + 25, this.roadTierName(road.level), { fontSize: '11px', color: '#88aacc', fontFamily: UI_FONT })
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

  private buildPlaceholderSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    rowTop: number,
    sectionW: number,
    label: string,
  ): void {
    const btnW = Math.min(sectionW - 24, 200);
    const btnH = 24;
    const btnY = rowTop + 34;

    container.add(
      scene.add
        .text(cx, rowTop + 11, label, { fontSize: '10px', color: '#3a4a3a', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );
    container.add(
      scene.add
        .text(cx, rowTop + 25, '–', { fontSize: '11px', color: '#334433', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );

    const btnGfx = scene.add.graphics();
    btnGfx.fillStyle(0x0e140e, 1);
    btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 4);
    container.add(btnGfx);

    container.add(
      scene.add
        .text(cx, btnY + btnH / 2, 'Coming Soon', { fontSize: '10px', color: '#2a3a2a', fontFamily: UI_FONT })
        .setOrigin(0.5)
    );
  }

  private roadUpgradeCost(level: number): number {
    return level === 0 ? 200 : level * level * 50;
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
    if (!this.roadActionRef) return;
    const canAfford = gold >= this.roadActionRef.getCost();
    if (canAfford) {
      this.roadActionRef.btn.setInteractive({ useHandCursor: true });
      if (!this.roadActionRef.isHovered()) this.roadActionRef.drawNormal();
    } else {
      this.roadActionRef.btn.disableInteractive();
      this.roadActionRef.drawDisabled();
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
