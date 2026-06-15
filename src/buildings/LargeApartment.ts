import Phaser from 'phaser';
import { YARD_H, buildingHeight, multiplyColor, lerpColor, NIGHT_TINT, TREE_CANOPY_TINT, TREE_TRUNK_TINT } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { SoftSpotLight } from '../lighting/SoftSpotLight';
import { type DoorEntrance, type WindowRect } from './types';
import type { BuildingPalette, ThemeParams } from '../theme/ThemeTypes';
import { CANOPY_SMALL_R } from '../objects/TreeAssets';
import { randTvColor, addYardTree } from './buildingHelpers';

const FOUND_H   = 10;
const LOBBY_H   = 34;
const FLOOR_H   = 18;
const PARAPET_H = 10;

// Hotel flag dimensions — shared between constructor (margin calc) and draw
const HF_FW   = 20;  // flag length along pole direction
const HF_FH   = 13;  // flag height perpendicular to pole
const HF_POLE = 18;  // diagonal pole length

// Hotel flag: three distinct colour bands per flag [inner, mid, outer]
const HOTEL_PALETTES: ReadonlyArray<readonly [number, number, number]> = [
  [0xcc2020, 0xffffff, 0x2233cc],  // red-white-blue
  [0x228844, 0xffdd00, 0x44aaff],  // green-gold-sky
  [0xcc2266, 0xffffff, 0x7722cc],  // crimson-white-purple
  [0xff6600, 0xffffff, 0x002288],  // orange-white-navy
  [0x1155bb, 0xffdd00, 0x1155bb],  // royal-gold-royal
  [0x882211, 0xffee44, 0x116633],  // burgundy-yellow-forest
];

export class LargeApartment extends Phaser.GameObjects.Container {
  readonly doorEntrances: DoorEntrance[] = [];
  private windowLights:   Phaser.GameObjects.Light[] = [];
  private signLight:      Phaser.GameObjects.Light | null = null;
  private signSpot:       SoftSpotLight | null = null;
  private windowGlassGfx: Phaser.GameObjects.Graphics | null = null;
  private accentGfx:      Phaser.GameObjects.Graphics | null = null; // lv 62 LED band
  private flagGfx:        Phaser.GameObjects.Graphics | null = null; // rooftop flag
  private flagLight:      Phaser.GameObjects.Light | null = null;
  private flagPoleX = 0;
  private flagTop   = 0;
  private hotelFlagGfx:    Phaser.GameObjects.Graphics | null = null;
  private hotelFlags: Array<{ poleX: number; poleY: number; dir: 1 | -1; palette: readonly [number, number, number] }> = [];
  private hotelFlagPhases: number[] = [];
  private hotelFlagLights: Phaser.GameObjects.Light[] = [];
  private lobbyLight:     Phaser.GameObjects.Light | null = null;
  private searchlightGfx: Phaser.GameObjects.Graphics | null = null;
  private searchlightX    = 0;
  private searchlightY    = 0;
  private lightPhases:   number[] = [];
  private flickerFreqs:   number[] = [];
  private lastSleepHour  = -1;
  private pendingSleepAt = Infinity;
  private windowRects:   Array<WindowRect> = [];
  private shadowGfx!:   Phaser.GameObjects.Graphics;
  private glassDayColor = 0;
  private neonSignGfx: Phaser.GameObjects.Graphics | null = null;
  private _neonX = 0;
  private _neonY = 0;
  private _neonPhase = 0;
  private yardTreeImages: Array<{ img: Phaser.GameObjects.Image; baseTint: number }> = [];

  get extraLights(): LightSource[] {
    return this.signSpot ? [...this.signSpot.beams] : [];
  }

  constructor(scene: Phaser.Scene, x: number, plotWidth: number, groundY: number, level: number, palette: BuildingPalette, _params: ThemeParams) {
    super(scene, 0, 0);

    const w       = plotWidth;
    const h       = buildingHeight(level);
    const bw      = Math.round(w * 0.90);
    const bx      = x + Math.round((w - bw) / 2);
    const buildGY = groundY - YARD_H;
    const top     = buildGY - h;
    const bodyTop = top + PARAPET_H;
    const bodyBot = buildGY - FOUND_H;
    const lobbyTop = bodyBot - LOBBY_H;

    // ── Lv 68+: penthouse setback ─────────────────────────────────
    const pentFloors = level >= 68 ? 2 : 0;
    const pentH      = pentFloors * FLOOR_H;
    const pentBw     = level >= 68 ? Math.round(bw * 0.86) : bw;
    const pentBx     = level >= 68 ? bx + Math.round((bw - pentBw) / 2) : bx;

    this.glassDayColor = palette.glass;

    // ── Dark steel-frame curtain wall body ────────────────────────
    const body = scene.add.rectangle(bx + bw / 2, (bodyTop + bodyBot) / 2, bw, bodyBot - bodyTop, palette.wall);
    body.setLighting(true);
    this.add(body);

    // Penthouse (slightly lighter dark, inset)
    if (pentFloors > 0) {
      const pent = scene.add.rectangle(pentBx + pentBw / 2, bodyTop + pentH / 2, pentBw, pentH, palette.wallShade);
      pent.setLighting(true);
      this.add(pent);
    }

    const gfx = scene.add.graphics();
    gfx.setLighting(true);

    // ── Foundation plinth ─────────────────────────────────────────
    gfx.fillStyle(palette.foundation, 1);
    gfx.fillRect(bx, bodyBot, bw, FOUND_H);
    gfx.fillStyle(0x181e28, 1);
    gfx.fillRect(bx, bodyBot, bw, 1);

    // ── Parapet — dark steel cap with bright metal edge ───────────
    gfx.fillStyle(palette.wall, 1);
    gfx.fillRect(bx, top, bw, PARAPET_H);
    // Bright aluminium coping strip
    gfx.fillStyle(0x90a8c0, 1);
    gfx.fillRect(bx - 2, top, bw + 4, 2);
    gfx.fillStyle(0x4a6080, 1);
    gfx.fillRect(bx - 2, top + 2, bw + 4, 1);

    // ── Sidewalk ──────────────────────────────────────────────────
    gfx.fillStyle(palette.yardGround, 1);
    gfx.fillRect(x, buildGY, w, YARD_H);
    gfx.lineStyle(1, 0xa0988a, 0.4);
    for (let px = x + 30; px < x + w; px += 30) {
      gfx.moveTo(px, buildGY).lineTo(px, groundY).strokePath();
    }

    // ── Curtain wall grid ─────────────────────────────────────────
    // Thin aluminium mullions dividing 5 glass bays
    const nCols    = 5;
    const colW     = Math.max(2, Math.round(bw * 0.018)); // thin mullions
    const bayW     = Math.round((bw - colW * (nCols - 1)) / nCols);
    const upperH   = lobbyTop - bodyTop;
    const nFloors  = Math.max(2, Math.floor(upperH / (FLOOR_H * 2)));
    const actualFH = Math.round(upperH / nFloors);

    // Spandrel bands — very thin to maximise visible glass
    gfx.fillStyle(palette.glassShade, 1);
    for (let f = 1; f < nFloors; f++) {
      const fy = lobbyTop - f * actualFH;
      gfx.fillRect(bx, fy, bw, 1);
    }

    // Vertical mullion strips
    gfx.fillStyle(palette.glassShade, 1);
    for (let c = 1; c < nCols; c++) {
      const cx_ = bx + c * (bayW + colW) - colW;
      gfx.fillRect(cx_, bodyTop, colW, upperH);
    }

    // ── Lv 62+: mid-building horizontal accent band ───────────────
    const midBandFloor = level >= 62 ? Math.round(nFloors * 0.5) : -1;
    if (midBandFloor > 0) {
      const mby = lobbyTop - midBandFloor * actualFH;
      // Wider dark spandrel + teal tint accent
      gfx.fillStyle(0x0a1018, 1);
      gfx.fillRect(bx, mby - 1, bw, 5);
      gfx.fillStyle(0x1a6080, 0.6);
      gfx.fillRect(bx, mby + 1, bw, 2);
    }

    // ── Lv 64+: vertical fin accents ──────────────────────────────
    const finsFrom = level >= 64 ? Math.round(nFloors * 0.55) : nFloors + 1;

    // ── Floor glass panels (5 bays, near floor-to-ceiling) ────────
    const wh     = Math.round(actualFH * 0.93);
    const panelW = bayW;

    for (let f = 0; f < nFloors; f++) {
      const floorBot = lobbyTop - f * actualFH;
      const panelY   = floorBot - Math.round((actualFH + wh) / 2);

      if (panelY < bodyTop + 2 || panelY + wh > floorBot - 1) continue;

      // Balcony slab: lv 58+, every 3rd floor — dark steel
      if (level >= 58 && f % 3 === 0 && f > 0) {
        gfx.fillStyle(0x2a3848, 1);
        gfx.fillRect(bx - 4, floorBot - 3, bw + 8, 4);
        // Glass railing above slab
        gfx.fillStyle(0x5080a8, 0.35);
        gfx.fillRect(bx - 4, floorBot - 7, bw + 8, 3);
      }

      for (let c = 0; c < nCols; c++) {
        const panelX = bx + c * (bayW + colW);

        // Lv 64+: extra silver fin projection between upper bays
        if (level >= 64 && f >= finsFrom && c < nCols - 1) {
          const finX = bx + (c + 1) * (bayW + colW) - colW;
          gfx.fillStyle(0x506070, 0.8);
          gfx.fillRect(finX - 1, panelY, colW + 2, wh);
        }

        this.windowRects.push({ wx: panelX, wy: panelY, ww: panelW, wh, isTv: Math.random() < 0.2, flickerFreq: 0.5 + Math.random() * 2.5, tvColor: randTvColor(), asleep: false });
      }

      // One centred light per floor — covers full building width evenly
      this.windowLights.push(scene.lights.addLight(
        bx + Math.round(bw / 2), floorBot - Math.round(actualFH / 2), Math.round(bw * 0.7), 0xffcc77, 0,
      ));
    }

    // ── Hotel lobby entrance — bright shop-floor illumination ────────
    gfx.fillStyle(0x3a6880, 1);
    gfx.fillRect(bx, lobbyTop, bw, LOBBY_H);
    // Overhead lighting strips — dense, bright
    gfx.fillStyle(0x90cce8, 0.65);
    for (let lx = bx + 4; lx < bx + bw - 4; lx += 12) {
      gfx.fillRect(lx, lobbyTop + 4, 8, LOBBY_H - 8);
    }
    // Ceiling light bar — near-white bloom at top of lobby interior
    gfx.fillStyle(0xd8f0ff, 0.50);
    gfx.fillRect(bx + 2, lobbyTop + 4, bw - 4, 4);
    // Lobby frame bar
    gfx.fillStyle(palette.glassShade, 1);
    gfx.fillRect(bx, lobbyTop, bw, 3);
    gfx.fillStyle(0x5aa8d0, 0.5);
    gfx.fillRect(bx, lobbyTop + 1, bw, 1);

    // Two symmetrical doors
    const doorW = Math.round(bw * 0.14);
    const doorH = Math.round(LOBBY_H * 0.82);
    const door1X = bx + Math.round(bw * 0.25) - Math.round(doorW / 2);
    const door2X = bx + Math.round(bw * 0.75) - Math.round(doorW / 2);
    for (const doorX of [door1X, door2X]) {
      gfx.fillStyle(palette.door, 1);
      gfx.fillRect(doorX, bodyBot - doorH, doorW, doorH);
      gfx.fillStyle(palette.doorAccent, 0.6);
      gfx.fillRect(doorX + 2, bodyBot - doorH + 2, doorW - 4, doorH - 4);
      gfx.fillStyle(0x3a5a78, 0.8);
      gfx.fillRect(doorX + Math.round(doorW / 2) - 1, bodyBot - doorH, 2, doorH);
      // Handle
      gfx.fillStyle(0xd0c870, 1);
      gfx.fillRect(doorX + doorW - 5, bodyBot - Math.round(doorH * 0.48), 3, 2);
      this.doorEntrances.push({ x: doorX + Math.round(doorW / 2), y: bodyBot });
    }

    // ── Lv 60+: bright corner pillar fins ────────────────────────
    if (level >= 60) {
      // Exposed structural corner columns — bright aluminium
      gfx.fillStyle(0x5a7090, 1);
      gfx.fillRect(bx - 3,      bodyTop, 5, upperH + LOBBY_H);
      gfx.fillRect(bx + bw - 2, bodyTop, 5, upperH + LOBBY_H);
      gfx.fillStyle(0x7898b8, 0.5);
      gfx.fillRect(bx - 3,      bodyTop, 2, upperH + LOBBY_H);
      gfx.fillRect(bx + bw - 2, bodyTop, 2, upperH + LOBBY_H);
    }

    // ── Lv 61+: entrance canopy — flat glass overhang ─────────────
    if (level >= 61) {
      const cW = Math.round(bw * 0.60);
      const cX = bx + Math.round((bw - cW) / 2);
      const cY = bodyBot - Math.round(LOBBY_H * 0.88) - 6;
      gfx.fillStyle(0x2a4a62, 0.85);
      gfx.fillRect(cX, cY, cW, 4);
      gfx.fillStyle(0x4a90b8, 0.5);
      gfx.fillRect(cX, cY, cW, 1);
      // Thin support rods
      gfx.fillStyle(0x4a6880, 1);
      gfx.fillRect(cX + 6,      cY + 4, 2, bodyBot - Math.round(LOBBY_H * 0.88) - cY - 4);
      gfx.fillRect(cX + cW - 8, cY + 4, 2, bodyBot - Math.round(LOBBY_H * 0.88) - cY - 4);
      // Shadow below canopy
      gfx.fillStyle(0x000000, 0.15);
      gfx.fillRect(cX + 2, cY + 4, cW, 4);
    }

    // ── Lv 63+: rooftop HVAC cluster ─────────────────────────────
    if (level >= 63) {
      for (let ai = 0; ai < 5; ai++) {
        const aX = bx + Math.round(bw * (ai * 0.18 + 0.04));
        const aW = ai % 2 === 0 ? 13 : 10;
        const aH = ai % 2 === 0 ? 9 : 7;
        gfx.fillStyle(0x2a3848, 1);
        gfx.fillRect(aX, top - aH, aW, aH);
        gfx.fillStyle(0x90a8c0, 1);
        gfx.fillRect(aX, top - aH, aW, 1);
        gfx.fillStyle(0x182030, 1);
        gfx.fillRect(aX + 1, top - aH + 3, aW - 2, 2);
      }
    }

    // ── Lv 65+: illuminated hotel signage ────────────────────────
    let signPos: { cx: number; cy: number } | null = null;
    if (level >= 65) {
      const sW = Math.round(bw * 0.55);
      const sX = bx + Math.round((bw - sW) / 2);
      const sY = lobbyTop - 22;
      gfx.fillStyle(0x0a0a10, 1);
      gfx.fillRect(sX, sY, sW, 10);
      gfx.fillStyle(0xe8e0d0, 1);
      // Sign letter dots (hotel name)
      for (let si = 0; si < 7; si++) {
        gfx.fillRect(sX + 6 + si * 14, sY + 3, 9, 5);
      }
      signPos = { cx: bx + Math.round(bw / 2), cy: sY + 5 };
    }

    // ── Lv 67+: street trees / planters ──────────────────────────
    if (level >= 67) {
      for (const [tX] of [[x + 4, true], [x + w - 14, false]] as [number, boolean][]) {
        gfx.fillStyle(0x3a4430, 1);
        gfx.fillRect(tX, buildGY + 2, 10, 8);
        addYardTree(scene, this, this.yardTreeImages, tX + 5, buildGY - 9, buildGY + 2, 7 / CANOPY_SMALL_R, TREE_CANOPY_TINT, TREE_TRUNK_TINT);
      }
    }

    // ── Lv 59+: rooftop mechanical penthouse ─────────────────────
    if (level >= 59) {
      const prW = Math.round(bw * 0.42);
      const prH = 14;
      const prX = bx + Math.round((bw - prW) / 2);
      gfx.fillStyle(0x1a2230, 1);
      gfx.fillRect(prX, top - prH, prW, prH);
      gfx.fillStyle(0x304060, 0.6);
      for (let px = prX + 5; px < prX + prW - 4; px += 14) {
        gfx.fillRect(px, top - prH + 3, 10, prH - 6);
      }
      gfx.fillStyle(0x90a8c0, 1);
      gfx.fillRect(prX - 1, top - prH, prW + 2, 2);
    }

    // ── Lv 69+: antenna mast ─────────────────────────────────────
    if (level >= 69) {
      const antX = bx + Math.round(bw * 0.58);
      gfx.fillStyle(0x8898a8, 1);
      gfx.fillRect(antX, top - 26, 2, 26);
      gfx.fillRect(antX - 6, top - 20, 14, 1);
      gfx.fillRect(antX - 4, top - 14, 10, 1);
    }

    // ── Lv 70+: rooftop terrace silhouettes ──────────────────────
    if (level >= 70) {
      // Table + chairs
      const tX = bx + Math.round(bw * 0.35);
      gfx.fillStyle(0x8890a0, 1);
      gfx.fillRect(tX, top - 5, 14, 2);
      gfx.fillRect(tX + 2, top - 3, 2, 3);
      gfx.fillRect(tX + 10, top - 3, 2, 3);
      // Chairs
      gfx.fillRect(tX - 4, top - 4, 3, 4);
      gfx.fillRect(tX + 15, top - 4, 3, 4);
      // Parasol
      gfx.fillStyle(0x9a7858, 1);
      gfx.fillRect(tX + 6, top - 12, 2, 8);
      gfx.fillRect(tX + 2, top - 12, 10, 2);
    }

    this.add(gfx);

    // ── Lv 57+: diagonal hotel flags (data setup only — added after glass) ──
    // 3 left-flying on the left half, 3 right-flying on the right half.
    // Pole positions are inset by (poleLen + fw) from each edge so flag
    // fabric never extends past the building boundary.
    if (level >= 57) {
      // Left 3 flags fly left (dir=-1), right 3 fly right (dir=1).
      // Groups are positioned symmetrically around the exact building centre.
      const flagMargin = Math.ceil((HF_POLE + HF_FW) * Math.SQRT1_2) + 2; // ~29 px
      const center     = bx + bw / 2;  // exact float centre — avoids floor() right-bias
      const halfGap    = 5;            // half the gap between the two groups at centre
      const step       = Math.round((bw / 2 - flagMargin - halfGap) / 2) + 2;

      // fi=0 outermost (near edge), fi=2 innermost (near centre) — (2−fi) maps to offsets
      for (let fi = 0; fi < 3; fi++) {
        this.hotelFlags.push({ poleX: Math.round(center - halfGap - (2 - fi) * step), poleY: lobbyTop, dir: -1, palette: HOTEL_PALETTES[fi] });
        this.hotelFlagPhases.push(Math.random() * Math.PI * 2);
      }
      for (let fi = 0; fi < 3; fi++) {
        this.hotelFlags.push({ poleX: Math.round(center + halfGap + (2 - fi) * step), poleY: lobbyTop, dir: 1, palette: HOTEL_PALETTES[3 + fi % 3] });
        this.hotelFlagPhases.push(Math.random() * Math.PI * 2);
      }

      // Small upward spotlight below each pole (illuminates flag from below-outside).
      for (const { poleX, poleY, dir } of this.hotelFlags) {
        this.hotelFlagLights.push(scene.lights.addLight(poleX + dir * 3, poleY + 4, 38, 0xffe8aa, 0));
      }
    }

    // ── Lv 66+: rooftop flagpole ──────────────────────────────────
    if (level >= 66) {
      const fpX    = bx + Math.round(bw * 0.22);
      const fpTop_ = top - 30;
      const poleGfx = scene.add.graphics();
      poleGfx.setLighting(false);
      poleGfx.fillStyle(0xa0a0a8, 1);
      poleGfx.fillRect(fpX - 1, fpTop_, 2, 30);
      poleGfx.fillStyle(0xd0d0d8, 1);
      poleGfx.fillRect(fpX - 1, fpTop_, 2, 2);
      this.add(poleGfx);

      const flagGfx = scene.add.graphics();
      flagGfx.setLighting(false);
      this.add(flagGfx);
      this.flagGfx   = flagGfx;
      this.flagPoleX = fpX;
      this.flagTop   = fpTop_;
      this.flagLight = scene.lights.addLight(fpX + 9, fpTop_ + 5, 40, 0xfff0cc, 0);
    }

    // ── Lv 65+: sign glow and spot (ADD blend) ────────────────────
    const lampConeGfx = scene.add.graphics();
    lampConeGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    if (signPos) {
      lampConeGfx.fillStyle(0xfff0e0, 1);
      lampConeGfx.fillRect(signPos.cx - 30, signPos.cy - 2, 60, 6);
      this.signLight = scene.lights.addLight(signPos.cx, signPos.cy, 80, 0xfff0cc, 0);
      this.signSpot  = new SoftSpotLight({
        x:           signPos.cx,
        y:           signPos.cy + 5,
        radius:      70,
        color:       0xfff0cc,
        intensity:   0,
        angle:       Math.PI / 2,
        coneAngle:   Math.PI / 2 * 0.60,
        noOcclusion: true,
      });
    }
    this.add(lampConeGfx);

    // ── Neon sign (ADD blend, amber) ──────────────────────────────
    {
      const neonSignGfx = scene.add.graphics();
      neonSignGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      this.add(neonSignGfx);
      this.neonSignGfx = neonSignGfx;
      this._neonX     = bx + 10;
      this._neonY     = lobbyTop + 8;
      this._neonPhase = Math.random() * Math.PI * 2;
    }

    // ── Lv 62+: LED accent band glow (ADD, animated) ──────────────
    if (level >= 62) {
      const accentGfx = scene.add.graphics();
      accentGfx.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      const mby = lobbyTop - midBandFloor * actualFH;
      accentGfx.fillStyle(0x22aacc, 1);
      for (let ax = bx + 4; ax < bx + bw - 4; ax += 6) {
        accentGfx.fillCircle(ax, mby + 2, 2);
      }
      this.add(accentGfx);
      this.accentGfx = accentGfx;
    }

    // ── Lobby Phaser light — wide warm-white, always-on commercial glow ──
    this.lobbyLight = scene.lights.addLight(
      bx + Math.round(bw / 2), lobbyTop + Math.round(LOBBY_H / 2), 160, 0xfff8f0, 0,
    );

    // ── Lv 63+: rooftop searchlight beam (ADD, animated each frame) ──
    if (level >= 63) {
      const slGfx = scene.add.graphics();
      slGfx.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.add(slGfx);
      this.searchlightGfx = slGfx;
      this.searchlightX   = bx + Math.round(bw / 2);
      this.searchlightY   = top;
    }

    // ── Window glass overlay ──────────────────────────────────────
    const windowGlassGfx = scene.add.graphics();
    windowGlassGfx.setLighting(true);
    this.drawWindowGlass(windowGlassGfx, 0);
    this.add(windowGlassGfx);
    this.windowGlassGfx = windowGlassGfx;

    // ── Lv 57+: hotel flag graphics — added after glass so flags render on top ──
    if (level >= 57) {
      const hotelFlagGfx = scene.add.graphics();
      hotelFlagGfx.setLighting(false);
      this.add(hotelFlagGfx);
      this.hotelFlagGfx = hotelFlagGfx;
    }

    this.lightPhases  = this.windowLights.map(() => Math.random() * Math.PI * 2);
    this.flickerFreqs = this.windowLights.map(() => 0.2 + Math.random() * 0.8);

    // ── Shadow overlay ────────────────────────────────────────────
    const sg = scene.add.graphics();
    sg.fillStyle(0x000022, 1);
    sg.fillRect(bx - 2, top, bw + 4, buildGY - top);
    if (level >= 59) {
      const prW = Math.round(bw * 0.40);
      sg.fillRect(bx + Math.round((bw - prW) / 2), top - 14, prW, 14);
    }
    if (level >= 66) {
      const fpX = bx + Math.round(bw * 0.22);
      sg.fillRect(fpX - 1, top - 30, 2, 21);
    }
    if (level >= 69) {
      const antX = bx + Math.round(bw * 0.58);
      sg.fillRect(antX, top - 26, 2, 26);
      sg.fillRect(antX - 6, top - 20, 14, 1);
    }
    sg.setDepth(9.15);
    sg.setAlpha(0);
    this.shadowGfx = sg;

    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      for (const light of this.windowLights) scene.lights.removeLight(light);
      for (const light of this.hotelFlagLights) scene.lights.removeLight(light);
      if (this.lobbyLight) scene.lights.removeLight(this.lobbyLight);
      if (this.signLight) scene.lights.removeLight(this.signLight);
      if (this.flagLight) scene.lights.removeLight(this.flagLight);
      this.shadowGfx.destroy();
    });
  }

  setShadowAlpha(alpha: number): void { this.shadowGfx.setAlpha(alpha); }

  updateWindowLights(elevation: number, time = 0, gameHour = -1): void {
    if (this.yardTreeImages.length) {
      const nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
      const nightTint   = lerpColor(0xffffff, NIGHT_TINT, nightFactor);
      for (const { img, baseTint } of this.yardTreeImages) img.setTint(multiplyColor(baseTint, nightTint));
    }

    const t = Math.max(0, Math.min(1, (0.4 - elevation) / 0.3));
    if (t < 0.01 && this.windowLights.every(l => l.intensity < 0.01)) {
      if (this.lobbyLight)     this.lobbyLight.intensity = 0;
      if (this.searchlightGfx) this.searchlightGfx.setAlpha(0);
      return;
    }

    const ambientIntensity = elevation >= 0.3 ? 1.0
      : elevation >= 0 ? 0.5 + (elevation / 0.3) * 0.5
      : 0.5;
    const tNorm = t * (0.5 / ambientIntensity);
    const now = time || this.scene.time.now / 1000;

    if (t >= 0.8 && gameHour >= 0) {
      if (gameHour !== this.lastSleepHour && this.pendingSleepAt === Infinity)
        this.pendingSleepAt = now + Math.random() * 5;
      if (now >= this.pendingSleepAt) {
        const awake = this.windowRects.filter(r => !r.asleep);
        if (awake.length > 0) awake[Math.floor(Math.random() * awake.length)].asleep = true;
        this.lastSleepHour  = gameHour;
        this.pendingSleepAt = Infinity;
      }
    }
    if (t < 0.1) {
      for (const r of this.windowRects) r.asleep = false;
      this.lastSleepHour  = -1;
      this.pendingSleepAt = Infinity;
    }

    this.windowLights.forEach((light, i) => {
      const flicker = 1 + Math.sin(now * this.flickerFreqs[i] + this.lightPhases[i]) * 0.08;
      light.intensity = tNorm * 0.44 * flicker;
    });

    if (this.lobbyLight)  this.lobbyLight.intensity  = tNorm * 1.8;
    if (this.signLight)   this.signLight.intensity   = tNorm * 1.2;
    if (this.signSpot)    this.signSpot.setIntensity(tNorm * 2.8);
    if (this.flagLight)   this.flagLight.intensity   = tNorm * 0.6;
    for (const fl of this.hotelFlagLights) fl.intensity = tNorm * 0.45;
    if (this.searchlightGfx) this.searchlightGfx.setAlpha(Math.min(1, tNorm * 1.3));

    if (this.windowGlassGfx) this.drawWindowGlass(this.windowGlassGfx, tNorm, now);
    if (this.accentGfx)      this.accentGfx.setAlpha(Math.min(1, tNorm * 0.9));
    if (this.neonSignGfx) {
      const nPulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 2.1 + this._neonPhase));
      this.neonSignGfx.clear();
      if (tNorm > 0.05) {
        this.neonSignGfx.fillStyle(0xffcc00, tNorm * nPulse);
        this.neonSignGfx.fillRect(this._neonX, this._neonY, 22, 4);
        this.neonSignGfx.fillRect(this._neonX + 2, this._neonY - 4, 18, 4);
      }
      this.neonSignGfx.setAlpha(1);
    }
  }

  updateFlag(): void {
    const time = this.scene.time.now / 1000;
    if (this.flagGfx) this.drawRooftopFlag(this.flagGfx, time);
    if (this.hotelFlagGfx) this.drawHotelFlags(this.hotelFlagGfx, time);
    if (this.searchlightGfx) this.drawSearchlight(this.searchlightGfx, time);
  }

  private drawRooftopFlag(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    const fx   = this.flagPoleX + 1;
    const fy   = this.flagTop;
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

  private drawHotelFlags(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    const fw      = HF_FW;
    const fh      = HF_FH;
    const poleLen = HF_POLE;
    const c = Math.SQRT1_2; // cos/sin 45° ≈ 0.7071

    for (let i = 0; i < this.hotelFlags.length; i++) {
      const { poleX, poleY, dir, palette } = this.hotelFlags[i];
      const phase = this.hotelFlagPhases[i];

      const tipX = poleX + dir * poleLen;
      const tipY = poleY - poleLen;

      gfx.lineStyle(1, 0xa0a8b0, 1);
      gfx.moveTo(poleX, poleY).lineTo(tipX, tipY).strokePath();
      gfx.fillStyle(0xd0d8e0, 1);
      gfx.fillCircle(tipX, tipY, 1.5);

      // Wave ripples perpendicular to the flag face (grows from hoist→fly)
      const maxWave = Math.sin(time * 3.8 + phase) * 2;

      // Shadow: a dark offset silhouette drawn before the flag bands
      const sO = 2;
      const ftx = tipX + dir * fw * c;
      const fty = tipY + fw * c;
      const sbx0 = tipX - dir * fh * c, sby0 = tipY + fh * c;
      const sbx1 = ftx  - dir * fh * c, sby1 = fty  + fh * c;
      gfx.fillStyle(0x000000, 0.28);
      gfx.fillTriangle(tipX + sO, tipY + sO, ftx + sO, fty + sO, sbx0 + sO, sby0 + sO);
      gfx.fillTriangle(ftx + sO, fty + sO, sbx1 + sO, sby1 + sO, sbx0 + sO, sby0 + sO);

      // Flag hangs DOWN from the pole tip at 45°:
      //   extension direction: (dir·c,  c)  — outward + downward
      //   hang direction:     (−dir·c,  c)  — inward  + downward (perpendicular)
      // Wave nudges in the hang direction, growing from hoist to fly.
      const nBands = palette.length;
      for (let b = 0; b < nBands; b++) {
        const t0 = b / nBands;
        const t1 = (b + 1) / nBands;
        const w0 = maxWave * t0;
        const w1 = maxWave * t1;

        // Top-edge points (wave nudges inward)
        const tx0 = tipX + dir * t0 * fw * c - dir * w0 * c * 0.35;
        const ty0 = tipY       + t0 * fw * c +       w0 * c * 0.35;
        const tx1 = tipX + dir * t1 * fw * c - dir * w1 * c * 0.35;
        const ty1 = tipY       + t1 * fw * c +       w1 * c * 0.35;

        // Bottom-edge = top + fh along hang direction + wave
        const bx0 = tx0 - dir * fh * c - dir * w0 * c * 0.65;
        const by0 = ty0       + fh * c +       w0 * c * 0.65;
        const bx1 = tx1 - dir * fh * c - dir * w1 * c * 0.65;
        const by1 = ty1       + fh * c +       w1 * c * 0.65;

        gfx.fillStyle(palette[b], 1);
        gfx.fillTriangle(tx0, ty0, tx1, ty1, bx0, by0);
        gfx.fillTriangle(tx1, ty1, bx1, by1, bx0, by0);
      }
    }
  }

  private drawSearchlight(gfx: Phaser.GameObjects.Graphics, time: number): void {
    gfx.clear();
    // Sweep angle oscillates ±60° from vertical; length pulses on a different cycle
    const sweep  = Math.sin(time * 0.45) * 1.05;
    const length = 95 + Math.cos(sweep) * 28 + Math.sin(time * 1.9) * 18;

    const sx = this.searchlightX;
    const sy = this.searchlightY;
    const tx = sx + Math.sin(sweep) * length;
    const ty = sy - Math.cos(sweep) * length; // up = negative y

    // Perpendicular to beam direction — used for the far-end spread
    const px = Math.cos(sweep);
    const py = Math.sin(sweep);

    // Apex at building rooftop (origin), beam widens into sky — correct searchlight cone
    gfx.fillStyle(0x99bbff, 0.12);
    gfx.fillTriangle(sx, sy, tx - px * 18, ty - py * 18, tx + px * 18, ty + py * 18);
    gfx.fillStyle(0xccddff, 0.28);
    gfx.fillTriangle(sx, sy, tx - px * 9,  ty - py * 9,  tx + px * 9,  ty + py * 9);
    gfx.fillStyle(0xeef4ff, 0.55);
    gfx.fillTriangle(sx, sy, tx - px * 4,  ty - py * 4,  tx + px * 4,  ty + py * 4);
    // Source glow at the building origin
    gfx.fillStyle(0xffffff, 0.7);
    gfx.fillCircle(sx, sy, 3);
  }

  private drawWindowGlass(gfx: Phaser.GameObjects.Graphics, t: number, time = 0): void {
    gfx.clear();
    const dayColor = this.glassDayColor;
    for (const { wx, wy, ww, wh, isTv, flickerFreq, tvColor, asleep } of this.windowRects) {
      if (asleep) {
        gfx.fillStyle(lerpColor(dayColor, 0x0a0f18, t), 1);
        gfx.fillRect(wx, wy, ww, wh);
        gfx.fillStyle(0xffffff, Math.max(0, 0.22 - t * 0.20));
        gfx.fillRect(wx, wy, ww, Math.max(1, Math.round(wh * 0.22)));
        continue;
      }
      const tvFlick = isTv ? 0.6 + 0.4 * Math.abs(Math.sin(time * flickerFreq! + wx)) : 1;
      gfx.fillStyle(isTv ? lerpColor(dayColor, tvColor!, t * tvFlick) : lerpColor(dayColor, 0xffdd88, t), 1);
      gfx.fillRect(wx, wy, ww, wh);
      gfx.fillStyle(0xffffff, Math.max(0, 0.22 - t * 0.18));
      gfx.fillRect(wx, wy, ww, Math.max(1, Math.round(wh * 0.22)));
    }
  }
}
