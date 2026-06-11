import Phaser from 'phaser';
import { UI_FONT, fmtBalance } from '../constants';

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
  private inputBorderGfx: Phaser.GameObjects.Graphics | null = null;
  private inputBox = { x: 0, y: 0, w: 0, h: 0 };
  private inputVal  = '';
  private cursorOn  = true;
  private inputFocused = false;
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  // Native input — invisible overlay used purely to capture keyboard/IME
  // input and trigger the on-screen keyboard on mobile.
  private domInput: HTMLInputElement | null = null;
  private resizeListener: (() => void) | null = null;

  private destroyed = false;

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
      padding: { x: 6, y: 6 },
      resolution: Math.min(window.devicePixelRatio || 1, 2),
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

    // Re-measure once the bold Inter face has actually loaded. Until then the
    // canvas falls back to a synthetic ("faux") bold of a fallback font, which
    // can overlap/clip adjacent glyphs (e.g. "e" and "v") and look pixelated —
    // producing the "sharp cut off"/low-res look on the town name.
    if (document.fonts) {
      Promise.all([
        document.fonts.load(`bold 20px ${UI_FONT}`),
        document.fonts.load(`16px ${UI_FONT}`),
      ]).then(() => {
        if (!this.destroyed) this.drawAll();
      }).catch(() => { /* font load failed — keep fallback rendering */ });
    }
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
    const showCursor = this.inputFocused && this.cursorOn;
    this.inputText.setText(this.inputVal + (showCursor ? '|' : ' '));
  }

  private drawInputBorder(focused: boolean): void {
    if (!this.inputBorderGfx) return;
    const { x, y, w, h } = this.inputBox;
    const g = this.inputBorderGfx;
    g.clear();
    g.fillStyle(0x06101a, 1);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1.5, focused ? 0xe0c060 : 0x3a5a80, 1);
    g.strokeRoundedRect(x, y, w, h, 5);
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
    const panelW = 400, panelH = 220;
    const px = width / 2,  py = height / 2;

    const panelGfx = add(s.add.graphics().setDepth(D + 1).setLighting(false));
    panelGfx.fillStyle(0x0f1a28, 1);
    panelGfx.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 12);
    panelGfx.lineStyle(2, 0x2a4060, 1);
    panelGfx.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 12);

    // Absorb clicks inside the panel so they don't reach the bg overlay,
    // and blur the rename input if the user taps elsewhere in the panel.
    const panelHit = add(s.add.rectangle(px, py, panelW, panelH, 0, 0).setDepth(D + 1).setInteractive());
    panelHit.on('pointerdown', () => this.blurInput());

    // Title
    add(s.add.text(px, py - panelH / 2 + 28, 'RENAME YOUR TOWN', {
      fontSize: '14px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 2));

    // Cost
    add(s.add.text(px, py - panelH / 2 + 50, `Cost: ${fmtBalance(TOWN_RENAME_COST)}`, {
      fontSize: '12px', color: '#4a6880', fontFamily: UI_FONT,
    }).setOrigin(0.5).setDepth(D + 2));

    // Input field
    const iW = panelW - 48, iH = 38;
    const ix = px - iW / 2,  iy = py - 12;
    this.inputBox = { x: ix, y: iy - iH / 2, w: iW, h: iH };

    this.inputBorderGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false)) as Phaser.GameObjects.Graphics;
    this.inputFocused = false;
    this.drawInputBorder(false);

    // Input text (includes blinking cursor character, only while focused)
    this.inputVal = this.getName();
    this.cursorOn = true;
    this.inputText = add(
      s.add.text(ix + 10, iy, '', {
        fontSize: '16px', color: '#d0c090', fontFamily: UI_FONT,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      }).setOrigin(0, 0.5).setDepth(D + 3),
    ) as Phaser.GameObjects.Text;
    this.updateInputDisplay();

    // Tapping the input box focuses the (invisible) DOM input — on mobile
    // this is what brings up the on-screen keyboard.
    const inputHit = add(
      s.add.rectangle(ix + iW / 2, iy, iW, iH, 0, 0)
        .setDepth(D + 4).setInteractive({ useHandCursor: true }),
    );
    inputHit.on('pointerdown', () => this.focusInput());

    // ── Buttons ─────────────────────────────────────────────────────────────

    const bY       = py + panelH / 2 - 34;
    const cancelW  = 140, confirmW = 190, bGap = 12;
    const totalW   = cancelW + bGap + confirmW;
    const startX   = px - totalW / 2;
    const cancelX  = startX + cancelW / 2;
    const confirmX = startX + cancelW + bGap + confirmW / 2;

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
    const confirmLbl = add(s.add.text(confirmX, bY, `CONFIRM  —  ${fmtBalance(TOWN_RENAME_COST)}`, {
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

    // ── Native input ─────────────────────────────────────────────────────────
    // Invisible, positioned exactly over the input box. Handles typing
    // (including IME/paste), and focusing it opens the on-screen keyboard.
    this.createDomInput();
    this.focusInput();

    this.resizeListener = (): void => this.positionDomInput();
    window.addEventListener('resize', this.resizeListener);
  }

  private createDomInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 40;
    input.value = this.inputVal;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Town name');
    input.style.cssText = [
      'position:fixed',
      'box-sizing:border-box',
      'margin:0',
      'padding:0 10px',
      'border:none',
      'outline:none',
      'background:transparent',
      'color:transparent',
      'caret-color:transparent',
      'font-size:16px', // keep ≥16px so mobile browsers don't zoom on focus
      'z-index:10000',
    ].join(';');

    input.addEventListener('input', () => {
      this.inputVal = input.value.slice(0, 40);
      this.cursorOn = true;
      this.updateInputDisplay();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmDialog();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.closeDialog();
      }
    });
    input.addEventListener('focus', () => {
      this.inputFocused = true;
      this.cursorOn = true;
      this.drawInputBorder(true);
      this.updateInputDisplay();
    });
    input.addEventListener('blur', () => {
      this.inputFocused = false;
      this.drawInputBorder(false);
      this.updateInputDisplay();
    });

    document.body.appendChild(input);
    this.domInput = input;
    this.positionDomInput();
  }

  private positionDomInput(): void {
    if (!this.domInput) return;
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  / this.scene.scale.width;
    const scaleY = rect.height / this.scene.scale.height;
    const { x, y, w, h } = this.inputBox;
    this.domInput.style.left   = `${rect.left + x * scaleX}px`;
    this.domInput.style.top    = `${rect.top  + y * scaleY}px`;
    this.domInput.style.width  = `${w * scaleX}px`;
    this.domInput.style.height = `${h * scaleY}px`;
  }

  private focusInput(): void {
    this.domInput?.focus();
    this.domInput?.select();
  }

  private blurInput(): void {
    this.domInput?.blur();
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

    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }

    if (this.domInput) {
      this.domInput.remove();
      this.domInput = null;
    }

    for (const obj of this.dialogObjs) obj.destroy();
    this.dialogObjs = [];
    this.inputText = null;
    this.inputBorderGfx = null;
    this.inputFocused = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.closeDialog();
    this.gfx.destroy();
    this.nameText.destroy();
    this.btnGfx.destroy();
    this.btnLabel.destroy();
    this.btnHit.destroy();
  }
}
