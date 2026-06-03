import Phaser from 'phaser';
import { YARD_H, buildingHeight } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import { type DoorEntrance } from './types';

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16) |
          (Math.round(ag + (bg - ag) * t) << 8)  |
           Math.round(ab + (bb - ab) * t));
}

const FOUND_H   = 8;
const PARAPET_H = 12;
const SHOP_H    = 30;
const FLOOR_H   = 22;

// Neon sign color per shop slot
const NEON_COLORS = [0xff2266, 0x22ddff, 0xffaa00, 0x44ff88];

export class SmallApartment extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:  Phaser.GameObjects.Light[] = [];
  private neonLights:    Phaser.GameObjects.Light[] = [];
  private neonSpots:     SoftSpotLight[] = [];
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private lampConeGfx:    Phaser.GameObjects.Graphics | null = null;
  private neonGfx:        Phaser.GameObjects.Graphics | null = null;
  private flagGfx:        Phaser.GameObjects.Graphics | null = null;
  private flagLight:      Phaser.GameObjects.Light | null = null;
  private flagPoleX = 0;
  private flagTop   = 0;
  private lightPhases: number[] = [];
  private neonPhases:  number[] = [];
  private windowRects: Array<{ wx: number; wy: number; ww: number; wh: number; shop?: boolean }> = [];
  private shadowGfx!: Phaser.GameObjects.Graphics;

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    for (const spot of this.neonSpots) out.push(...spot.beams);
    return out;
  }

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const bw      = Math.round(w * 0.88);
    const bx      = x + Math.round((w - bw) / 2);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    const bodyTop = top + PARAPET_H;
    const bodyBot = buildGY - FOUND_H;
    const bodyH   = bodyBot - bodyTop;
    const shopTop = bodyBot - SHOP_H;

    // ── Brick body ────────────────────────────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, (bodyTop + bodyBot) / 2, bw, bodyH, 0x8a3a28);
    body.setLighting(true);
    this.add(body);

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation plinth ─────────────────────────────────────────
    gfx.fillStyle(0x707868, 1);
    gfx.fillRect(bx, bodyBot, bw, FOUND_H);
    gfx.lineStyle(1, 0x505850, 1);
    gfx.moveTo(bx, bodyBot).lineTo(bx + bw, bodyBot).strokePath();

    // ── Parapet ───────────────────────────────────────────────────
    gfx.fillStyle(0x6a7068, 1);
    gfx.fillRect(bx, top, bw, PARAPET_H);
    // Coping stones — widest, lightest, top 4px
    gfx.fillStyle(0x8a9088, 1);
    gfx.fillRect(bx - 2, top, bw + 4, 4);
    // Shadow strip under coping
    gfx.fillStyle(0x4a504a, 1);
    gfx.fillRect(bx - 2, top + 4, bw + 4, 1);
    // Base shadow where parapet meets brick
    gfx.fillStyle(0x3a1810, 0.3);
    gfx.fillRect(bx, top + PARAPET_H - 1, bw, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(0xb8b0a0, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.lineStyle(1, 0xa0988a, 0.4);
    for (let px = x + 30; px < x + w; px += 30) {
      gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
    }

    // ── Brick mortar courses (upper section only) ─────────────────
    gfx.lineStyle(1, 0x6a2818, 0.22);
    for (let by = bodyTop + 4; by < shopTop; by += 5) {
      gfx.moveTo(bx, by).lineTo(bx + bw, by).strokePath();
    }

    // ── Upper floor glass curtain wall ────────────────────────────
    const upperH   = shopTop - bodyTop;
    const nFloors  = Math.max(2, Math.floor(upperH / FLOOR_H));
    const actualFH = Math.round(upperH / nFloors);
    const spanH    = 5;

    // Brick piers between glass panels
    const nCols   = 3;
    const pierW   = Math.max(6, Math.round(bw * 0.055));
    const panelW  = Math.round((bw - pierW * (nCols + 1)) / nCols);
    const panelH  = Math.round((actualFH - spanH) * 0.78);

    // Lv 45+: precast concrete spandrel bands
    if (level >= 45) {
      for (let f = 0; f < nFloors; f++) {
        const spanY = shopTop - (f + 1) * actualFH;
        gfx.fillStyle(0x7a8078, 1);
        gfx.fillRect(bx, spanY, bw, spanH);
        gfx.fillStyle(0x9aa098, 1);
        gfx.fillRect(bx, spanY, bw, 1);
        gfx.fillStyle(0x5a605a, 1);
        gfx.fillRect(bx, spanY + spanH - 1, bw, 1);
      }
    }

    // Lv 46+: corner structural concrete columns
    if (level >= 46) {
      const colW = pierW + 2;
      gfx.fillStyle(0x8a9088, 1);
      gfx.fillRect(bx,               bodyTop, colW, upperH);
      gfx.fillRect(bx + bw - colW,   bodyTop, colW, upperH);
      gfx.fillStyle(0xaab0a8, 1);
      gfx.fillRect(bx,               bodyTop, colW, 2);
      gfx.fillRect(bx + bw - colW,   bodyTop, colW, 2);
    }

    // Glass panels and per-floor lights
    for (let f = 0; f < nFloors; f++) {
      const floorBot  = shopTop - f * actualFH;
      const panelY    = floorBot - spanH - panelH - Math.round((actualFH - spanH - panelH) / 2);

      if (panelY < bodyTop + 2 || panelY + panelH > floorBot - 1) continue;

      for (let c = 0; c < nCols; c++) {
        const panelX = bx + pierW * (c + 1) + panelW * c;

        // Lv 47+: balcony railing above glass panels (upper floors only)
        if (level >= 47 && f > 0) {
          gfx.fillStyle(0x4a5050, 1);
          gfx.fillRect(panelX - 1, panelY + panelH + 1, panelW + 2, 2);
          for (let ri = panelX + 1; ri < panelX + panelW; ri += 4) {
            gfx.fillRect(ri, panelY + panelH + 1, 1, 4);
          }
        }

        // Lv 52+: tinted spandrel accents on alternate floors
        if (level >= 52 && f % 2 === 1) {
          gfx.fillStyle(0x2a4858, 0.4);
          gfx.fillRect(panelX, panelY + panelH, panelW, spanH - 1);
        }

        this.windowRects.push({ wx: panelX, wy: panelY, ww: panelW, wh: panelH });
      }

      // One light per glass panel column
      for (let c = 0; c < nCols; c++) {
        const panelX = bx + pierW * (c + 1) + panelW * c;
        this.windowLights.push(scene.lights.addLight(
          panelX + Math.round(panelW / 2), floorBot - Math.round(actualFH / 2), 72, 0xffaa44, 0,
        ));
      }
    }

    // ── Shop fronts ground floor ───────────────────────────────────
    const nShops  = 2;
    const shopW   = Math.round(bw / nShops);
    const doorW   = Math.round(shopW * 0.23);
    const doorH   = Math.round(SHOP_H * 0.78);
    const signH   = 8;
    const signY   = shopTop + 2;

    for (let s = 0; s < nShops; s++) {
      const sx   = bx + s * shopW;
      const sw_  = (s === nShops - 1) ? (bx + bw - sx) : shopW;

      // Shop frame / fascia
      gfx.fillStyle(0x2a2820, 1);
      gfx.fillRect(sx, shopTop, sw_, SHOP_H);

      // Neon sign housing (lv 42+ gets drawn on neonGfx, but housing always visible)
      if (level >= 42) {
        gfx.fillStyle(0x1a1810, 1);
        gfx.fillRect(sx + 2, signY, sw_ - doorW - 4, signH);
        // Dim frame border
        gfx.lineStyle(1, NEON_COLORS[s % NEON_COLORS.length] & 0x444444 | 0x222222, 1);
        gfx.strokeRect(sx + 2, signY, sw_ - doorW - 5, signH);
      }

      // Display window (large glass)
      const dispX = sx + 2;
      const dispW = sw_ - doorW - 6;
      const dispY = signY + signH + 2;
      const dispH = SHOP_H - signH - 6;
      gfx.fillStyle(0x1e3040, 1);
      gfx.fillRect(dispX - 1, dispY - 1, dispW + 2, dispH + 2);
      // Store for glass animation
      this.windowRects.push({ wx: dispX, wy: dispY, ww: dispW, wh: dispH, shop: true });

      // Door
      const doorX = sx + sw_ - doorW - 2;
      const doorY = bodyBot - doorH;
      gfx.fillStyle(0x1a1810, 1);
      gfx.fillRect(doorX, doorY, doorW, doorH);
      gfx.fillStyle(0x2a5066, 0.5);
      gfx.fillRect(doorX + 2, doorY + 2, doorW - 4, doorH - 4);
      // Glass pane divider
      gfx.fillStyle(0x3a3830, 1);
      gfx.fillRect(doorX + Math.round(doorW / 2) - 1, doorY, 2, doorH);
      // Door handle
      gfx.fillStyle(0xd0c060, 1);
      gfx.fillRect(doorX + doorW - 5, doorY + Math.round(doorH * 0.48), 3, 2);

      // Door entrance for pedestrian manager
      this.doorEntrances.push({ x: doorX + Math.round(doorW / 2), y: bodyBot });

      // Neon light source
      const nc = NEON_COLORS[s % NEON_COLORS.length];
      this.neonLights.push(scene.lights.addLight(
        sx + 2 + Math.round((sw_ - doorW - 4) / 2), signY + Math.round(signH / 2), 35, nc, 0,
      ));
    }

    // Shop fascia divider pier between shops
    gfx.fillStyle(0x2a2820, 1);
    gfx.fillRect(bx + shopW - 2, shopTop, 4, SHOP_H);

    // Header band at top of shop front (caps shop fronts against upper brick)
    gfx.fillStyle(0x1e1e18, 1);
    gfx.fillRect(bx, shopTop - 3, bw, 4);
    // Shadow under header band
    gfx.fillStyle(0x000000, 0.35);
    gfx.fillRect(bx, shopTop + 1, bw, 3);

    // ── Lv 43+: hanging diagonal bunting flags ────────────────────
    if (level >= 43) {
      const buntY   = shopTop - 5;
      const pennantColors = [0xdd2222, 0x2255cc, 0xeecc00, 0x22aa44, 0xdd6600, 0xcc22aa];
      const seg     = 20;  // spacing between attachment hooks
      const sagPx   = 6;
      let ci        = 0;

      for (let hx = bx + 2; hx + seg <= bx + bw - 2; hx += seg) {
        const hx2 = hx + seg;
        const mid = Math.round((hx + hx2) / 2);

        // String (catenary sag)
        gfx.lineStyle(1, 0x888878, 0.65);
        gfx.moveTo(hx, buntY).lineTo(mid, buntY + sagPx).lineTo(hx2, buntY).strokePath();

        // Pennant triangles along this string segment
        for (let step = 3; step <= seg - 3; step += 7) {
          const t_   = step / seg;
          const py   = buntY + Math.sin(t_ * Math.PI) * sagPx;
          const px_  = hx + step;
          gfx.fillStyle(pennantColors[ci % pennantColors.length], 1);
          gfx.fillTriangle(px_, Math.round(py), px_ + 4, Math.round(py), px_ + 2, Math.round(py) + 5);
          ci++;
        }
      }
    }

    // Lv 48+: entrance canopy over shop area center
    if (level >= 48) {
      const cW  = Math.round(bw * 0.38);
      const cX  = bx + Math.round((bw - cW) / 2);
      const cY  = shopTop - 14;
      gfx.fillStyle(0x283830, 1);
      gfx.fillRect(cX, cY, cW, 5);
      // Canopy shadow cast below
      gfx.fillStyle(0x000000, 0.25);
      gfx.fillRect(cX + 2, cY + 5, cW, 4);
      // Support rods
      gfx.fillStyle(0x485048, 1);
      gfx.fillRect(cX + 2,       cY + 5, 2, cY + 14 - (cY + 5));
      gfx.fillRect(cX + cW - 4,  cY + 5, 2, cY + 14 - (cY + 5));
    }

    // Lv 49+: street lamp
    let lampPos: { cx: number; cy: number } | null = null;
    if (level >= 49) {
      const lx = bx - 10, ly = buildGY - 28;
      gfx.fillStyle(0x3a3a3a, 1);
      gfx.fillRect(lx - 1, ly, 3, 28);
      gfx.fillRect(lx - 1, ly, 10, 2);
      gfx.fillStyle(0xffe080, 1);
      gfx.fillCircle(lx + 9, ly + 1, 3);
      lampPos = { cx: lx + 9, cy: ly + 1 };
    }

    // Lv 50+: rooftop A/C units
    if (level >= 50) {
      for (let ai = 0; ai < 4; ai++) {
        const aX = bx + Math.round(bw * (ai * 0.22 + 0.04));
        gfx.fillStyle(0x8a8a92, 1);
        gfx.fillRect(aX, top - 8, 14, 8);
        gfx.fillStyle(0x6a6a72, 1);
        gfx.fillRect(aX, top - 8, 14, 2);
        // Cast shadow on roof
        gfx.fillStyle(0x000000, 0.25);
        gfx.fillRect(aX + 1, top, 14, 2);
      }
    }

    // Lv 51+: rooftop water tower
    if (level >= 51) {
      const twX = bx + Math.round(bw * 0.72);
      const twW = 18, twH = 20;
      // Tank body with vertical stave lines
      gfx.fillStyle(0x7a6858, 1);
      gfx.fillRect(twX, top - twH, twW, twH);
      gfx.fillStyle(0x5a4838, 1);
      gfx.fillRect(twX,          top - twH, 3, twH);
      gfx.fillRect(twX + twW - 3, top - twH, 3, twH);
      gfx.lineStyle(1, 0x5a4838, 0.5);
      for (let sx_ = twX + 6; sx_ < twX + twW - 3; sx_ += 4) {
        gfx.moveTo(sx_, top - twH).lineTo(sx_, top).strokePath();
      }
      // Conical roof
      gfx.fillStyle(0x504038, 1);
      gfx.fillTriangle(twX - 2, top - twH, twX + twW + 2, top - twH,
                       twX + Math.round(twW / 2), top - twH - 7);
      // Support legs with shadow
      gfx.fillStyle(0x6a5848, 1);
      gfx.fillRect(twX + 2,        top, 3, 7);
      gfx.fillRect(twX + twW - 5,  top, 3, 7);
      gfx.fillStyle(0x000000, 0.3);
      gfx.fillRect(twX + 3,        top, 2, 4);
      gfx.fillRect(twX + twW - 4,  top, 2, 4);
    }

    // Lv 53+: fire escape right side
    if (level >= 53) {
      const feX = bx + bw - 5;
      gfx.fillStyle(0x505860, 1);
      gfx.fillRect(feX,     bodyTop, 2, upperH);
      gfx.fillRect(feX + 4, bodyTop, 2, upperH);
      // Landing platforms every other floor
      for (let f = 0; f < nFloors; f += 2) {
        const fy = shopTop - f * actualFH - actualFH;
        gfx.fillRect(feX - 2, fy, 8, 2);
      }
      // Shadow from fire escape
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillRect(feX + 2, bodyTop, 4, upperH);
    }

    // Lv 54+: street trees / planters
    if (level >= 54) {
      for (const [tX, isLeft] of [[x + 4, true], [x + w - 14, false]] as [number, boolean][]) {
        gfx.fillStyle(0x3a4430, 1);
        gfx.fillRect(tX, buildGY + 2, 10, 8);
        // Trunk
        gfx.fillStyle(0x5a3820, 1);
        gfx.fillRect(tX + 4, buildGY - 4, 2, 6);
        // Foliage
        gfx.fillStyle(0x2a6818, 1);
        gfx.fillCircle(tX + 5, buildGY - 8, 7);
        gfx.fillStyle(0x388a22, 1);
        gfx.fillCircle(tX + (isLeft ? 3 : 7), buildGY - 12, 4);
      }
    }

    // Lv 55+: decorative brick corner turrets rising above parapet
    if (level >= 55) {
      const turW = 8, turH = 10;
      // Left turret body (brick matching body color)
      gfx.fillStyle(0x8a3a28, 1);
      gfx.fillRect(bx - 1, top - turH, turW, turH);
      gfx.lineStyle(1, 0x6a2818, 0.22);
      for (let by = top - turH + 4; by < top; by += 5) {
        gfx.moveTo(bx - 1, by).lineTo(bx - 1 + turW, by).strokePath();
      }
      // Left turret coping cap (grey stone, slightly wider)
      gfx.fillStyle(0x8a9088, 1);
      gfx.fillRect(bx - 2, top - turH - 3, turW + 2, 4);
      gfx.fillStyle(0xaab0a8, 1);
      gfx.fillRect(bx - 2, top - turH - 3, turW + 2, 1);
      gfx.fillStyle(0x4a504a, 1);
      gfx.fillRect(bx - 2, top - turH + 1, turW + 2, 1);

      // Right turret body
      gfx.fillStyle(0x8a3a28, 1);
      gfx.fillRect(bx + bw - turW + 1, top - turH, turW, turH);
      gfx.lineStyle(1, 0x6a2818, 0.22);
      for (let by = top - turH + 4; by < top; by += 5) {
        gfx.moveTo(bx + bw - turW + 1, by).lineTo(bx + bw + 1, by).strokePath();
      }
      // Right turret coping cap
      gfx.fillStyle(0x8a9088, 1);
      gfx.fillRect(bx + bw - turW, top - turH - 3, turW + 2, 4);
      gfx.fillStyle(0xaab0a8, 1);
      gfx.fillRect(bx + bw - turW, top - turH - 3, turW + 2, 1);
      gfx.fillStyle(0x4a504a, 1);
      gfx.fillRect(bx + bw - turW, top - turH + 1, turW + 2, 1);
    }

    this.add(gfx);

    // ── Lv 44+: flagpole + animated flag ─────────────────────────
    if (level >= 44) {
      const fpX    = bx + Math.round(bw * 0.18);
      const fpTop_ = top - 30;
      gfx.fillStyle(0xa0a0a8, 1);
      gfx.fillRect(fpX - 1, fpTop_, 2, 30);
      gfx.fillStyle(0xd0d0d8, 1);
      gfx.fillRect(fpX - 1, fpTop_, 2, 2);

      const flagGfx = scene.add.graphics();
      flagGfx.setLighting(true);
      this.add(flagGfx);
      this.flagGfx   = flagGfx;
      this.flagPoleX = fpX;
      this.flagTop   = fpTop_;
      this.flagLight = scene.lights.addLight(fpX + 9, fpTop_ + 5, 40, 0xfff0cc, 0);
    }

    // ── Lamp cone (ADD blend: lamp + neon glow) ───────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (lampPos) {
      lampConeGfx.fillStyle(0xffe080, 1);
      lampConeGfx.fillCircle(lampPos.cx, lampPos.cy, 3);
      this.windowLights.push(scene.lights.addLight(lampPos.cx, lampPos.cy, 44, 0xffcc44, 0));
    }
    this.add(lampConeGfx);
    this.lampConeGfx = lampConeGfx;

    // ── Neon sign glow (ADD blend, separate alpha from lamp) ──────
    const neonGfx = scene.add.graphics();
    neonGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (level >= 42) {
      for (let s = 0; s < nShops; s++) {
        const sx  = bx + s * shopW;
        const sw_ = (s === nShops - 1) ? (bx + bw - sx) : shopW;
        const nc  = NEON_COLORS[s % NEON_COLORS.length];
        const nx  = sx + 3;
        const nw  = sw_ - doorW - 7;

        // Neon tube border: tiny circles (1.5px) along sign perimeter, like the for-sale bulbs
        neonGfx.fillStyle(nc, 1);
        const step = 4;
        for (let px = nx; px <= nx + nw; px += step) {
          neonGfx.fillCircle(px, signY,          1.5);
          neonGfx.fillCircle(px, signY + signH,  1.5);
        }
        for (let py = signY + step; py < signY + signH; py += step) {
          neonGfx.fillCircle(nx,      py, 1.5);
          neonGfx.fillCircle(nx + nw, py, 1.5);
        }

        // Unreadable pixel-art "text": white dots inside
        neonGfx.fillStyle(0xffffff, 1);
        const segW_ = Math.round(nw / 4);
        for (let si = 0; si < 3; si++) {
          const lx_ = nx + segW_ * si + 2;
          for (let px = lx_; px < lx_ + segW_ - 4; px += 3) neonGfx.fillCircle(px, signY + 2, 1);
          for (let px = lx_; px < lx_ + Math.round((segW_ - 4) * 0.55); px += 3) neonGfx.fillCircle(px, signY + 5, 1);
        }

        // Downward SoftSpotLight illuminating the shop face below the sign
        this.neonSpots.push(new SoftSpotLight({
          x:           nx + Math.round(nw / 2),
          y:           signY + signH,
          radius:      58,
          color:       nc,
          intensity:   0,
          angle:       Math.PI / 2,
          coneAngle:   Math.PI / 2 * 0.6,
          noOcclusion: true,
        }));
      }
    }
    this.add(neonGfx);
    this.neonGfx = neonGfx;

    // ── Window glass overlay ──────────────────────────────────────
    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    this.lightPhases = this.windowLights.map(() => Math.random() * Math.PI * 2);
    this.neonPhases  = this.neonLights.map(()   => Math.random() * Math.PI * 2);

    // ── Shadow overlay ────────────────────────────────────────────
    const sg = scene.add.graphics();
    sg.fillStyle(0x000022, 1);
    // Main building silhouette with parapet outline
    sg.beginPath();
    sg.moveTo(bx - 2, top);
    sg.lineTo(bx + bw + 2, top);
    sg.lineTo(bx + bw + 2, top + 5);
    sg.lineTo(bx + bw, top + 5);
    sg.lineTo(bx + bw, buildGY);
    sg.lineTo(bx, buildGY);
    sg.lineTo(bx, top + 5);
    sg.lineTo(bx - 2, top + 5);
    sg.closePath();
    sg.fillPath();

    // Water tower (lv 51+)
    if (level >= 51) {
      const twX = bx + Math.round(bw * 0.72);
      const twW = 18, twH = 20;
      sg.fillRect(twX, top - twH, twW, twH);
      sg.fillTriangle(twX - 2, top - twH, twX + twW + 2, top - twH,
                      twX + Math.round(twW / 2), top - twH - 7);
    }
    // Flag pole (lv 44+)
    if (level >= 44) {
      const fpX = bx + Math.round(bw * 0.18);
      sg.fillRect(fpX - 1, top - 30, 2, 21);
    }
    // A/C units (lv 50+)
    if (level >= 50) {
      for (let ai = 0; ai < 4; ai++) {
        const aX = bx + Math.round(bw * (ai * 0.22 + 0.04));
        sg.fillRect(aX, top - 8, 14, 8);
      }
    }
    // Corner turrets (lv 55+)
    if (level >= 55) {
      sg.fillRect(bx - 2, top - 13, 10, 13);
      sg.fillRect(bx + bw - 8, top - 13, 10, 13);
    }
    sg.setDepth(9.15);
    sg.setAlpha(0);
    this.shadowGfx = sg;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
      for (const light of this.neonLights)   scene.lights.removeLight(light);
      if (this.flagLight) scene.lights.removeLight(this.flagLight);
      this.shadowGfx.destroy();
    });
  }

  setShadowAlpha(alpha: number): void { this.shadowGfx.setAlpha(alpha); }

  updateWindowLights(elevation: number): void {
    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    if (t < 0.01 && this.windowLights.every(l => l.intensity < 0.01)) return;

    const ambientIntensity = elevation >= 0.3 ? 1.0
      : elevation >= 0 ? 0.5 + (elevation / 0.3) * 0.5
      : 0.5;
    const tNorm = t * (0.5 / ambientIntensity);
    const time  = this.scene.time.now / 1000;

    this.windowLights.forEach((light, i) => {
      const flicker = 1 + Math.sin(time * 1.7 + this.lightPhases[i]) * 0.08;
      light.intensity = tNorm * 0.42 * flicker;
    });
    this.neonLights.forEach((light, i) => {
      const pulse = 1 + Math.sin(time * 2.3 + this.neonPhases[i]) * 0.12;
      light.intensity = tNorm * 0.4 * pulse;
    });
    for (const spot of this.neonSpots) spot.setIntensity(tNorm * 2.0);

    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, tNorm);
    if (this.lampConeGfx)    this.lampConeGfx.setAlpha(tNorm * 0.45);
    if (this.neonGfx)        this.neonGfx.setAlpha(tNorm * 0.9);
    if (this.flagLight)      this.flagLight.intensity = tNorm * 0.6;
  }

  updateFlag(): void {
    if (this.flagGfx) this.drawFlag(this.flagGfx, this.scene.time.now / 1000);
  }

  private drawFlag(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    const fx = this.flagPoleX + 1;
    const fy = this.flagTop;
    const fw = 16, fh = 10;
    const wave = Math.sin(time * 4) * 2;
    const mid  = Math.sin(time * 4 + 1) * 1.2;
    const mcx  = fx + Math.round(fw / 2);
    gfx.fillStyle(0xcc2222, 1);
    gfx.fillTriangle(fx, fy, fx, fy + fh, mcx, fy + fh + mid);
    gfx.fillTriangle(fx, fy, mcx, fy + fh + mid, mcx, fy + mid);
    gfx.fillStyle(0xee4444, 1);
    gfx.fillTriangle(mcx, fy + mid, mcx, fy + fh + mid, fx + fw, fy + fh + wave);
    gfx.fillTriangle(mcx, fy + mid, fx + fw, fy + fh + wave, fx + fw, fy + wave);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number): void {
    gfx.clear();
    for (const { wx, wy, ww, wh, shop } of this.windowRects) {
      if (shop) {
        // Shop display windows: larger glass, warm interior glow at night
        gfx.fillStyle(lerpColor(0x3a6888, 0xffdd88, t), 1);
        gfx.fillRect(wx, wy, ww, wh);
        // Subtle reflection highlight
        gfx.fillStyle(0xffffff, Math.max(0, 0.12 - t * 0.1));
        gfx.fillRect(wx, wy, ww, 2);
      } else {
        // Upper floor curtain wall panels: tall glass, cool day / warm night
        gfx.fillStyle(lerpColor(0x4a8aaa, 0xffcc66, t), 1);
        gfx.fillRect(wx, wy, ww, wh);
        // Single horizontal mid-pane divider
        gfx.fillStyle(0xffffff, 0.18);
        gfx.fillRect(wx, wy + Math.round(wh / 2), ww, 1);
      }
    }
  }
}
