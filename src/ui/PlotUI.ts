import Phaser from 'phaser';
import { type PlotState } from '../game/GameState';
import { MAX_LEVEL, UNLOCK_COSTS, upgradeCost, perBuildingIncome, fmtBalance, fmtRate, UI_FONT, MONO_FONT, GAME_HOUR_FACTOR } from '../constants';

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  drawNormal: () => void;
  drawHover: () => void;
  drawDisabled: () => void;
  drawPressed: () => void;
  isHovered: () => boolean;
}

export class PlotUI {
  readonly container: Phaser.GameObjects.Container;
  actionRef: ActionRef | null = null;
  private readonly scene: Phaser.Scene;
  private prevCanAfford = true;

  constructor(
    scene: Phaser.Scene,
    index: number,
    plot: PlotState,
    sectionW: number,
    colTop: number,
    onUpgrade: () => void,
    onUnlock: () => void,
    isNextUnlockable: boolean = false,
  ) {
    this.scene = scene;
    const container = scene.add.container(0, 0).setDepth(11);
    const cx = index * sectionW + sectionW / 2;

    // Plot header
    container.add(
      scene.add
        .text(cx, colTop + 13, `PLOT ${index + 1}`, {
          fontSize: '10px', color: '#4a5a6a', fontFamily: UI_FONT,
        })
        .setOrigin(0.5)
    );

    if (plot.unlocked) {
      this.buildUpgradeSection(scene, container, cx, colTop, sectionW, index, plot, onUpgrade);
    } else {
      this.buildUnlockSection(scene, container, cx, colTop, sectionW, index, onUnlock, isNextUnlockable);
    }

    this.container = container;
  }

  private buildUpgradeSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    colTop: number,
    sectionW: number,
    buildingIndex: number,
    plot: PlotState,
    onUpgrade: () => void,
  ): void {
    const atMax = plot.level >= MAX_LEVEL;
    const cost  = upgradeCost(plot.level, buildingIndex);
    const btnW  = sectionW - 12;
    const btnH  = 50;
    const btnY  = colTop + 78;

    // ── Level badge ───────────────────────────────────────────────────────────
    const badgeW = 54, badgeH = 20, badgeY = colTop + 26;
    const badgeGfx = scene.add.graphics();
    badgeGfx.fillStyle(0x0a1828, 1);
    badgeGfx.fillRoundedRect(cx - badgeW / 2, badgeY, badgeW, badgeH, 4);
    badgeGfx.fillStyle(0x2a60b0, 1);
    badgeGfx.fillRoundedRect(cx - badgeW / 2, badgeY, 2, badgeH, { tl: 4, bl: 4, tr: 0, br: 0 });
    container.add(badgeGfx);

    container.add(
      scene.add
        .text(cx + 2, badgeY + badgeH / 2, `LV ${plot.level}`, {
          fontSize: '11px', color: '#6ab4e8', fontFamily: UI_FONT, fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    // ── Income ────────────────────────────────────────────────────────────────
    container.add(
      scene.add
        .text(cx, colTop + 58, `↑  ${fmtRate(perBuildingIncome(plot.level) * GAME_HOUR_FACTOR)}`, {
          fontSize: '11px', color: '#44bb88', fontFamily: MONO_FONT,
        })
        .setOrigin(0.5)
    );

    // ── Button ────────────────────────────────────────────────────────────────
    const btnGfx = scene.add.graphics();

    if (atMax) {
      btnGfx.fillStyle(0x111820, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
      container.add(btnGfx);
      container.add(
        scene.add
          .text(cx, btnY + btnH / 2, 'MAX LEVEL', {
            fontSize: '10px', color: '#334455', fontFamily: UI_FONT,
          })
          .setOrigin(0.5)
      );
      return;
    }

    const drawNormal = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0d1f3a, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
      btnGfx.fillStyle(0x2a65aa, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      btnGfx.fillStyle(0xffffff, 0.06);
      btnGfx.fillRoundedRect(cx - btnW / 2 + 1, btnY + 3, btnW - 2, Math.floor(btnH * 0.44), { tl: 4, tr: 4, bl: 0, br: 0 });
      btnGfx.fillStyle(0x000000, 0.28);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + btnH - 3, btnW, 3, { tl: 0, tr: 0, bl: 5, br: 5 });
    };
    const drawHover = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x183860, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
      btnGfx.fillStyle(0x3a88cc, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      btnGfx.fillStyle(0xffffff, 0.08);
      btnGfx.fillRoundedRect(cx - btnW / 2 + 1, btnY + 3, btnW - 2, Math.floor(btnH * 0.44), { tl: 4, tr: 4, bl: 0, br: 0 });
      btnGfx.fillStyle(0x000000, 0.2);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + btnH - 3, btnW, 3, { tl: 0, tr: 0, bl: 5, br: 5 });
    };
    const drawDisabled = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0e1420, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
    };
    const drawPressed = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0a1424, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + 2, btnW, btnH - 2, 5);
      btnGfx.fillStyle(0x000000, 0.35);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + 2, btnW, 3, { tl: 5, tr: 5, bl: 0, br: 0 });
    };

    drawNormal();
    container.add(btnGfx);

    const btn = scene.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, btnY + 15, '▲  UPGRADE', {
          fontSize: '10px', color: '#6ab4f0', fontFamily: UI_FONT,
        })
        .setOrigin(0.5)
    );
    container.add(
      scene.add
        .text(cx, btnY + 33, fmtBalance(cost), {
          fontSize: '13px', color: '#ddeeff', fontFamily: MONO_FONT, fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    let hovered = false;
    btn.on('pointerover', () => { hovered = true;  drawHover(); });
    btn.on('pointerout',  () => { hovered = false; drawNormal(); });
    btn.on('pointerdown', () => { drawPressed(); onUpgrade(); });
    btn.on('pointerup',   () => { if (hovered) drawHover(); else drawNormal(); });

    this.actionRef = { btn, getCost: () => cost, drawNormal, drawHover, drawDisabled, drawPressed, isHovered: () => hovered };
  }

  private buildUnlockSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    colTop: number,
    sectionW: number,
    index: number,
    onUnlock: () => void,
    isNextUnlockable: boolean,
  ): void {
    const cost = UNLOCK_COSTS[index];
    const btnW = sectionW - 12;
    const btnH = 50;
    const btnY = colTop + 78;

    container.add(
      scene.add
        .text(cx, colTop + 40, '🔒', {
          fontSize: isNextUnlockable ? '20px' : '16px',
          color: isNextUnlockable ? '#6a7a8a' : '#2e3540',
        })
        .setOrigin(0.5)
    );

    if (!isNextUnlockable) return;

    const btnGfx = scene.add.graphics();

    const drawNormal = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0d2818, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
      btnGfx.fillStyle(0x2a9a50, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      btnGfx.fillStyle(0xffffff, 0.06);
      btnGfx.fillRoundedRect(cx - btnW / 2 + 1, btnY + 3, btnW - 2, Math.floor(btnH * 0.44), { tl: 4, tr: 4, bl: 0, br: 0 });
      btnGfx.fillStyle(0x000000, 0.28);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + btnH - 3, btnW, 3, { tl: 0, tr: 0, bl: 5, br: 5 });
    };
    const drawHover = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x184830, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
      btnGfx.fillStyle(0x3aba68, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, 2, { tl: 5, tr: 5, bl: 0, br: 0 });
      btnGfx.fillStyle(0xffffff, 0.08);
      btnGfx.fillRoundedRect(cx - btnW / 2 + 1, btnY + 3, btnW - 2, Math.floor(btnH * 0.44), { tl: 4, tr: 4, bl: 0, br: 0 });
      btnGfx.fillStyle(0x000000, 0.2);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + btnH - 3, btnW, 3, { tl: 0, tr: 0, bl: 5, br: 5 });
    };
    const drawDisabled = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0e1812, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY, btnW, btnH, 5);
    };
    const drawPressed = () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x0a1c10, 1);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + 2, btnW, btnH - 2, 5);
      btnGfx.fillStyle(0x000000, 0.35);
      btnGfx.fillRoundedRect(cx - btnW / 2, btnY + 2, btnW, 3, { tl: 5, tr: 5, bl: 0, br: 0 });
    };

    drawNormal();
    container.add(btnGfx);

    const btn = scene.add
      .rectangle(cx, btnY + btnH / 2, btnW, btnH, 0x000000, 0)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, btnY + 15, 'UNLOCK', {
          fontSize: '10px', color: '#5ad494', fontFamily: UI_FONT,
        })
        .setOrigin(0.5)
    );
    container.add(
      scene.add
        .text(cx, btnY + 33, fmtBalance(cost), {
          fontSize: '13px', color: '#ccffdd', fontFamily: MONO_FONT, fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    let hovered = false;
    btn.on('pointerover', () => { hovered = true;  drawHover(); });
    btn.on('pointerout',  () => { hovered = false; drawNormal(); });
    btn.on('pointerdown', () => { drawPressed(); onUnlock(); });
    btn.on('pointerup',   () => { if (hovered) drawHover(); else drawNormal(); });

    this.actionRef = { btn, getCost: () => cost, drawNormal, drawHover, drawDisabled, drawPressed, isHovered: () => hovered };
  }

  refresh(gold: number): void {
    if (!this.actionRef) return;
    const canAfford = gold >= this.actionRef.getCost();
    if (canAfford && !this.prevCanAfford) {
      this.triggerAffordPulse();
    }
    this.prevCanAfford = canAfford;
    if (canAfford) {
      this.actionRef.btn.setInteractive({ useHandCursor: true });
      if (!this.actionRef.isHovered()) this.actionRef.drawNormal();
    } else {
      this.actionRef.btn.disableInteractive();
      this.actionRef.drawDisabled();
    }
  }

  private triggerAffordPulse(): void {
    if (!this.actionRef) return;
    const ref = this.actionRef;
    ref.drawHover();
    this.scene.time.delayedCall(350, () => {
      if (!ref.isHovered()) ref.drawNormal();
    });
  }

  destroy(): void {
    this.container.destroy();
  }
}
