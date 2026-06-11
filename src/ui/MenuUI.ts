import Phaser from 'phaser';
import { type GameState, calculateProgress } from '../game/GameState';
import { TOTAL_SKINS, UI_FONT, MONO_FONT, fmtBalance } from '../constants';

const BTN_DEPTH = 100; // corner button
const D_DEPTH   = 300; // dialog (above everything, including TownNameSign's dialog)

const BTN_W = 32;
const BTN_H = 28;

const SKINS_PER_PAGE = 8;
const SKIN_COLS = 4;
const SKIN_ROWS = 2;
const SKIN_PAGES = Math.ceil(TOTAL_SKINS / SKINS_PER_PAGE);

// Theme names for the locked placeholder skin slots (cells 2-24, in order).
const SKIN_NAMES: readonly string[] = [
  'Cyberpunk',
  'Desert Oasis',
  'Winter Wonderland',
  'Steampunk',
  'Candy Kingdom',
  'Post-Apocalyptic',
  'Medieval Village',
  'Tropical Resort',
  'Space Colony',
  'Halloween Haunt',
  'Neon Retro 80s',
  'Zen Garden',
  'Underwater Atlantis',
  'Wild West',
  'Volcanic',
  'Arctic Tundra',
  'Jungle Ruins',
  'Pastel Dreamscape',
  'Industrial Steel',
  'Fantasy Kingdom',
  'Pirate Cove',
  'Autumn Harvest',
  'Noir City',
];

interface TabDef {
  id: string;
  label: string;
}

const TABS: readonly TabDef[] = [
  { id: 'skins', label: 'SKINS' },
  { id: 'stats', label: 'STATS' },
];

export class MenuUI {
  private btnGfx: Phaser.GameObjects.Graphics;
  private btnLabel: Phaser.GameObjects.Text;
  private btnHit: Phaser.GameObjects.Rectangle;

  private dialogObjs: Phaser.GameObjects.GameObject[] = [];
  private bodyObjs: Phaser.GameObjects.GameObject[] = [];

  private currentTab: string = TABS[0].id;
  private skinsPage = 0;

  constructor(
    private scene: Phaser.Scene,
    private width: number,
    private height: number,
    private getState: () => GameState,
  ) {
    this.btnGfx = scene.add.graphics().setDepth(BTN_DEPTH).setLighting(false);

    this.btnLabel = scene.add.text(0, 0, '☰', {
      fontSize: '14px', color: '#667788', fontFamily: UI_FONT,
    }).setOrigin(0.5).setDepth(BTN_DEPTH + 1);

    this.btnHit = scene.add.rectangle(0, 0, BTN_W, BTN_H, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(BTN_DEPTH + 1);

    this.btnHit.on('pointerover', () => { this.btnLabel.setColor('#ffe8a0'); this.drawBtn(true); });
    this.btnHit.on('pointerout',  () => { this.btnLabel.setColor('#667788'); this.drawBtn(false); });
    this.btnHit.on('pointerdown', () => this.openDialog());

    this.layoutBtn();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layoutBtn();
    if (this.dialogObjs.length) {
      this.closeDialog();
      this.openDialog();
    }
  }

  private layoutBtn(): void {
    const x = 4;
    const y = 0;
    const cx = x + BTN_W / 2;
    const cy = y + BTN_H / 2;
    this.btnLabel.setPosition(cx, cy);
    this.btnHit.setPosition(cx, cy);
    this.drawBtn(false);
  }

  private drawBtn(hover: boolean): void {
    this.btnGfx.clear();
    this.btnGfx.fillStyle(hover ? 0x1a2a3a : 0x0d1520, 0.90);
    this.btnGfx.fillRect(4, 0, BTN_W, BTN_H);
  }

  // ── Dialog ──────────────────────────────────────────────────────────────────

  private openDialog(): void {
    if (this.dialogObjs.length) return;

    const s = this.scene;
    const { width, height } = this;
    const D = D_DEPTH;

    const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      this.dialogObjs.push(obj);
      return obj;
    };

    // Dimming overlay — click outside panel to close
    const bg = add(
      s.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
        .setDepth(D).setInteractive(),
    );
    bg.on('pointerdown', () => this.closeDialog());

    // Panel
    const panelW = Math.min(520, width - 32);
    const panelH = Math.min(460, height - 32);
    const px = width / 2, py = height / 2;
    const pLeft = px - panelW / 2;
    const pTop  = py - panelH / 2;

    const panelGfx = add(s.add.graphics().setDepth(D + 1).setLighting(false));
    panelGfx.fillStyle(0x0f1a28, 1);
    panelGfx.fillRoundedRect(pLeft, pTop, panelW, panelH, 12);
    panelGfx.lineStyle(2, 0x2a4060, 1);
    panelGfx.strokeRoundedRect(pLeft, pTop, panelW, panelH, 12);

    // Absorb clicks inside the panel so they don't reach the bg overlay
    const panelHit = add(s.add.rectangle(px, py, panelW, panelH, 0, 0).setDepth(D + 1).setInteractive());
    panelHit.on('pointerdown', () => { /* swallow */ });

    // Title
    add(s.add.text(pLeft + 20, pTop + 22, 'MENU', {
      fontSize: '14px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // Close button
    const closeSize = 26;
    const closeX = pLeft + panelW - 16 - closeSize / 2;
    const closeY = pTop + 22;
    const closeGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    const drawClose = (hover: boolean): void => {
      closeGfx.clear();
      closeGfx.fillStyle(hover ? 0x201808 : 0x141e2c, 1);
      closeGfx.fillRoundedRect(closeX - closeSize / 2, closeY - closeSize / 2, closeSize, closeSize, 5);
      closeGfx.lineStyle(1, hover ? 0xd4a820 : 0x2a4060, 1);
      closeGfx.strokeRoundedRect(closeX - closeSize / 2, closeY - closeSize / 2, closeSize, closeSize, 5);
    };
    drawClose(false);
    const closeLbl = add(s.add.text(closeX, closeY, '✕', {
      fontSize: '13px', color: '#90a8c0', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));
    const closeHit = add(
      s.add.rectangle(closeX, closeY, closeSize, closeSize, 0, 0)
        .setDepth(D + 4).setInteractive({ useHandCursor: true }),
    );
    closeHit.on('pointerover', () => { drawClose(true); (closeLbl as Phaser.GameObjects.Text).setColor('#ffe8a0'); });
    closeHit.on('pointerout',  () => { drawClose(false); (closeLbl as Phaser.GameObjects.Text).setColor('#90a8c0'); });
    closeHit.on('pointerdown', () => this.closeDialog());

    // ── Tab bar ────────────────────────────────────────────────────────────────
    const tabBarY = pTop + 50;
    const tabBarX = pLeft + 16;
    const tabBarW = panelW - 32;
    const tabW = tabBarW / TABS.length;
    const tabH = 30;

    const tabGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      const tx = tabBarX + i * tabW;
      const active = tab.id === this.currentTab;

      tabGfx.fillStyle(active ? 0x1e1608 : 0x0a1320, 1);
      tabGfx.fillRoundedRect(tx, tabBarY, tabW - (i < TABS.length - 1 ? 4 : 0), tabH, 6);
      if (active) {
        tabGfx.fillStyle(0xd4a820, 1);
        tabGfx.fillRoundedRect(tx, tabBarY + tabH - 3, tabW - (i < TABS.length - 1 ? 4 : 0), 3, { tl: 0, tr: 0, bl: 6, br: 6 });
      }

      const lbl = add(s.add.text(tx + (tabW - (i < TABS.length - 1 ? 4 : 0)) / 2, tabBarY + tabH / 2, tab.label, {
        fontSize: '12px',
        color: active ? '#d4a820' : '#5a7898',
        fontFamily: UI_FONT,
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(D + 3));

      const hit = add(
        s.add.rectangle(tx + (tabW - (i < TABS.length - 1 ? 4 : 0)) / 2, tabBarY + tabH / 2, tabW, tabH, 0, 0)
          .setDepth(D + 4).setInteractive({ useHandCursor: true }),
      );
      hit.on('pointerover', () => { if (tab.id !== this.currentTab) (lbl as Phaser.GameObjects.Text).setColor('#90b8d8'); });
      hit.on('pointerout',  () => { if (tab.id !== this.currentTab) (lbl as Phaser.GameObjects.Text).setColor('#5a7898'); });
      hit.on('pointerdown', () => {
        if (this.currentTab === tab.id) return;
        this.currentTab = tab.id;
        this.skinsPage = 0;
        this.redrawDialog();
      });
    }

    // ── Body ───────────────────────────────────────────────────────────────────
    const bodyTop = tabBarY + tabH + 14;
    const bodyBottom = pTop + panelH - 16;
    this.renderBody(px, bodyTop, panelW, bodyBottom - bodyTop, D);
  }

  private redrawDialog(): void {
    this.closeDialog(/* keepLayoutState */ true);
    this.openDialog();
  }

  private renderBody(px: number, top: number, panelW: number, availH: number, D: number): void {
    // Clear any existing body objects
    for (const obj of this.bodyObjs) obj.destroy();
    this.bodyObjs = [];

    const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      this.bodyObjs.push(obj);
      this.dialogObjs.push(obj);
      return obj;
    };

    if (this.currentTab === 'skins') {
      this.renderSkinsTab(add, px, top, panelW, availH, D);
    } else {
      this.renderStatsTab(add, px, top, panelW, availH, D);
    }
  }

  // ── SKINS tab ──────────────────────────────────────────────────────────────

  private renderSkinsTab(
    add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
    px: number, top: number, panelW: number, availH: number, D: number,
  ): void {
    const s = this.scene;
    const cellGap = 10;
    const gridW = panelW - 32;
    const cellW = (gridW - cellGap * (SKIN_COLS - 1)) / SKIN_COLS;
    const cellH = Math.min(110, (availH - 60) / SKIN_ROWS);
    const gridLeft = px - gridW / 2;

    const startIndex = this.skinsPage * SKINS_PER_PAGE;

    for (let row = 0; row < SKIN_ROWS; row++) {
      for (let col = 0; col < SKIN_COLS; col++) {
        const slot = startIndex + row * SKIN_COLS + col;
        if (slot >= TOTAL_SKINS) continue;

        const cx = gridLeft + col * (cellW + cellGap) + cellW / 2;
        const cy = top + row * (cellH + cellGap) + cellH / 2;

        const isDefault = slot === 0;

        const gfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
        if (isDefault) {
          gfx.fillStyle(0x1e1608, 1);
          gfx.fillRoundedRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH, 8);
          gfx.lineStyle(2, 0xd4a820, 1);
          gfx.strokeRoundedRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH, 8);
        } else {
          gfx.fillStyle(0x0a1320, 1);
          gfx.fillRoundedRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH, 8);
          gfx.lineStyle(1, 0x223044, 1);
          gfx.strokeRoundedRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH, 8);
        }

        if (isDefault) {
          add(s.add.text(cx, cy - 10, '🏙️', { fontSize: '22px', fontFamily: UI_FONT })
            .setOrigin(0.5).setDepth(D + 3));
          add(s.add.text(cx, cy + 22, 'Classic', {
            fontSize: '11px', color: '#ffe8a0', fontFamily: UI_FONT, fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(D + 3));
          add(s.add.text(cx, cy + 38, 'ACTIVE', {
            fontSize: '9px', color: '#d4a820', fontFamily: UI_FONT, fontStyle: 'bold',
          }).setOrigin(0.5).setDepth(D + 3));
        } else {
          const name = SKIN_NAMES[slot - 1] ?? `Skin ${slot + 1}`;
          add(s.add.text(cx, cy - 10, '🔒', { fontSize: '20px', fontFamily: UI_FONT })
            .setOrigin(0.5).setDepth(D + 3).setAlpha(0.45));
          add(s.add.text(cx, cy + 22, name, {
            fontSize: '10px', color: '#4a5a6a', fontFamily: UI_FONT,
            align: 'center', wordWrap: { width: cellW - 8 },
          }).setOrigin(0.5).setDepth(D + 3));
        }
      }
    }

    // Page selector
    const pagerY = top + SKIN_ROWS * (cellH + cellGap) + 6;
    const arrowSize = 26;

    const drawArrow = (gfx: Phaser.GameObjects.Graphics, x: number, hover: boolean, enabled: boolean): void => {
      gfx.clear();
      gfx.fillStyle(!enabled ? 0x0a1018 : (hover ? 0x201808 : 0x141e2c), 1);
      gfx.fillRoundedRect(x - arrowSize / 2, pagerY - arrowSize / 2, arrowSize, arrowSize, 5);
      gfx.lineStyle(1, !enabled ? 0x1a2230 : (hover ? 0xd4a820 : 0x2a4060), 1);
      gfx.strokeRoundedRect(x - arrowSize / 2, pagerY - arrowSize / 2, arrowSize, arrowSize, 5);
    };

    const prevX = px - 70;
    const nextX = px + 70;
    const canPrev = this.skinsPage > 0;
    const canNext = this.skinsPage < SKIN_PAGES - 1;

    const prevGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    drawArrow(prevGfx, prevX, false, canPrev);
    add(s.add.text(prevX, pagerY, '‹', {
      fontSize: '14px', color: canPrev ? '#90b8d8' : '#334455', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));
    if (canPrev) {
      const prevHit = add(
        s.add.rectangle(prevX, pagerY, arrowSize, arrowSize, 0, 0)
          .setDepth(D + 4).setInteractive({ useHandCursor: true }),
      );
      prevHit.on('pointerover', () => drawArrow(prevGfx, prevX, true, true));
      prevHit.on('pointerout',  () => drawArrow(prevGfx, prevX, false, true));
      prevHit.on('pointerdown', () => {
        this.skinsPage = Math.max(0, this.skinsPage - 1);
        this.redrawDialog();
      });
    }

    add(s.add.text(px, pagerY, `Page ${this.skinsPage + 1} / ${SKIN_PAGES}`, {
      fontSize: '12px', color: '#88aacc', fontFamily: UI_FONT,
    }).setOrigin(0.5).setDepth(D + 3));

    const nextGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    drawArrow(nextGfx, nextX, false, canNext);
    add(s.add.text(nextX, pagerY, '›', {
      fontSize: '14px', color: canNext ? '#90b8d8' : '#334455', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));
    if (canNext) {
      const nextHit = add(
        s.add.rectangle(nextX, pagerY, arrowSize, arrowSize, 0, 0)
          .setDepth(D + 4).setInteractive({ useHandCursor: true }),
      );
      nextHit.on('pointerover', () => drawArrow(nextGfx, nextX, true, true));
      nextHit.on('pointerout',  () => drawArrow(nextGfx, nextX, false, true));
      nextHit.on('pointerdown', () => {
        this.skinsPage = Math.min(SKIN_PAGES - 1, this.skinsPage + 1);
        this.redrawDialog();
      });
    }
  }

  // ── STATS tab ──────────────────────────────────────────────────────────────

  private renderStatsTab(
    add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
    px: number, top: number, panelW: number, _availH: number, D: number,
  ): void {
    const s = this.scene;
    const state = this.getState();
    const rowX = px - (panelW - 32) / 2;
    const rowW = panelW - 32;

    const rows: { label: string; value: string }[] = [
      { label: 'Total Playtime',     value: formatPlaytime(state.stats.totalPlayTimeMs) },
      { label: 'Skins Unlocked',     value: `${state.stats.skinsUnlocked} / ${TOTAL_SKINS}` },
      { label: 'Total Money Earned', value: fmtBalance(state.stats.totalMoneyEarned) },
    ];

    let y = top + 4;
    const rowH = 36;

    for (const row of rows) {
      add(s.add.text(rowX, y, row.label, {
        fontSize: '13px', color: '#88aacc', fontFamily: UI_FONT,
      }).setOrigin(0, 0.5).setDepth(D + 2));

      add(s.add.text(rowX + rowW, y, row.value, {
        fontSize: '13px', color: '#e0e8f0', fontFamily: MONO_FONT, fontStyle: 'bold',
      }).setOrigin(1, 0.5).setDepth(D + 2));

      // Subtle divider
      const div = add(s.add.graphics().setDepth(D + 2).setLighting(false));
      div.lineStyle(1, 0x1c2a3c, 1);
      div.lineBetween(rowX, y + rowH / 2 - 2, rowX + rowW, y + rowH / 2 - 2);

      y += rowH;
    }

    // Progress row + bar
    const progress = calculateProgress(state);
    add(s.add.text(rowX, y, 'Progress', {
      fontSize: '13px', color: '#88aacc', fontFamily: UI_FONT,
    }).setOrigin(0, 0.5).setDepth(D + 2));
    add(s.add.text(rowX + rowW, y, `${progress}%`, {
      fontSize: '13px', color: '#e0e8f0', fontFamily: MONO_FONT, fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(D + 2));
    y += 22;

    const barW = rowW;
    const barH = 12;
    const barGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    barGfx.fillStyle(0x0a1320, 1);
    barGfx.fillRoundedRect(rowX, y, barW, barH, 6);
    const fillW = Math.max(barH, barW * (progress / 100));
    barGfx.fillStyle(0xd4a820, 1);
    barGfx.fillRoundedRect(rowX, y, fillW, barH, 6);
    barGfx.lineStyle(1, 0x2a4060, 1);
    barGfx.strokeRoundedRect(rowX, y, barW, barH, 6);

    y += barH + 28;

    // PRESTIGE MODE button — disabled placeholder
    const btnW = rowW;
    const btnH = 40;
    const btnGfx = add(s.add.graphics().setDepth(D + 2).setLighting(false));
    btnGfx.fillStyle(0x0e1420, 1);
    btnGfx.fillRoundedRect(rowX, y, btnW, btnH, 6);
    btnGfx.lineStyle(1, 0x1c2a3c, 1);
    btnGfx.strokeRoundedRect(rowX, y, btnW, btnH, 6);
    add(s.add.text(rowX + btnW / 2, y + btnH / 2, 'PRESTIGE MODE', {
      fontSize: '13px', color: '#3a4a5a', fontFamily: UI_FONT, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(D + 3));

    add(s.add.text(rowX + btnW / 2, y + btnH + 14, 'Coming soon', {
      fontSize: '11px', color: '#3a4a5a', fontFamily: UI_FONT, fontStyle: 'italic',
    }).setOrigin(0.5).setDepth(D + 3));
  }

  private closeDialog(keepLayoutState = false): void {
    for (const obj of this.dialogObjs) obj.destroy();
    this.dialogObjs = [];
    this.bodyObjs = [];
    if (!keepLayoutState) {
      this.currentTab = TABS[0].id;
      this.skinsPage = 0;
    }
  }

  destroy(): void {
    this.closeDialog();
    this.btnGfx.destroy();
    this.btnLabel.destroy();
    this.btnHit.destroy();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPlaytime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
