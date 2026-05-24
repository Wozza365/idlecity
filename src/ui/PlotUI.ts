import Phaser from 'phaser';
import { type PlotState } from '../game/GameState';
import { MAX_LEVEL, UNLOCK_COSTS, upgradeCost, perBuildingIncome, fmt } from '../constants';

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  activeColor: number;
}

export class PlotUI {
  readonly container: Phaser.GameObjects.Container;
  actionRef: ActionRef | null = null;

  constructor(
    scene: Phaser.Scene,
    index: number,
    plot: PlotState,
    sectionW: number,
    colTop: number,
    onUpgrade: () => void,
    onUnlock: () => void
  ) {
    const container = scene.add.container(0, 0).setDepth(11);
    const cx = index * sectionW + sectionW / 2;

    container.add(
      scene.add
        .text(cx, colTop + 16, `Bldg ${index + 1}`, { fontSize: '13px', color: '#8899aa' })
        .setOrigin(0.5)
    );

    if (plot.unlocked) {
      this.buildUpgradeSection(scene, container, cx, colTop, plot, onUpgrade);
    } else {
      this.buildUnlockSection(scene, container, cx, colTop, index, onUnlock);
    }

    this.container = container;
  }

  private buildUpgradeSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    colTop: number,
    plot: PlotState,
    onUpgrade: () => void
  ): void {
    const atMax = plot.level >= MAX_LEVEL;
    const cost  = upgradeCost(plot.level);

    container.add(
      scene.add
        .text(cx, colTop + 40, `Lv ${plot.level}/${MAX_LEVEL}`, {
          fontSize: '14px', color: '#ddeeff',
        })
        .setOrigin(0.5)
    );

    container.add(
      scene.add
        .text(cx, colTop + 62, `${fmt(perBuildingIncome(plot.level))}/s`, {
          fontSize: '12px', color: '#88ddaa',
        })
        .setOrigin(0.5)
    );

    container.add(
      scene.add
        .text(cx, colTop + 82, atMax ? '' : `${fmt(cost)}`, {
          fontSize: '12px', color: '#99aabb',
        })
        .setOrigin(0.5)
    );

    const btn = scene.add
      .rectangle(cx, colTop + 118, 82, 44, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, colTop + 118, atMax ? 'Max' : '▲ Upgrade', {
          fontSize: '12px', color: atMax ? '#555566' : '#cce8ff',
        })
        .setOrigin(0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x2471a3));
      btn.on('pointerout',  () => btn.setFillStyle(0x1a5276));
      btn.on('pointerdown', onUpgrade);
      this.actionRef = { btn, getCost: (): number => cost, activeColor: 0x1a5276 };
    }
  }

  private buildUnlockSection(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    cx: number,
    colTop: number,
    index: number,
    onUnlock: () => void
  ): void {
    const cost = UNLOCK_COSTS[index];

    container.add(
      scene.add
        .text(cx, colTop + 40, '🔒', { fontSize: '18px', color: '#555566' })
        .setOrigin(0.5)
    );

    container.add(
      scene.add
        .text(cx, colTop + 68, `${fmt(cost)}`, { fontSize: '12px', color: '#99aabb' })
        .setOrigin(0.5)
    );

    const btn = scene.add
      .rectangle(cx, colTop + 110, 82, 44, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(cx, colTop + 110, 'Unlock', { fontSize: '13px', color: '#e8ffe8' })
        .setOrigin(0.5)
    );

    btn.on('pointerover', () => btn.setFillStyle(0x3d8a22));
    btn.on('pointerout',  () => btn.setFillStyle(0x2d6b1a));
    btn.on('pointerdown', onUnlock);

    this.actionRef = { btn, getCost: (): number => cost, activeColor: 0x2d6b1a };
  }

  refresh(gold: number): void {
    if (!this.actionRef) return;
    const canAfford = gold >= this.actionRef.getCost();
    if (canAfford) {
      this.actionRef.btn.setInteractive({ useHandCursor: true });
      this.actionRef.btn.setFillStyle(this.actionRef.activeColor);
    } else {
      this.actionRef.btn.disableInteractive();
      this.actionRef.btn.setFillStyle(0x252535);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
