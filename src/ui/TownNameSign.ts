import Phaser from 'phaser';
import { UI_FONT } from '../constants';

export const TOWN_RENAME_COST = 100_000;

const S_DEPTH = 99;   // sign
const D_DEPTH = 200;  // dialog (above everything)
const SIGN_Y  = 10;
const SIGN_H  = 44;
const BTN_W   = 72;
const BTN_H   = 28;
const BTN_GAP = 6;

export class TownNameSign {
  private gfx: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private btnGfx: Phaser.GameObjects.Graphics;
  private btnLabel: Phaser.GameObjects.Text;
  private btnHit: Phaser.GameObjects.Rectangle;

  // Cached layout
  private cx   = 0;
  private signW = 0;
  private btnX  = 0;
  private btnY  = 0;

  // Dialog state
  private dialogObjs: Phaser.GameObjects.GameObject[] = [];
  private inputText: Phaser.GameObjects.Text | null = null;
  private inputVal  = '';
  private cursorOn  = true;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private scene: Phaser.Scene,
    private width: number,
    private getName: () => string,
    private onRename: (newName: string) => boolean,
  ) {
    this.gfx    = scene.add.graphics().setDepth(S_DEPTH).setLighting(false);
    this.btnGfx = scene.add.graphics().setDepth(S_DEPTH).setLighting(false);

    this.nameText = scene.add.text(0, 0, '', {
      fontSize: '20px', color: '#ffe8a0',
      fontFamily: UI_FONT, fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 1, color: '#1e0a00', blur: 3, fill: true },
    }).setOrigin(0.5, 0.5).setDepth(S_DEPTH + 1);

    this.btnLabel = scene.add.text(0, 0, 'RENAME', {
      fontSize: '10px', color: '#b89020', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(S_DEPTH + 1);

    this.btnHit = scene.add.rectangle(0, 0, BTN_W, BTN_H, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(S_DEPTH + 2);

    this.btnHit.on('pointerover',  () => { this.btnLabel.setColor('#ffe8a0'); this.drawBtn(true); });
    this.btnHit.on('pointerout',   () => { this.btnLabel.setColor('#b89020'); this.drawBtn(false); });
    this.btnHit.on('pointerdown',  () => this.openDialog());

    this.drawAll();
  }

  resize(width: number): void {
    this.width = width;
    this.drawAll();
  }

  private drawAll(): void {
    this.cx    = this.width / 2;
    this.nameText.setText(this.getName());
    this.signW = Math.max(180, this.nameText.width + 52);
    this.btnX  = this.cx + this.signW / 2 + BTN_GAP + BTN_W / 2;
    this.btnY  = SIGN_Y + SIGN_H / 2;

    this.nameText.setPosition(this.cx, this.btnY);
    this.btnLabel.setPosition(this.btnX, this.btnY);
    this.btnHit.setPosition(this.btnX, this.btnY);

    this.drawSign();
    this.drawBtn(false);
  }

  private drawSign(): void {
    this.gfx.clear();
    const { cx, signW } = this;
    const x = cx - signW / 2;
    const r = 7;

    this.gfx.fillStyle(0x000000, 0.22);
    this.gfx.fillRoundedRect(x + 3, SIGN_Y + 5, signW, SIGN_H, r);
    this.gfx.fillStyle(0x2d1a06, 1);
    this.gfx.fillRoundedRect(x - 3, SIGN_Y - 3, signW + 6, SIGN_H + 6, r + 2);
    this.gfx.fillStyle(0x6b4218, 1);
    this.gfx.fillRoundedRect(x, SIGN_Y, signW, SIGN_H, r);
    this.gfx.fillStyle(0x8c5828, 1);
    this.gfx.fillRoundedRect(x + 4, SIGN_Y + 4, signW - 8, 5, { tl: 4, tr: 4, bl: 0, br: 0 });
    this.gfx.fillStyle(0x2d1a06, 1);
    this.gfx.fillRect(x + 12, SIGN_Y + SIGN_H, 6, 8);
    this.gfx.fillRect(x + signW - 18, SIGN_Y + SIGN_H, 6, 8);
  }

  private drawBtn(hover: boolean): void {
    this.btnGfx.clear();
    const x = this.btnX - BTN_W / 2;
    const y = this.btnY - BTN_H / 2;
    this.btnGfx.fillStyle(hover ? 0x201808 : 0x120e04, 1);
    this.btnGfx.fillRoundedRect(x, y, BTN_W, BTN_H, 5);
    this.btnGfx.lineStyle(1, hover ? 0xd4a820 : 0x5a4010, 1);
    this.btnGfx.strokeRoundedRect(x, y, BTN_W, BTN_H, 5);
  }

  private updateInputDisplay(): void {
    if (!this.inputText) return;
    this.inputText.setText(this.inputVal + (this.cursorOn ? '|' : ' '));
  }

  private openDialog(): void {
    if (this.dialogObjs.length) return;

    const s = this.scene;
    const { width, height } = s.scale;
    const D = D_DEPTH;

    const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      this.dialogObjs.push(obj);
      return obj;
    };

    // Dimming overlay — click outside panel to cancel
    const bg = add(
      s.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
        .setDepth(D).setInteractive(),
    );
    bg.on('pointerdown', () => this.closeDialog());

    // Panel
    const panelW = 360, panelH = 220;
    const px = width / 2,  py = height / 2;

    const panelGfx = add(s.add.graphics().setDepth(D + 1).setLighting(false));
    panelGfx.fillStyle(0x0f1a28, 1);
    panelGfx.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 12);
    panelGfx.lineStyle(2, 0x2a4060, 1);
    panelGfx.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 12);

    // Absorb clicks inside the panel so they don't reach the bg overlay
    add(s.add.rectangle(px, py, panelW, panelH, 0, 0).setDepth(D + 1).setInteractive());

    // Title
    add(s.add.text(px, py - panelH / 2 + 28, 'RENAME YOUR TOWN', {
      fontSize: '14px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 2));

    // Cost
    add(s.add.text(px, py - panelH / 2 + 50, 'Cost: $100,000', {
      fontSize: '12px', color: '#4a6880', fontFamily: UI_FONT,
    }).setOrigin(0.5).setDepth(D + 2));

    // Input field background
    const iW = panelW - 40, iH = 38;
    const ix = px - iW / 2,  iy = py - 12;
    const inputGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    inputGfx.fillStyle(0x06101a, 1);
    inputGfx.fillRoundedRect(ix, iy - iH / 2, iW, iH, 5);
    inputGfx.lineStyle(1.5, 0x3a5a80, 1);
    inputGfx.strokeRoundedRect(ix, iy - iH / 2, iW, iH, 5);

    // Input text (includes blinking cursor character)
    this.inputVal = this.getName();
    this.cursorOn = true;
    this.inputText = add(
      s.add.text(ix + 10, iy, '', {
        fontSize: '16px', color: '#d0c090', fontFamily: UI_FONT,
      }).setOrigin(0, 0.5).setDepth(D + 3),
    ) as Phaser.GameObjects.Text;
    this.updateInputDisplay();

    // ── Buttons ─────────────────────────────────────────────────────────────

    const bY       = py + panelH / 2 - 34;
    const cancelW  = 140, confirmW = 184, bGap = 12;
    const cancelX  = px - bGap / 2 - cancelW / 2;
    const confirmX = px + bGap / 2 + confirmW / 2;

    // Cancel
    const cancelGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    cancelGfx.fillStyle(0x141e2c, 1);
    cancelGfx.fillRoundedRect(cancelX - cancelW / 2, bY - 16, cancelW, 32, 6);
    cancelGfx.lineStyle(1, 0x243650, 1);
    cancelGfx.strokeRoundedRect(cancelX - cancelW / 2, bY - 16, cancelW, 32, 6);
    const cancelLbl = add(s.add.text(cancelX, bY, 'CANCEL', {
      fontSize: '12px', color: '#5a7898', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));
    const cancelHit = add(
      s.add.rectangle(cancelX, bY, cancelW, 32, 0, 0)
        .setDepth(D + 4).setInteractive({ useHandCursor: true }),
    );
    cancelHit.on('pointerdown',  () => this.closeDialog());
    cancelHit.on('pointerover',  () => (cancelLbl as Phaser.GameObjects.Text).setColor('#90b8d8'));
    cancelHit.on('pointerout',   () => (cancelLbl as Phaser.GameObjects.Text).setColor('#5a7898'));

    // Confirm
    const confirmGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    confirmGfx.fillStyle(0x1e1608, 1);
    confirmGfx.fillRoundedRect(confirmX - confirmW / 2, bY - 16, confirmW, 32, 6);
    confirmGfx.lineStyle(1, 0xd4a820, 1);
    confirmGfx.strokeRoundedRect(confirmX - confirmW / 2, bY - 16, confirmW, 32, 6);
    const confirmLbl = add(s.add.text(confirmX, bY, 'CONFIRM  —  $100,000', {
      fontSize: '11px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));
    const confirmHit = add(
      s.add.rectangle(confirmX, bY, confirmW, 32, 0, 0)
        .setDepth(D + 4).setInteractive({ useHandCursor: true }),
    );
    confirmHit.on('pointerdown',  () => this.confirmDialog());
    confirmHit.on('pointerover',  () => (confirmLbl as Phaser.GameObjects.Text).setColor('#ffffff'));
    confirmHit.on('pointerout',   () => (confirmLbl as Phaser.GameObjects.Text).setColor('#ffe8a0'));

    // ── Cursor blink ─────────────────────────────────────────────────────────
    this.blinkTimer = s.time.addEvent({
      delay: 530, loop: true,
      callback: () => { this.cursorOn = !this.cursorOn; this.updateInputDisplay(); },
    });

    // ── Keyboard ─────────────────────────────────────────────────────────────
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        this.inputVal = this.inputVal.slice(0, -1);
        this.cursorOn = true;
        this.updateInputDisplay();
      } else if (e.key === 'Enter') {
        this.confirmDialog();
      } else if (e.key === 'Escape') {
        this.closeDialog();
      } else if (e.key.length === 1 && this.inputVal.length < 40) {
        this.inputVal += e.key;
        this.cursorOn = true;
        this.updateInputDisplay();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private confirmDialog(): void {
    if (this.onRename(this.inputVal.trim())) {
      this.closeDialog();
      this.drawAll();
    }
  }

  private closeDialog(): void {
    this.blinkTimer?.remove();
    this.blinkTimer = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    for (const obj of this.dialogObjs) obj.destroy();
    this.dialogObjs = [];
    this.inputText  = null;
  }

  destroy(): void {
    this.closeDialog();
    this.gfx.destroy();
    this.nameText.destroy();
    this.btnGfx.destroy();
    this.btnLabel.destroy();
    this.btnHit.destroy();
  }
}
