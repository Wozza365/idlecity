import Phaser from 'phaser';
import { WATER_H, lerpColor } from '../../constants';
import { islandClearAt } from './LighthouseFeature';

const BEACH_SHORE_H = 48;  // depth of sandy beach area — matches WaterArea's
const ROCK_SHORE_H  = 22;  // depth of rocky area — matches WaterArea's

export interface WaveFxParams {
  width: number;
  waterY: number;
  beachEndX: number;
  dockX1: number;
  dockX2: number;
  transEndX: number;
  level: number;
  nightFactor: number;
  lighthouseActive: boolean;
  lighthouseX: number;
  lighthouseTopY: number;
}

// Full-width rising water waves, beach foam, moonlight shimmer, and sun
// glitter — the animated water surface drawn each frame onto WaterArea's FX
// layer. Extracted from WaterArea's drawFx() so the latter only needs to
// call update/draw; islandClearAt (from LighthouseFeature) clears a wake
// around the lighthouse island at level 8+.
export class WaveFx {
  private _waveTime = 0;
  private _waveRise = 0;

  // Shared with WaterArea's duck-bob animation in drawCritters().
  get waveTime(): number { return this._waveTime; }

  update(delta: number): void {
    const dt = delta / 1000;
    this._waveTime += dt * 0.3;
    this._waveRise += dt * 7.5; // 7.5 px/s rise speed
  }

  // ── Full-width rising water waves ──
  // Each wave crest is rendered as two overlapping passes of short strokes.
  // Both passes use deterministic per-position y-noise so adjacent strokes land
  // at slightly different y-values — where they meet the edges are ragged and
  // organic, not a clean geometric line.  The two passes have different strides
  // and x-offsets so their stroke boundaries never align, which fills out the
  // crest with irregular overlaps.  Shore-proximity fade is per-stroke.
  draw(gfx: Phaser.GameObjects.Graphics, params: WaveFxParams): void {
    const {
      width: w, waterY: wy, beachEndX: bx, dockX1: dkx1, dockX2: dkx2,
      transEndX: tx, level: lv, nightFactor: nf,
      lighthouseActive: islandActive, lighthouseX, lighthouseTopY,
    } = params;

    const t    = this._waveTime;
    const rise = this._waveRise % WATER_H;
    const dayA = Math.max(0, 1 - nf * 1.1);

    // Shore ceiling at column x — same logic reused by both passes
    const ceilAt = (x: number): number => {
      if (lv < 1) return wy;
      if (x < bx) return wy + BEACH_SHORE_H;
      if (lv >= 5 && x >= dkx1 && x < dkx2) return wy + BEACH_SHORE_H;
      if (x >= tx) return wy + ROCK_SHORE_H;
      const r = (x - bx) / Math.max(1, tx - bx);
      const s = r * r * (3 - 2 * r);
      return wy + Math.round(BEACH_SHORE_H * (1 - s) + ROCK_SHORE_H * s);
    };

    // Lighthouse island "wake" — waves fade into a calm clearing around the
    // island, with a longer tail trailing behind/above it (toward shore) so
    // the gap reads as a natural wake/shadow rather than a hard hole.
    // Shifted left of lighthouseX to match the island's visual centre,
    // which is pulled left by the companion boulder (drawn at cx-26..cx-33).
    const islandCx = lighthouseX - 7;
    const islandCy = lighthouseTopY + 48;

    if (dayA > 0.01) {
      const SHORE_FADE = 30;
      const NUM_WAVES  = 14;
      const SPACING    = WATER_H / NUM_WAVES;

      for (let wi = 0; wi < NUM_WAVES; wi++) {
        const rawDepth = ((wi * SPACING - rise) % WATER_H + WATER_H) % WATER_H;
        const topFade  = Math.min(1, rawDepth / 8);
        const botFade  = Math.min(1, (WATER_H - rawDepth) / 8);
        if (topFade < 0.05 || botFade < 0.05) continue;

        const baseAlpha = dayA * 0.13 * topFade * botFade;
        if (baseAlpha < 0.01) continue;

        // Multi-harmonic smooth envelope — determines the y-centre for each crest
        const f1 = 0.024 + wi * 0.004;
        const a1 = 2.5   - wi * 0.16;
        const s1 = 0.36  + wi * 0.06;
        const ph = wi    * 1.4;
        const envY = (x: number) =>
          wy + rawDepth
          + Math.sin(x * f1       + t * s1       + ph)        * a1
          + Math.sin(x * f1 * 2.3 + t * s1 * 1.7 + ph * 0.8) * (a1 * 0.40)
          + Math.sin(x * f1 * 5.7 + t * s1 * 2.5 + ph * 1.5) * (a1 * 0.18)
          + Math.sin(x * f1 * 0.5 + t * s1 * 2.0 + ph * 1.7) * (a1 * 0.70);

        // Two passes with distinct strides / x-offsets so their stroke-start
        // positions never coincide — this guarantees the overlap zones sit at
        // different y-values and give genuinely ragged edges.
        //   Pass A — primary body:  stride 6, seg 10-13 px,  noise ±1.6 px
        //   Pass B — fringe layer:  stride 9, seg  8-11 px,  noise ±2.3 px, shifted 4 px
        const passes = [
          { stride: 12, segBase: 22, noiseAmp: 1.6, xOff: 0, aScale: 1.00 },
          { stride: 18, segBase: 18, noiseAmp: 2.3, xOff: 7, aScale: 0.42 },
        ] as const;

        for (const pd of passes) {
          for (let sx = 0; sx < w; sx += pd.stride) {
            const x = sx + pd.xOff;
            if (x >= w) continue;

            // Deterministic y-noise: two spatial frequencies, stable over time.
            // These shift each stroke's y by a small unique amount so adjacent
            // strokes meet at different heights — that is the ragged-edge mechanism.
            const noise =
              Math.sin(x * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp
            + Math.sin(x * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;

            const y0    = Math.round(envY(x) + noise);
            const ceilY = ceilAt(x);
            if (y0 < ceilY || y0 >= wy + WATER_H) continue;

            const clear = islandClearAt(x, y0, islandCx, islandCy, islandActive);
            if (clear >= 1) continue;

            const shoreFade = Math.min(1, (y0 - ceilY) / SHORE_FADE);
            const a = baseAlpha * pd.aScale * shoreFade * (1 - clear);
            if (a < 0.005) continue;

            // Segment length varies per position (±2 px around base)
            const lenVar = Math.round(Math.sin(x * 0.77 + wi * 3.9) * 2);
            const segLen = Math.min(pd.segBase + lenVar, w - x);
            if (segLen <= 0) continue;

            // Line width — mostly thin (1px); occasional thicker (2px)
            // patches drift along the wave over time (via -t terms) so the
            // thicker stretches travel with the crest rather than sitting
            // fixed at the same x-positions.
            const thickPhase = Math.sin(x * 0.05 + wi * 3.1 - t * 1.4)
                             + Math.sin(x * 0.21 + wi * 5.3 - t * 0.7) * 0.6;
            const lineW = thickPhase > 1.0 ? 2 : 1;

            // Subtle colour variation: pale blue-white → soft white
            const colorT    = (Math.sin(x * 0.17 + wi * 4.3 + t * 1.8) + 1) * 0.5;
            const waveColor = lerpColor(0xBED8F5, 0xEAF4FF, colorT);

            // Draw stroke as a curved polyline (5 pts) following the wave envelope
            // so the stroke itself tilts and bends with the wave rather than
            // being a flat horizontal bar.
            gfx.lineStyle(lineW, waveColor, a);
            gfx.beginPath();
            const PTS = 5;
            for (let ci = 0; ci <= PTS; ci++) {
              const px = x + segLen * ci / PTS;
              const pn = Math.sin(px * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp
                       + Math.sin(px * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
              const py = envY(px) + pn;
              if (ci === 0) { gfx.moveTo(px, py); } else { gfx.lineTo(px, py); }
            }
            gfx.strokePath();

            // Bright crest highlight — short high-alpha segment at stroke start
            if (pd.aScale >= 1.0 && a > 0.05) {
              const px4 = x + 5;
              const pn0 = Math.sin(x   * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp + Math.sin(x   * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
              const pn4 = Math.sin(px4 * 0.38 + wi * 6.1 + t * 5.0) * pd.noiseAmp + Math.sin(px4 * 1.19 + wi * 2.7 + t * 3.5) * pd.noiseAmp * 0.5;
              gfx.lineStyle(lineW, waveColor, Math.min(0.8, a * 1.3));
              gfx.beginPath();
              gfx.moveTo(x,   envY(x)   + pn0);
              gfx.lineTo(px4, envY(px4) + pn4);
              gfx.strokePath();
            }
          }
        }
      }
    }

    // Foam at beach waterline (where sand meets water)
    if (dayA > 0.05) {
      for (let x = 4; x < bx - 4; x += 5) {
        const foamA = (0.18 + 0.14 * Math.sin(t * 2.2 + x * 0.18)) * dayA;
        const foamY = wy + BEACH_SHORE_H - 3
                    + Math.round(Math.sin(t * 1.8 + x * 0.09) * 2);
        gfx.fillStyle(0xFFFFFF, foamA);
        gfx.fillRect(x, foamY, 4, 1);
      }
    }

    // Moonlight shimmer — single moving glint streak
    if (nf > 0.25) {
      const moonA  = (nf - 0.25) * 0.18;
      const moonX  = Math.round(w * (0.35 + 0.2 * Math.sin(t * 0.18)));
      const moonW  = Math.round(w * 0.12);
      for (let row = 0; row < 3; row++) {
        const my = wy + 20 + row * 22;
        const mx = moonX + row * 8;
        gfx.fillStyle(0xCCEEFF, moonA * (1 - row * 0.25));
        gfx.fillRect(mx, my, moonW - row * 10, 1);
      }
    }

    // Sun glitter — scattered twinkling highlights across the open water,
    // brightest in full daylight and fading out as night approaches.
    // Each candidate point flickers on/off with its own phase/frequency so
    // only a handful sparkle at any instant, like sunlight on tiny ripples.
    if (dayA > 0.05) {
      const gx0 = tx + 8;
      const gy0 = wy + ROCK_SHORE_H + 6;
      const gy1 = wy + WATER_H - 10;
      const spanX = w - gx0;
      const spanY = gy1 - gy0;
      if (spanX > 0 && spanY > 0) {
        const GLITTER_COUNT = Math.floor(spanX / 9);
        for (let i = 0; i < GLITTER_COUNT; i++) {
          const gx = gx0 + ((i * 53 + 17) % spanX);
          const gy = gy0 + ((i * 31 + 11) % spanY);
          if (islandClearAt(gx, gy, islandCx, islandCy, islandActive) > 0.3) continue;

          const freq  = 3 + (i % 7);
          const phase = i * 2.399;
          const tw = Math.sin(t * freq + phase);
          if (tw < 0.55) continue;

          const a = dayA * (tw - 0.55) / 0.45 * 0.65;
          if (a < 0.03) continue;
          gfx.fillStyle(i % 3 === 0 ? 0xFFFFD0 : 0xFFFFFF, a);
          gfx.fillRect(gx, gy, 1, 1);
        }
      }
    }
  }
}
