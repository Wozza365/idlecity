import Phaser from 'phaser';
import { ROAD_H, VERGE_H, WATER_H, NIGHT_TINT, lerpColor, dimColor } from '../constants';
import type { LightSource } from '../lighting/LightingSystem';
import type { WaterPalette } from '../theme/ThemeTypes';
import { type PersonDef, PERSON_DEFS, walkAnimKey } from './PedestrianAssets';
import { WaterCritterSim, SPLASH_DURATION } from './water/WaterCritterSim';
import { advanceBeachPersonPosition, advanceBeachPersonPhase } from './water/BeachPeopleSim';
import { LighthouseFeature } from './water/LighthouseFeature';
import { PierAndStructures } from './water/PierAndStructures';
import { WaveFx } from './water/WaveFx';

const BEACH_SHORE_H = 48;  // depth of sandy beach area
const ROCK_SHORE_H  = 22;  // depth of rocky area

// ── Beach people — reuse path-pedestrian character sprites ─────────────────────
const BEACH_PERSON_WALK_FRAMERATE = 4;
const BEACH_PERSON_H_MIN = 9;  // px — slightly smaller than path pedestrians (background); varies +0..4 via (i % 5)
const BEACH_PERSON_SHADOW_ALPHA = 0.25;
const BEACH_PERSON_DEPTH        = 5.665;
const BEACH_PERSON_SHADOW_DEPTH = 5.663;

// ── Water critters — jumping fish + paddling ducks ─────────────────────────────
const FISH_LEN = 6;
const DUCK_W = 8;
const DUCK_H = 5;

// ── Beach person AI ───────────────────────────────────────────────────────────

interface BeachPerson {
  x: number;
  bottomY: number;
  dir: 1 | -1;
  speed: number;
  def: PersonDef;
  towelColor: number;
  w: number;
  h: number;
  phase: 'walk' | 'sit';
  phaseTimer: number;
  alpha: number;
  xMin: number;
  xMax: number;
  sprite: Phaser.GameObjects.Sprite;
  shadowSprite: Phaser.GameObjects.Sprite;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class WaterArea {
  private readonly scene: Phaser.Scene;

  // Graphics layers (depth < 6.0 so they render behind verge)
  private waterGfx:        Phaser.GameObjects.Graphics; // 5.5  – gradient water + coast (static)
  private skyReflectGfx:   Phaser.GameObjects.Graphics; // 5.51 – sky horizon colour tint on water top
  private shadowGfx:       Phaser.GameObjects.Graphics; // 5.65 – structure shadows on water (sun-dep)
  private beachShadowGfx:  Phaser.GameObjects.Graphics; // 5.76 – beach people shadows
  private beachPeopleGfx:  Phaser.GameObjects.Graphics; // 5.78 – moving beach people
  private fxGfx:           Phaser.GameObjects.Graphics; // 5.85 – bonfire, sparkles, buoys (no lighting)
  private crittersGfx:     Phaser.GameObjects.Graphics; // 5.84 – jumping fish + paddling ducks

  // Layout
  private _level   = 0;
  private _width   = 0;
  private _waterY  = 0;
  private _palette!: WaterPalette;
  private _beachEndX  = 0;
  private _transEndX  = 0; // where rocky area starts (after transition)
  private _pierX      = 0;
  private _dockX1     = 0;
  private _dockX2     = 0;
  private _cafeX      = 16;
  private _bonfireX   = 0;
  private _bonfireY   = 0;
  private _lighthouseX    = 0;
  private _lighthouseTopY = 0;
  private _lighthouse!: LighthouseFeature;
  private _pierAndStructures!: PierAndStructures;

  // Beach people
  private _people: BeachPerson[] = [];

  // Water critters
  private _critters = new WaterCritterSim();

  // Wave/foam/glitter animation on the FX layer
  private _waveFx = new WaveFx();

  // Sprites from the High Tides asset pack
  private _foamSprites: Phaser.GameObjects.Sprite[] = [];

  // Animation
  private _bonfireTime     = 0;
  private _nightFactor     = 0;
  private _lastLightElevation = NaN;

  // Lighting — bonfire-only here; pier/dock/café/buoy lights live in PierAndStructures
  private _bonFireLights: Array<Extract<LightSource, { type?: 'point' }>> = [];

  get extraLights(): LightSource[] {
    const out: LightSource[] = [];
    out.push(...this._pierAndStructures.extraLights);
    for (const b of this._bonFireLights) out.push(b);
    out.push(...this._lighthouse.extraLights);
    return out;
  }

  getDockSlots(): number[] { return this._pierAndStructures.getDockSlots(); }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.waterGfx       = scene.add.graphics().setDepth(5.5).setLighting(true);
    this.skyReflectGfx  = scene.add.graphics().setDepth(5.51);
    this.shadowGfx      = scene.add.graphics().setDepth(5.55);
    this.beachShadowGfx = scene.add.graphics().setDepth(5.62);
    this.beachPeopleGfx = scene.add.graphics().setDepth(5.66).setLighting(true);
    this.fxGfx          = scene.add.graphics().setDepth(5.85);
    this.crittersGfx    = scene.add.graphics().setDepth(5.84).setLighting(true);
    this._lighthouse    = new LighthouseFeature(scene);
    this._pierAndStructures = new PierAndStructures(scene);
  }

  render(level: number, width: number, groundY: number, palette: WaterPalette): void {
    this._level   = level;
    this._width   = width;
    this._waterY  = groundY + ROAD_H + VERGE_H;
    this._palette = palette;

    // Layout geometry
    this._beachEndX  = Math.floor(width * 0.36);
    this._transEndX  = Math.floor(width * 0.60); // end of beach→rock transition
    this._pierX      = Math.floor(width * 0.23);
    this._dockX1     = this._beachEndX;           // dock replaces transition zone
    this._dockX2     = this._transEndX;
    this._cafeX      = 16;
    this._bonfireX   = Math.floor(width * 0.17);
    this._bonfireY   = this._waterY + 32;
    this._lighthouseX    = Math.floor(width * 0.63);
    this._lighthouseTopY = this._waterY + WATER_H * 0.5;

    this.drawWaterAndCoast();

    this._pierAndStructures.render(level, this._width, this._waterY, this._pierX, this._cafeX, this._dockX1, this._dockX2);
    this._lighthouse.render(level, this._lighthouseX, this._lighthouseTopY, palette);
    if (level >= 2) { this.initBeachPeople(); this.initFoamSprites(); }
    else { this.destroyFoamSprites(); }

    this._critters.reset();
    this._critters.initDucks(level, this._transEndX, this._width, this._waterY, ROCK_SHORE_H);

    this.rebuildBonfireLights();
  }

  // ── Water gradient + coast ────────────────────────────────────────────────

  private drawWaterAndCoast(): void {
    const gfx = this.waterGfx;
    gfx.clear();
    const { _waterY: wy, _width: w, _beachEndX: bx, _transEndX: tx } = this;

    // ── Smooth water gradient (top → bottom = deep → lighter) ──
    const BAND = 4;
    for (let i = 0; i < WATER_H; i += BAND) {
      const t = i / WATER_H;
      gfx.fillStyle(lerpColor(this._palette.waterTop, this._palette.waterBot, t), 1);
      gfx.fillRect(0, wy + i, w, Math.min(BAND, WATER_H - i));
    }

    // ── Sandy beach (left) ──
    if (this._level >= 1) {
      gfx.fillStyle(this._palette.sand, 1);
      gfx.fillRect(0, wy, bx, BEACH_SHORE_H);

      // Wet sand — gently curved bottom edge using thin horizontal strips
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        // Gentle sinusoidal variation: center dips slightly further into water
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        const wh  = 7 + dip;
        gfx.fillStyle(this._palette.sandWet, 1);
        gfx.fillRect(col, wy + BEACH_SHORE_H - wh, 2, wh);
      }
      // White foam strip at water's edge
      gfx.fillStyle(0xFFFFFF, 0.22);
      for (let col = 0; col < bx; col += 2) {
        const t  = col / bx;
        const dip = Math.round(Math.sin(t * Math.PI) * 4);
        gfx.fillRect(col, wy + BEACH_SHORE_H - (7 + dip), 2, 2);
      }

      // Sand pebble texture
      gfx.fillStyle(0xE8D0A0, 0.45);
      for (let i = 0; i < Math.floor(bx / 9); i++) {
        const px = ((i * 47 + 11) % Math.max(1, bx - 6)) + 3;
        const py = wy + 4 + ((i * 23 + 7) % (BEACH_SHORE_H - 12));
        gfx.fillRect(px, py, 1 + (i % 2), 1 + (i % 2));
      }

      // ── Smooth beach→rock transition (per-pixel width, smoothstep curve) ──
      const transW = tx - bx;
      const STEPS  = Math.max(1, Math.floor(transW / 3)); // ~3px each strip
      for (let s = 0; s < STEPS; s++) {
        const t0 = s / STEPS;
        const t1 = (s + 1) / STEPS;
        const tSmooth = t0 * t0 * (3 - 2 * t0); // smoothstep
        const sx = bx + Math.floor(t0 * transW);
        const sw = Math.max(1, Math.ceil(t1 * transW) - Math.floor(t0 * transW));
        const sh = Math.round(BEACH_SHORE_H * (1 - tSmooth) + ROCK_SHORE_H * tSmooth);
        const color = lerpColor(this._palette.sand, this._palette.rockBase, tSmooth);
        gfx.fillStyle(color, 1);
        gfx.fillRect(sx, wy, sw, sh);
        // Top edge highlight
        gfx.fillStyle(lerpColor(0xE8D0A0, this._palette.rockLight, tSmooth), 0.4);
        gfx.fillRect(sx, wy, sw, 1);
      }

      // ── Rocky coastline (right) — pixel-art layered blocks ──
      // Base fill
      gfx.fillStyle(this._palette.rockBase, 1);
      gfx.fillRect(tx, wy, w - tx, ROCK_SHORE_H);

      // Top face highlight (lighter)
      gfx.fillStyle(this._palette.rockLight, 1);
      gfx.fillRect(tx, wy, w - tx, 3);

      // Horizontal strata cracks
      gfx.fillStyle(0x404040, 1);
      gfx.fillRect(tx, wy + 8,  w - tx, 1);
      gfx.fillRect(tx, wy + 15, w - tx, 1);

      // Individual pixel-art rock blocks (4-6×3-4 rectangles)
      for (let rx = tx + 4; rx < w - 4; rx += 14) {
        const seed = (rx * 13 + 7) | 0;
        const rw   = 9 + (seed % 5);
        const rh   = 2 + (seed % 3);
        const ry2  = wy + 2 + (seed % 6);
        gfx.fillStyle(this._palette.rockMid, 1);
        gfx.fillRect(rx, ry2, rw, rh);
        // Pixel highlight
        gfx.fillStyle(this._palette.rockLight, 0.7);
        gfx.fillRect(rx, ry2, rw, 1);
      }

      // Bottom edge of rocky shore (shadow into water)
      gfx.fillStyle(0x000000, 0.2);
      gfx.fillRect(tx, wy + ROCK_SHORE_H - 3, w - tx, 3);
    }

  }

  // ── Light sources ─────────────────────────────────────────────────────────

  // Bonfire — four small overlapping point lights at varied positions/colors.
  // Using multiple smaller lights instead of one big circle produces an organic,
  // flickering warmth rather than a uniform disc. Pier/café/dock/buoy lights
  // live in PierAndStructures (rebuilt by its own render()).
  private rebuildBonfireLights(): void {
    if (this._level >= 9) {
      const bx = this._bonfireX, by = this._bonfireY;
      this._bonFireLights = [
        { x: bx,     y: by - 12, radius: 38, color: 0xFF6600, intensity: 0, noOcclusion: true },
        { x: bx - 5, y: by - 6,  radius: 32, color: 0xFF8800, intensity: 0, noOcclusion: true },
        { x: bx + 6, y: by - 4,  radius: 26, color: 0xFFAA00, intensity: 0, noOcclusion: true },
        { x: bx + 1, y: by - 9,  radius: 20, color: 0xFFCC00, intensity: 0, noOcclusion: true },
      ];
    } else {
      this._bonFireLights = [];
    }
  }

  // ── Beach people AI ───────────────────────────────────────────────────────

  private setupFoamAnimation(): void {
    if (this.scene.textures.exists('ht-water-particles') && !this.scene.anims.exists('ht-foam')) {
      this.scene.anims.create({
        key: 'ht-foam',
        frames: this.scene.anims.generateFrameNumbers('ht-water-particles', { start: 6, end: 12 }),
        frameRate: 3,
        repeat: -1,
      });
    }
  }

  private destroyFoamSprites(): void {
    for (const s of this._foamSprites) s.destroy();
    this._foamSprites = [];
  }

  private initFoamSprites(): void {
    this.destroyFoamSprites();
    this.setupFoamAnimation();
    if (!this.scene.textures.exists('ht-water-particles')) return;

    const bx = this._beachEndX;
    const wy = this._waterY;
    const foamY = wy + BEACH_SHORE_H - 5;
    const count = 5;

    for (let i = 0; i < count; i++) {
      const x = Math.floor((i + 0.3) * (bx / count));
      const sprite = this.scene.add.sprite(x, foamY, 'ht-water-particles')
        .setScale(0.42)
        .setDepth(5.84)
        .setOrigin(0.5, 0.7)
        .setAlpha(0.55);
      if (this.scene.anims.exists('ht-foam')) sprite.play({ key: 'ht-foam', startFrame: (i * 3) % 7 });
      this._foamSprites.push(sprite);
    }
  }

  private setupPersonAnimations(): void {
    for (const def of PERSON_DEFS) {
      const key = walkAnimKey(def.key);
      if (this.scene.anims.exists(key)) continue;
      if (!this.scene.textures.exists(def.key)) continue;
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers(def.key, { start: 0, end: def.frameCount - 1 }),
        frameRate: BEACH_PERSON_WALK_FRAMERATE,
        repeat: -1,
      });
    }
  }

  private makeBeachPersonSprites(
    x: number, bottomY: number, w: number, h: number, dir: 1 | -1, def: PersonDef,
  ): { sprite: Phaser.GameObjects.Sprite; shadowSprite: Phaser.GameObjects.Sprite } {
    // Added first so it sits behind the main sprite (lower depth).
    const shadowSprite = this.scene.add.sprite(x, bottomY, def.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(w + 1, h + 1)
      .setFlipX(dir === -1)
      .setTint(0x000000)
      .setTintMode(Phaser.TintModes.FILL)
      .setDepth(BEACH_PERSON_SHADOW_DEPTH);

    const sprite = this.scene.add.sprite(x, bottomY, def.key)
      .setOrigin(0.5, 1)
      .setDisplaySize(w, h)
      .setFlipX(dir === -1)
      .setDepth(BEACH_PERSON_DEPTH);

    return { sprite, shadowSprite };
  }

  private destroyBeachPeople(): void {
    for (const p of this._people) {
      p.sprite.destroy();
      p.shadowSprite.destroy();
    }
    this._people = [];
  }

  private initBeachPeople(): void {
    this.destroyBeachPeople();
    this.setupPersonAnimations();

    const { _level: lv, _beachEndX: bx, _waterY: wy } = this;
    const count = Math.min(3 + Math.floor(lv * 0.55), 8);

    const xMin = 8;
    const xMax = bx - 14;
    const yMin = wy + 10;
    const yMax = wy + BEACH_SHORE_H - 6;

    for (let i = 0; i < count; i++) {
      const x       = xMin + ((i * 67 + 13) % Math.max(1, xMax - xMin));
      const bottomY = yMin + ((i * 41 + 7)  % Math.max(1, yMax - yMin));
      const isSit   = i % 3 === 0;
      const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const def = PERSON_DEFS[i % PERSON_DEFS.length];
      const h   = BEACH_PERSON_H_MIN + (i % 5);
      const w   = h * (def.frameWidth / def.frameHeight);

      const { sprite, shadowSprite } = this.makeBeachPersonSprites(x, bottomY, w, h, dir, def);

      if (isSit) {
        // Neutral/standing pose (frame 0) — no walk cycle while sitting.
        sprite.setFrame(0);
        shadowSprite.setFrame(0);
      } else if (this.scene.anims.exists(walkAnimKey(def.key))) {
        sprite.play(walkAnimKey(def.key));
        sprite.anims.setProgress(Math.random());
        shadowSprite.setFrame(sprite.frame.name);
      }

      this._people.push({
        x,
        bottomY,
        dir,
        speed:      4 + (i % 5) * 2.5,
        def,
        towelColor: this._palette.towelColors[i % this._palette.towelColors.length],
        w,
        h,
        phase:      isSit ? 'sit' : 'walk',
        phaseTimer: isSit ? 8000 + (i * 3000) % 12000 : 4000 + (i * 2500) % 8000,
        alpha:      1,
        xMin,
        xMax,
        sprite,
        shadowSprite,
      });
    }
  }

  private updateBeachPeople(delta: number, elevation: number): void {
    if (this._level < 2 || this._people.length === 0) {
      this.beachPeopleGfx.clear();
      this.beachShadowGfx.clear();
      return;
    }

    const targetAlpha = Math.max(0, Math.min(1, (elevation + 0.1) / 0.4));
    const dt = delta / 1000;

    const brightness = Math.max(0.25, Math.min(1, (elevation + 0.2) / 0.4));
    const tint = dimColor(lerpColor(0xffffff, NIGHT_TINT, this._nightFactor), brightness);

    const pgfx = this.beachPeopleGfx;
    const sgfx = this.beachShadowGfx;
    pgfx.clear();
    sgfx.clear();

    for (const p of this._people) {
      p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * 1.5);

      if (p.phase === 'walk') {
        advanceBeachPersonPosition(p, dt);
      }
      if (advanceBeachPersonPhase(p, delta)) {
        if (p.phase === 'sit') {
          // Stop the walk cycle and settle into a neutral/flat pose.
          p.sprite.anims.stop();
          p.sprite.setFrame(0);
          p.shadowSprite.setFrame(0);
        } else if (this.scene.anims.exists(walkAnimKey(p.def.key))) {
          p.sprite.play(walkAnimKey(p.def.key));
          p.sprite.anims.setProgress(Math.random());
        }
      }

      const x = Math.round(p.x);
      const y = Math.round(p.bottomY);

      p.sprite.setPosition(x, y);
      p.sprite.setFlipX(p.dir === -1);
      p.sprite.setAlpha(p.alpha);
      p.sprite.setTint(tint);

      p.shadowSprite.setPosition(x, y);
      p.shadowSprite.setFlipX(p.dir === -1);
      p.shadowSprite.setFrame(p.sprite.frame.name);
      p.shadowSprite.setAlpha(p.alpha * BEACH_PERSON_SHADOW_ALPHA);

      if (p.alpha < 0.01) continue;

      if (p.phase === 'sit') {
        pgfx.fillStyle(p.towelColor, p.alpha * 0.9);
        pgfx.fillRect(x - Math.round(p.w / 2) - 3, y - 3, Math.round(p.w) + 6, 4);
      }

      sgfx.fillStyle(0x000000, 0.2 * p.alpha);
      sgfx.fillEllipse(x, y + 1, p.w * 1.1, 2);
    }

    // Fade foam sprites with daylight
    for (const fs of this._foamSprites) {
      fs.setAlpha(Math.max(0, 0.55 * brightness));
    }
  }

  // ── Water critters — jumping fish + paddling ducks ────────────────────────

  /** Draws splash rings on the FX layer — called after drawFx(), without clearing it. */
  private drawSplashes(): void {
    if (this._critters.splashes.length === 0) return;
    const gfx = this.fxGfx;
    for (const s of this._critters.splashes) {
      const t = s.t / SPLASH_DURATION;
      const ringR = 2 + t * 10;
      const alpha = (1 - t) * 0.5;
      gfx.lineStyle(1, 0xFFFFFF, alpha);
      gfx.strokeCircle(s.x, s.y, ringR);

      if (t < 0.4) {
        const dropA = (1 - t / 0.4) * 0.7;
        gfx.fillStyle(0xFFFFFF, dropA);
        for (let j = 0; j < 3; j++) {
          const ang  = -Math.PI / 2 + (j - 1) * 0.5;
          const dist = 3 + t * 8;
          gfx.fillCircle(s.x + Math.cos(ang) * dist, s.y + Math.sin(ang) * dist, 1);
        }
      }
    }
  }

  /** Draws jumping fish (rotated to follow their arc) and paddling ducks. */
  private drawCritters(elevation: number): void {
    const gfx = this.crittersGfx;
    gfx.clear();
    if (this._critters.fish.length === 0 && this._critters.ducks.length === 0) return;

    const brightness = Math.max(0.25, Math.min(1, (elevation + 0.2) / 0.4));

    // Fish — a small two-tone wedge rotated to follow the jump-arc tangent
    for (const f of this._critters.fish) {
      const progress = f.t;
      const x = f.startX + f.dir * f.travel * progress;
      const y = f.baseY - f.height * Math.sin(progress * Math.PI);

      const vx = f.travel * f.dir;
      const vy = -f.height * Math.PI * Math.cos(progress * Math.PI);
      const angle = Math.atan2(vy, vx);

      gfx.save();
      gfx.translateCanvas(x, y);
      gfx.rotateCanvas(angle);
      gfx.fillStyle(dimColor(f.color, brightness * 0.7), 0.9);
      gfx.fillTriangle(-FISH_LEN / 2, 0, -FISH_LEN / 2 - 2.5, -2, -FISH_LEN / 2 - 2.5, 2);
      gfx.fillStyle(dimColor(f.color, brightness), 0.95);
      gfx.fillTriangle(-FISH_LEN / 2, -1.5, -FISH_LEN / 2, 1.5, FISH_LEN / 2, 0);
      gfx.restore();
    }

    // Ducks — paddling with a periodic head-dunk
    for (const d of this._critters.ducks) {
      const bob = Math.sin(this._waveFx.waveTime * 3 + d.bobSeed) * 0.8;
      const cx  = Math.round(d.x);
      const cy  = Math.round(d.y + bob);
      const dip = Math.sin(d.dipProgress * Math.PI);

      const bodyColor = dimColor(d.hasGreenHead ? 0xede0c8 : 0x8a6a45, brightness);
      const headColor = dimColor(d.hasGreenHead ? 0x2f5d3a : 0x5a4632, brightness);
      const beakColor = dimColor(0xe0a500, brightness);

      // Wake ripple behind the body
      gfx.fillStyle(0xFFFFFF, 0.12);
      gfx.fillEllipse(cx - d.dir * 2, cy + 2, DUCK_W + 4, 2);

      // Tail
      gfx.fillStyle(headColor, 1);
      gfx.fillTriangle(
        cx - d.dir * DUCK_W * 0.5, cy - 1,
        cx - d.dir * DUCK_W * 0.5, cy + 1,
        cx - d.dir * (DUCK_W * 0.5 + 2), cy - 1.5,
      );

      // Body
      gfx.fillStyle(bodyColor, 1);
      gfx.fillEllipse(cx, cy, DUCK_W, DUCK_H);

      // Head — dunks under during the dip animation
      const headX = cx + d.dir * DUCK_W * 0.45;
      const headY = cy - DUCK_H * 0.3 + dip * (DUCK_H * 0.9);
      gfx.fillStyle(headColor, 1);
      gfx.fillCircle(headX, headY, DUCK_H * 0.5);

      // Beak — hidden once the head is mostly underwater
      if (dip < 0.7) {
        gfx.fillStyle(beakColor, 1);
        gfx.fillTriangle(
          headX + d.dir * DUCK_H * 0.4, headY,
          headX + d.dir * DUCK_H * 1.0, headY - 0.5,
          headX + d.dir * DUCK_H * 0.4, headY + 0.8,
        );
      }

      // Splash ring while dunking
      if (dip > 0.7) {
        gfx.fillStyle(0xFFFFFF, (dip - 0.7) / 0.3 * 0.4);
        gfx.fillCircle(headX, cy - 1, 2);
      }
    }
  }

  // ── Structure shadows on water ────────────────────────────────────────────

  updateShadows(sunAngle: number): void {
    const gfx = this.shadowGfx;
    gfx.clear();

    const elevation = Math.sin(sunAngle);
    if (elevation <= 0.04 || this._level === 0) return;

    const { _waterY: wy } = this;
    const alpha = Math.min(0.22, elevation * 0.28);
    const leanX = Math.cos(sunAngle) / Math.max(0.15, elevation);

    this._pierAndStructures.updateShadows(gfx, leanX, alpha, wy);
    this._lighthouse.drawShadow(gfx, leanX, alpha, elevation);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(delta: number, elevation: number, horizonColor = 0x1a5c9e): void {
    if (this._width === 0) return; // not yet rendered
    this.updateSkyReflection(horizonColor);
    const dt = delta / 1000;
    this._waveFx.update(delta);
    this._bonfireTime += dt * 0.55; // slowed for more organic feel
    this._lighthouse.update(delta, this._nightFactor);
    this._pierAndStructures.update(delta);

    // Bonfire light flicker — four lights with independent phases/frequencies
    if (this._nightFactor > 0.05 && this._bonFireLights.length > 0) {
      const t  = this._bonfireTime;
      const nf = this._nightFactor;
      const phases = [0,    0.8,  1.5,  2.3];
      const freqs  = [4.1,  3.3,  5.7,  2.9];
      const bases  = [0.65, 0.70, 0.68, 0.72];
      const amps   = [0.28, 0.22, 0.25, 0.20];
      const intens = [4.0,  3.2,  2.8,  2.2];
      for (let i = 0; i < this._bonFireLights.length; i++) {
        const f = bases[i] + amps[i] * Math.sin(t * freqs[i] + phases[i])
                           + 0.10   * Math.sin(t * freqs[i] * 2.3 + phases[i]);
        (this._bonFireLights[i] as { intensity: number }).intensity = nf * intens[i] * f;
      }
    }

    this.updateBeachPeople(delta, elevation);
    this.drawFx();

    this._critters.updateFish(delta, this._transEndX, this._width, this._waterY, ROCK_SHORE_H);
    this._critters.updateDucks(delta);
    this._critters.updateSplashes(delta);
    this.drawSplashes();
    this.drawCritters(elevation);
  }

  // ── Animated FX layer ─────────────────────────────────────────────────────

  private drawFx(): void {
    const gfx = this.fxGfx;
    gfx.clear();

    this._waveFx.draw(gfx, {
      width: this._width,
      waterY: this._waterY,
      beachEndX: this._beachEndX,
      dockX1: this._dockX1,
      dockX2: this._dockX2,
      transEndX: this._transEndX,
      level: this._level,
      nightFactor: this._nightFactor,
      lighthouseActive: this._level >= 8,
      lighthouseX: this._lighthouseX,
      lighthouseTopY: this._lighthouseTopY,
    });

    this._pierAndStructures.drawFx(gfx, this._nightFactor);

    if (this._level >= 9) this.drawBonfire();
  }

  private drawBonfire(): void {
    const gfx = this.fxGfx;
    const { _bonfireX: bx, _bonfireY: by } = this;
    const t  = this._bonfireTime; // already slowed in update()
    const nf = this._nightFactor;

    // Logs (always visible, with glowing embers)
    gfx.fillStyle(0x2A1508, 1);
    gfx.fillRect(bx - 10, by + 2, 20, 4);
    gfx.fillRect(bx - 7, by + 4, 14, 3);
    // Ember glow on logs
    if (nf > 0.05) {
      const emberA = nf * (0.4 + 0.3 * Math.sin(t * 3.1));
      gfx.fillStyle(0xFF5500, emberA);
      gfx.fillRect(bx - 8, by + 2, 16, 3);
    }

    if (nf < 0.06) return;
    const alpha = Math.min(1, nf * 1.8);

    // Base glow (wide, low, hot orange)
    gfx.fillStyle(0xFF3300, alpha * 0.7);
    gfx.fillRect(bx - 8, by - 2, 16, 5);

    // Outer flame — slow wobble
    const f1 = 0.55 + 0.45 * Math.sin(t * 3.2);
    const h1  = Math.round(12 * f1);
    gfx.fillStyle(0xDD1100, alpha * 0.85);
    gfx.fillRect(bx - 8, by - h1, 16, h1 + 2);

    // Mid flame — slightly offset
    const f2  = 0.6 + 0.4 * Math.sin(t * 2.7 + 0.8);
    const h2  = Math.round(18 * f2);
    const ox2 = Math.round(Math.sin(t * 1.9) * 2);
    gfx.fillStyle(0xFF5500, alpha * 0.82);
    gfx.fillRect(bx - 6 + ox2, by - h2, 12, h2 + 1);

    // Inner flame — hot orange-yellow
    const f3  = 0.65 + 0.35 * Math.sin(t * 3.8 + 1.4);
    const h3  = Math.round(22 * f3);
    const ox3 = Math.round(Math.sin(t * 2.4 + 0.5) * 1.5);
    gfx.fillStyle(0xFF8800, alpha * 0.78);
    gfx.fillRect(bx - 4 + ox3, by - h3, 8, h3);

    // Core — yellow-white hot
    const f4  = 0.7 + 0.3 * Math.sin(t * 4.6 + 0.2);
    const h4  = Math.round(14 * f4);
    gfx.fillStyle(0xFFCC00, alpha * 0.7);
    gfx.fillRect(bx - 2, by - h4 - 4, 4, h4);
    gfx.fillStyle(0xFFEE44, alpha * 0.55);
    gfx.fillRect(bx - 1, by - h4 - 8, 2, 6);

    // Sparks — rise and drift
    gfx.fillStyle(0xFFFF88, alpha * 0.8);
    for (let i = 0; i < 7; i++) {
      const phase  = t * (1.8 + i * 0.4) + i * 1.3;
      const rise   = (phase % (Math.PI * 2)) / (Math.PI * 2);
      const drift  = Math.sin(t * 2.1 + i * 0.9) * 9;
      const sx     = bx + Math.round(drift);
      const sy     = by - 8 - Math.round(rise * 22);
      const fade   = 1 - rise;
      if (fade > 0.1) {
        gfx.fillStyle(i % 3 === 0 ? 0xFFAA22 : 0xFFFF44, alpha * fade * 0.75);
        gfx.fillRect(sx, sy, 1 + (i % 2), 1 + (i % 2));
      }
    }

    // Smoke puffs — grey dots drifting up slowly (day-visible)
    const smokeA = Math.max(0, 0.25 - nf * 0.1);
    if (smokeA > 0.01) {
      for (let i = 0; i < 4; i++) {
        const sp    = t * 0.4 + i * 0.7;
        const rise2 = (sp % (Math.PI * 2)) / (Math.PI * 2);
        const driftS = Math.sin(t * 0.8 + i * 1.1) * 7;
        gfx.fillStyle(0x888888, smokeA * (1 - rise2) * 0.8);
        gfx.fillCircle(bx + Math.round(driftS), by - 14 - Math.round(rise2 * 18), 3 + i % 3);
      }
    }
  }

  // ── Sky reflection ────────────────────────────────────────────────────────

  private updateSkyReflection(horizonColor: number): void {
    const gfx = this.skyReflectGfx;
    gfx.clear();
    if (this._width === 0) return;

    // Fade out reflection at night (water looks dark, not reflective)
    const alpha = 0.35 * Math.max(0, 1 - this._nightFactor * 2.0);
    if (alpha < 0.01) return;

    // Gradient overlay on the top 40% of the water band, fading to 0 at bottom
    const reflH = Math.floor(WATER_H * 0.40);
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const frac = s / steps;
      gfx.fillStyle(horizonColor, alpha * (1 - frac));
      const y0 = this._waterY + Math.floor(frac * reflH);
      const y1 = this._waterY + Math.floor((s + 1) / steps * reflH);
      gfx.fillRect(0, y0, this._width, Math.max(1, y1 - y0));
    }
  }

  // ── Lighting updates ──────────────────────────────────────────────────────

  updateLighting(elevation: number): void {
    if (Math.abs(elevation - this._lastLightElevation) < 0.002) return;
    this._lastLightElevation = elevation;
    this._nightFactor = Math.max(0, Math.min(1, (0.2 - elevation) / 0.3));
    const nf = this._nightFactor;

    // Pier / café / lifeguard hut / dock — manual night tint (these images
    // skip the Light2D pipeline, same as cyclist/furniture sprites).
    const structTint = lerpColor(0xffffff, NIGHT_TINT, nf);
    this._pierAndStructures.updateLighting(nf, structTint);
    this._lighthouse.updateLighting(nf, structTint);

    // Bonfire (flicker handled in update)
    if (nf < 0.05) {
      for (const b of this._bonFireLights) (b as { intensity: number }).intensity = 0;
    }
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.destroyFoamSprites();
    this.destroyBeachPeople();
    this.waterGfx.destroy();
    this.skyReflectGfx.destroy();
    this.shadowGfx.destroy();
    this.beachShadowGfx.destroy();
    this.beachPeopleGfx.destroy();
    this.fxGfx.destroy();
    this._lighthouse.destroy();
    this._pierAndStructures.destroy();
    this.crittersGfx.destroy();
  }
}
