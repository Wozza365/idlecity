import Phaser from 'phaser';
import { UI_FONT } from '../constants';

export const DEV_PANEL_OFFSET = 0;
export const DEV_PANEL_H = 0;

const PANEL_W = 280;

export class DevPanel {
  readonly container: Phaser.GameObjects.Container;
  private clockText: Phaser.GameObjects.Text;
  private fpsText: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Container;
  private burgerLabel: Phaser.GameObjects.Text;
  private isOpen = false;

  constructor(
    scene: Phaser.Scene,
    width: number,
    onAddGold: () => void,
    onAdvanceTime: () => void,
    onReset: () => void,
    onMidnight: () => void,
    onSkip: () => void,
    onAdvanceDay: () => void,
    onJumpSeason: (season: string) => void,
  ) {
    const container = scene.add.container(width - PANEL_W - 4, 0).setDepth(100);

    // --- Burger button (always visible) ---
    const burgerH = 28;
    const burgerMid = 8 + burgerH / 2;
    const burger = scene.add
      .rectangle(PANEL_W / 2, burgerMid, PANEL_W, burgerH, 0x0d1520, 0.90)
      .setInteractive({ useHandCursor: true });
    container.add(burger);
    this.burgerLabel = scene.add
      .text(PANEL_W / 2, burgerMid, '≡  DEV', { fontSize: '12px', color: '#667788', fontFamily: UI_FONT })
      .setOrigin(0.5);
    container.add(this.burgerLabel);

    // --- Collapsible panel (nested container, toggled visible) ---
    this.panel = scene.add.container(0, 8 + burgerH);
    container.add(this.panel);

    const panelH = 130;
    this.panel.add(
      scene.add.rectangle(PANEL_W / 2, panelH / 2, PANEL_W, panelH, 0x050810, 0.92),
    );

    const r1 = 16, r2 = 42, r3 = 68, r4 = 100;

    // Row 1: +$1B | +1 hr | +1 day  (3 × 82px, 7px gap, 10px margin each side)
    this.mkBtn(scene, 51,  r1, 82, 0x1a4400, '+$1B',   '#88ff88', onAddGold);
    this.mkBtn(scene, 140, r1, 82, 0x001444, '+1 hr',  '#88aaff', onAdvanceTime);
    this.mkBtn(scene, 229, r1, 82, 0x002233, '+1 day', '#66eeff', onAdvanceDay);

    // Row 2: Midnight | Skip Lvls  (2 × 134px, 8px gap)
    this.mkBtn(scene,  69, r2, 134, 0x220033, 'Midnight',  '#cc88ff', onMidnight);
    this.mkBtn(scene, 211, r2, 134, 0x331400, 'Skip Lvls', '#ffaa44', onSkip);

    // Row 3: season jump buttons (4 × 67px, 4px gap, fills panel width)
    const seasons: [string, number, string][] = [
      ['Summer', 0x1a3300, '#88ff44'],
      ['Autumn', 0x332200, '#ffaa44'],
      ['Winter', 0x001133, '#88ccff'],
      ['Spring', 0x002200, '#44ff88'],
    ];
    const sBtnW = 67;
    for (let i = 0; i < 4; i++) {
      const [label, color, textColor] = seasons[i];
      this.mkBtn(scene, sBtnW / 2 + i * (sBtnW + 4) + 0.5, r3, sBtnW, color, label, textColor, () => onJumpSeason(label));
    }

    // Row 4: git hash | clock | Reset All | fps
    this.panel.add(
      scene.add.text(8, r4, `#${__GIT_HASH__}`, { fontSize: '11px', color: '#334455', fontFamily: UI_FONT }).setOrigin(0, 0.5),
    );

    this.clockText = scene.add
      .text(PANEL_W / 2 - 36, r4, '', { fontSize: '12px', color: '#aaccff', fontFamily: UI_FONT })
      .setOrigin(0.5);
    this.panel.add(this.clockText);

    const resetBg = scene.add
      .rectangle(PANEL_W / 2 + 56, r4, 96, 22, 0x440000)
      .setInteractive({ useHandCursor: true });
    this.panel.add(resetBg);
    this.panel.add(
      scene.add.text(PANEL_W / 2 + 56, r4, 'Reset All', { fontSize: '12px', color: '#ff8888', fontFamily: UI_FONT }).setOrigin(0.5),
    );
    resetBg.on('pointerover', () => resetBg.setFillStyle(0x661111));
    resetBg.on('pointerout', () => resetBg.setFillStyle(0x440000));
    resetBg.on('pointerdown', onReset);

    this.fpsText = scene.add
      .text(PANEL_W - 4, r4, '', { fontSize: '12px', color: '#ffdd88', fontFamily: UI_FONT })
      .setOrigin(1, 0.5);
    this.panel.add(this.fpsText);

    // Start collapsed
    this.panel.setVisible(false);

    burger.on('pointerover', () => burger.setFillStyle(0x1a2a3a));
    burger.on('pointerout', () => burger.setFillStyle(0x0d1520));
    burger.on('pointerdown', () => {
      this.isOpen = !this.isOpen;
      this.panel.setVisible(this.isOpen);
      this.burgerLabel.setText(this.isOpen ? '✕  DEV' : '≡  DEV');
    });

    this.container = container;
  }

  private mkBtn(
    scene: Phaser.Scene,
    x: number, y: number, w: number,
    bg: number, label: string, textColor: string,
    cb: () => void,
  ): void {
    const btn = scene.add.rectangle(x, y, w, 24, bg).setInteractive({ useHandCursor: true });
    const txt = scene.add.text(x, y, label, { fontSize: '12px', color: textColor, fontFamily: UI_FONT }).setOrigin(0.5);
    const hover = (Math.min(255, ((bg >> 16) & 0xff) + 18) << 16)
      | (Math.min(255, ((bg >> 8) & 0xff) + 18) << 8)
      | Math.min(255, (bg & 0xff) + 18);
    btn.on('pointerover', () => btn.setFillStyle(hover));
    btn.on('pointerout', () => btn.setFillStyle(bg));
    btn.on('pointerdown', cb);
    this.panel.add(btn);
    this.panel.add(txt);
  }

  updateClock(timeString: string): void { this.clockText.setText(timeString); }
  updateFps(fps: number): void { this.fpsText.setText(`${Math.round(fps)} fps`); }
  destroy(): void { this.container.destroy(); }
}
