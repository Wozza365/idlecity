import Phaser from 'phaser';
import { type RoadState } from '../game/GameState';
import { STATS_BAR_H, fmt, UI_FONT } from '../constants';

interface ActionRef {
  btn: Phaser.GameObjects.Rectangle;
  getCost: () => number;
  activeColor: number;
}

export class RoadUI {
  readonly container: Phaser.GameObjects.Container;
  actionRef: ActionRef | null = null;

  constructor(
    scene: Phaser.Scene,
    road: RoadState,
    panelTop: number,
    width: number,
    onUpgrade: () => void
  ) {
    const container = scene.add.container(0, 0).setDepth(11);
    const midY = panelTop + STATS_BAR_H / 2;
    const atMax = road.level >= 10;
    const cost = this.roadUpgradeCost(road.level);

    container.add(
      scene.add
        .text(width / 2, midY - 13, `Road: ${this.roadTierName(road.level)}`, {
          fontSize: '12px', color: '#aabbcc', fontFamily: UI_FONT,
        })
        .setOrigin(0.5, 0.5)
    );

    const btn = scene.add
      .rectangle(width / 2, midY + 12, 130, 26, 0x2a2a3a)
      .setInteractive({ useHandCursor: false });
    container.add(btn);

    container.add(
      scene.add
        .text(
          width / 2, midY + 12,
          atMax ? 'Road: Max' : `▲ Lv ${road.level + 1}  ${fmt(cost)}`,
          { fontSize: '11px', color: atMax ? '#555566' : '#cce8ff', fontFamily: UI_FONT }
        )
        .setOrigin(0.5, 0.5)
    );

    if (!atMax) {
      btn.on('pointerover', () => btn.setFillStyle(0x7a5500));
      btn.on('pointerout', () => btn.setFillStyle(0x5a3e00));
      btn.on('pointerdown', onUpgrade);
      this.actionRef = { btn, getCost: (): number => cost, activeColor: 0x5a3e00 };
    }

    this.container = container;
  }

  private roadUpgradeCost(level: number): number {
    return level === 0 ? 200 : level * level * 50;
  }

  private roadTierName(level: number): string {
    if (level === 0) return 'None';
    if (level <= 2) return 'Dirt Track';
    if (level <= 4) return 'Gravel';
    if (level <= 6) return 'Paved';
    if (level <= 8) return 'Two-Lane';
    return 'Highway';
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
