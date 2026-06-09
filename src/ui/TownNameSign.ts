import Phaser from 'phaser';
import { UI_FONT } from '../constants';

export const TOWN_RENAME_COST = 100_000;

const DEPTH  = 99;
const SIGN_Y = 10;
const SIGN_H = 44;
const BTN_W  = 72;
const BTN_H  = 28;
const BTN_GAP = 6;

export class TownNameSign {
  private gfx: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private btnGfx: Phaser.GameObjects.Graphics;
  private btnLabel: Phaser.GameObjects.Text;
  private btnHit: Phaser.GameObjects.Rectangle;
  private dialog: HTMLDivElement | null = null;

  // Cached layout values recalculated in drawAll()
  private cx = 0;
  private signW = 0;
  private btnX = 0;
  private btnY = 0;

  constructor(
    scene: Phaser.Scene,
    private width: number,
    private getName: () => string,
    private onRename: (newName: string) => boolean,
  ) {
    this.gfx    = scene.add.graphics().setDepth(DEPTH).setLighting(false);
    this.btnGfx = scene.add.graphics().setDepth(DEPTH).setLighting(false);

    this.nameText = scene.add.text(0, 0, '', {
      fontSize: '20px',
      color: '#ffe8a0',
      fontFamily: UI_FONT,
      fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 1, color: '#1e0a00', blur: 3, fill: true },
    }).setOrigin(0.5, 0.5).setDepth(DEPTH + 1);

    this.btnLabel = scene.add.text(0, 0, 'RENAME', {
      fontSize: '10px',
      color: '#b89020',
      fontFamily: UI_FONT,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(DEPTH + 1);

    this.btnHit = scene.add.rectangle(0, 0, BTN_W, BTN_H, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(DEPTH + 2);

    this.btnHit.on('pointerover', () => {
      this.btnLabel.setColor('#ffe8a0');
      this.drawBtn(true);
    });
    this.btnHit.on('pointerout', () => {
      this.btnLabel.setColor('#b89020');
      this.drawBtn(false);
    });
    this.btnHit.on('pointerdown', () => this.openDialog());

    this.drawAll();
  }

  resize(width: number): void {
    this.width = width;
    this.drawAll();
  }

  private drawAll(): void {
    this.cx = this.width / 2;
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

    // Drop shadow
    this.gfx.fillStyle(0x000000, 0.22);
    this.gfx.fillRoundedRect(x + 3, SIGN_Y + 5, signW, SIGN_H, r);

    // Outer border
    this.gfx.fillStyle(0x2d1a06, 1);
    this.gfx.fillRoundedRect(x - 3, SIGN_Y - 3, signW + 6, SIGN_H + 6, r + 2);

    // Wood fill
    this.gfx.fillStyle(0x6b4218, 1);
    this.gfx.fillRoundedRect(x, SIGN_Y, signW, SIGN_H, r);

    // Highlight streak along the top
    this.gfx.fillStyle(0x8c5828, 1);
    this.gfx.fillRoundedRect(x + 4, SIGN_Y + 4, signW - 8, 5, { tl: 4, tr: 4, bl: 0, br: 0 });

    // Hanging post nubs at bottom corners
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

  private openDialog(): void {
    if (this.dialog) return;

    const currentName = this.getName();
    const sanitized = currentName.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;bottom:0',
      'background:rgba(0,0,0,0.62)',
      'display:flex;align-items:center;justify-content:center',
      'z-index:9999;font-family:Inter,sans-serif',
    ].join(';');

    overlay.innerHTML = `
      <div style="background:#1a2030;border:2px solid #3a5070;border-radius:12px;padding:28px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.6)">
        <div style="color:#ffe8a0;font-size:18px;font-weight:bold;margin-bottom:6px">Rename Your Town</div>
        <div style="color:#6080a0;font-size:13px;margin-bottom:20px">Cost: $100,000</div>
        <input id="tn-input" type="text" value="${sanitized}" maxlength="40"
          style="width:100%;box-sizing:border-box;background:#0d1520;border:1px solid #3a5070;border-radius:6px;color:#e0d0a0;font-size:16px;font-family:Inter,sans-serif;padding:10px 12px;outline:none">
        <div style="display:flex;gap:10px;margin-top:18px">
          <button id="tn-cancel"  style="flex:1;padding:10px;border-radius:6px;background:#1e2840;border:1px solid #3a5070;color:#7090b0;font-size:13px;font-family:Inter,sans-serif;cursor:pointer">Cancel</button>
          <button id="tn-confirm" style="flex:2;padding:10px;border-radius:6px;background:#2a1e08;border:1px solid #d4a820;color:#ffe8a0;font-size:13px;font-family:Inter,sans-serif;cursor:pointer;font-weight:bold">Confirm — $100,000</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    this.dialog = overlay;

    const input = overlay.querySelector<HTMLInputElement>('#tn-input')!;
    requestAnimationFrame(() => { input.focus(); input.select(); });

    const close = () => { overlay.remove(); this.dialog = null; };

    const confirm = () => {
      const newName = input.value.trim();
      if (this.onRename(newName)) {
        close();
        this.drawAll();
      }
    };

    overlay.querySelector('#tn-cancel')!.addEventListener('click', close);
    overlay.querySelector('#tn-confirm')!.addEventListener('click', confirm);
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') confirm();
      else if (e.key === 'Escape') close();
    });
    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay) close();
    });
  }

  destroy(): void {
    if (this.dialog) { this.dialog.remove(); this.dialog = null; }
    this.gfx.destroy();
    this.nameText.destroy();
    this.btnGfx.destroy();
    this.btnLabel.destroy();
    this.btnHit.destroy();
  }
}
