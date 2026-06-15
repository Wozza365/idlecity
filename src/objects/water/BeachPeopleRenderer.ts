import Phaser from 'phaser';
import { NIGHT_TINT, lerpColor, dimColor } from '../../constants';
import type { WaterPalette } from '../../theme/ThemeTypes';
import { type PersonDef, PERSON_DEFS, walkAnimKey } from '../PedestrianAssets';
import { advanceBeachPersonPosition, advanceBeachPersonPhase } from './BeachPeopleSim';

const BEACH_SHORE_H = 48;  // depth of sandy beach area — matches WaterArea's

// Beach people — reuse path-pedestrian character sprites
const BEACH_PERSON_WALK_FRAMERATE = 4;
const BEACH_PERSON_H_MIN = 9;  // px — slightly smaller than path pedestrians (background); varies +0..4 via (i % 5)
const BEACH_PERSON_SHADOW_ALPHA = 0.25;
const BEACH_PERSON_DEPTH        = 5.665;
const BEACH_PERSON_SHADOW_DEPTH = 5.663;

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

// Beach people walking/sitting on the sandy shore, plus foam sprites at the
// waterline — extracted from WaterArea so the latter only needs to call
// render/update/destroy. Position/phase transitions use the pure helpers
// from BeachPeopleSim; this class owns sprite creation/mutation.
export class BeachPeopleRenderer {
  private readonly scene: Phaser.Scene;

  private beachShadowGfx: Phaser.GameObjects.Graphics; // 5.76 – beach people shadows
  private beachPeopleGfx: Phaser.GameObjects.Graphics; // 5.78 – moving beach people

  private _level     = 0;
  private _beachEndX = 0;
  private _waterY    = 0;
  private _palette!: WaterPalette;

  private _people: BeachPerson[] = [];
  private _foamSprites: Phaser.GameObjects.Sprite[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.beachShadowGfx = scene.add.graphics().setDepth(5.62);
    this.beachPeopleGfx = scene.add.graphics().setDepth(5.66).setLighting(true);
  }

  render(level: number, beachEndX: number, waterY: number, palette: WaterPalette): void {
    this._level     = level;
    this._beachEndX = beachEndX;
    this._waterY    = waterY;
    this._palette   = palette;

    if (level >= 2) { this.initBeachPeople(); this.initFoamSprites(); }
    else { this.destroyFoamSprites(); }
  }

  // ── Foam sprites (High Tides asset pack) ──────────────────────────────────

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

  // ── Beach people AI ────────────────────────────────────────────────────────

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

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(delta: number, elevation: number, nightFactor: number): void {
    if (this._level < 2 || this._people.length === 0) {
      this.beachPeopleGfx.clear();
      this.beachShadowGfx.clear();
      return;
    }

    const targetAlpha = Math.max(0, Math.min(1, (elevation + 0.1) / 0.4));
    const dt = delta / 1000;

    const brightness = Math.max(0.25, Math.min(1, (elevation + 0.2) / 0.4));
    const tint = dimColor(lerpColor(0xffffff, NIGHT_TINT, nightFactor), brightness);

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

  destroy(): void {
    this.destroyFoamSprites();
    this.destroyBeachPeople();
    this.beachShadowGfx.destroy();
    this.beachPeopleGfx.destroy();
  }
}
