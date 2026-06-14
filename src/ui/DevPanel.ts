import Phaser from 'phaser';
import { UI_FONT } from '../constants';
import { BOAT_DEFS } from '../objects/BoatAssets';

export const DEV_PANEL_OFFSET = 0;
export const DEV_PANEL_H = 0;

const PANEL_W = 280;
const BTN_W = 32;

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
    onSpawnBalloon: () => void,
    onSpawnBoat: (key: string) => void,
  ) {
    const container = scene.add.container(width - BTN_W - 4, 0).setDepth(100);

    // --- Burger button (always visible, small icon in corner) ---
    const burgerH = 28;
    const burgerMid = 8 + burgerH / 2;
    const burger = scene.add
      .rectangle(BTN_W / 2, burgerMid, BTN_W, burgerH, 0x0d1520, 0.90)
      .setInteractive({ useHandCursor: true });
    container.add(burger);
    this.burgerLabel = scene.add
      .text(BTN_W / 2, burgerMid, '≡', { fontSize: '14px', color: '#667788', fontFamily: UI_FONT })
      .setOrigin(0.5);
    container.add(this.burgerLabel);

    // --- Collapsible panel (nested container, extends left from button) ---
    this.panel = scene.add.container(-(PANEL_W - BTN_W), 8 + burgerH);
    container.add(this.panel);

    const RES_ROW_H = 22;
    const BOATS_PER_ROW_PRE = 4;
    const boatRowsPre = Math.ceil(BOAT_DEFS.length / BOATS_PER_ROW_PRE);
    const panelH = 154 + boatRowsPre * 24 + RES_ROW_H;
    this.panel.add(
      scene.add.rectangle(PANEL_W / 2, panelH / 2, PANEL_W, panelH, 0x050810, 0.92),
    );

    // Boat rows: up to 4 per row
    const BOATS_PER_ROW = 4;
    const boatExtraH = boatRowsPre * 24;

    const r1 = 14, r2 = 38, r3 = 62, r4 = 86;
    const r5 = r4 + boatExtraH;      // season row
    const r6 = r5 + 30;              // info row
    const r7 = r6 + RES_ROW_H;       // resolution diagnostics row

    // Row 1: +$1B | +1 hr | +1 day  (3 × 82px, 7px gap, 10px margin each side)
    this.mkBtn(scene, 51,  r1, 82, 0x1a4400, '+$1B',   '#88ff88', onAddGold);
    this.mkBtn(scene, 140, r1, 82, 0x001444, '+1 hr',  '#88aaff', onAdvanceTime);
    this.mkBtn(scene, 229, r1, 82, 0x002233, '+1 day', '#66eeff', onAdvanceDay);

    // Row 2: Midnight | Skip Lvls  (2 × 134px, 8px gap)
    this.mkBtn(scene,  69, r2, 134, 0x220033, 'Midnight',  '#cc88ff', onMidnight);
    this.mkBtn(scene, 211, r2, 134, 0x331400, 'Skip Lvls', '#ffaa44', onSkip);

    // Row 3: Spawn Balloon (full-width)
    this.mkBtn(scene, PANEL_W / 2, r3, PANEL_W - 16, 0x003333, 'Spawn Balloon', '#44ffdd', onSpawnBalloon);

    // Boat spawn rows (dynamic, up to 4 per row)
    const bBtnW = Math.floor((PANEL_W - 16 - (Math.min(BOAT_DEFS.length, BOATS_PER_ROW) - 1) * 4) / Math.min(BOAT_DEFS.length, BOATS_PER_ROW));
    for (let i = 0; i < BOAT_DEFS.length; i++) {
      const col = i % BOATS_PER_ROW;
      const row = Math.floor(i / BOATS_PER_ROW);
      const bx = 8 + col * (bBtnW + 4) + bBtnW / 2;
      const by = r4 + row * 24;
      const label = BOAT_DEFS[i].key.replace('_', ' ');
      this.mkBtn(scene, bx, by, bBtnW, 0x001a33, label, '#55bbff', () => onSpawnBoat(BOAT_DEFS[i].key));
    }

    // Season jump buttons (4 × 67px, 4px gap, fills panel width)
    const seasons: [string, number, string][] = [
      ['Summer', 0x1a3300, '#88ff44'],
      ['Autumn', 0x332200, '#ffaa44'],
      ['Winter', 0x001133, '#88ccff'],
      ['Spring', 0x002200, '#44ff88'],
    ];
    const sBtnW = 67;
    for (let i = 0; i < 4; i++) {
      const [label, color, textColor] = seasons[i];
      this.mkBtn(scene, sBtnW / 2 + i * (sBtnW + 4) + 0.5, r5, sBtnW, color, label, textColor, () => onJumpSeason(label));
    }

    // Info row: git hash | clock | Reset All | fps
    this.panel.add(
      scene.add.text(8, r6, `#${__GIT_HASH__}`, { fontSize: '11px', color: '#334455', fontFamily: UI_FONT }).setOrigin(0, 0.5),
    );

    this.clockText = scene.add
      .text(PANEL_W / 2 - 36, r6, '', { fontSize: '12px', color: '#aaccff', fontFamily: UI_FONT })
      .setOrigin(0.5);
    this.panel.add(this.clockText);

    const resetBg = scene.add
      .rectangle(PANEL_W / 2 + 56, r6, 96, 22, 0x440000)
      .setInteractive({ useHandCursor: true });
    this.panel.add(resetBg);
    this.panel.add(
      scene.add.text(PANEL_W / 2 + 56, r6, 'Reset All', { fontSize: '12px', color: '#ff8888', fontFamily: UI_FONT }).setOrigin(0.5),
    );
    resetBg.on('pointerover', () => resetBg.setFillStyle(0x661111));
    resetBg.on('pointerout', () => resetBg.setFillStyle(0x440000));
    resetBg.on('pointerdown', onReset);

    this.fpsText = scene.add
      .text(PANEL_W - 4, r6, '', { fontSize: '12px', color: '#ffdd88', fontFamily: UI_FONT })
      .setOrigin(1, 0.5);
    this.panel.add(this.fpsText);

    // Row 7: resolution diagnostics - shows raw devicePixelRatio, the actual
    // (fractional) density multiplier applied to the canvas backing store
    // (see PIXEL_DENSITY/applyPixelDensity in main.ts), and the resulting
    // CSS vs. backing-store canvas sizes, so DPR-aware supersampling can be
    // checked on-device. `density` should closely match `dpr` - if it's
    // noticeably lower (e.g. capped at 3.00), the canvas is being downscaled
    // by the browser.
    const canvas = scene.game.canvas;
    const dpr = window.devicePixelRatio || 1;
    const density = canvas.width / scene.game.scale.width || 1;
    const cssW = Math.round(scene.game.scale.width);
    const cssH = Math.round(scene.game.scale.height);
    this.panel.add(
      scene.add
        .text(
          PANEL_W / 2,
          r7,
          `dpr ${dpr.toFixed(2)} · density ×${density.toFixed(2)} · ${cssW}x${cssH} → ${canvas.width}x${canvas.height}`,
          { fontSize: '10px', color: '#778899', fontFamily: UI_FONT },
        )
        .setOrigin(0.5),
    );

    // Start collapsed
    this.panel.setVisible(false);

    burger.on('pointerover', () => burger.setFillStyle(0x1a2a3a));
    burger.on('pointerout', () => burger.setFillStyle(0x0d1520));
    burger.on('pointerdown', () => {
      this.isOpen = !this.isOpen;
      this.panel.setVisible(this.isOpen);
      this.burgerLabel.setText(this.isOpen ? '✕' : '≡');
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
