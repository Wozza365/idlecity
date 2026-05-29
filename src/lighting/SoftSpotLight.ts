import { type LightSource } from './LightingSystem';

const BEAM_COUNT = 15;

export type SoftSpotParams = {
  x: number; y: number;
  radius: number; color: number; intensity: number;
  angle: number; coneAngle: number;
  noOcclusion?: boolean;
};

// Wraps a spot light as BEAM_COUNT concentric beams with progressively wider
// cone angles (+1% per beam) and divided intensity, so that the additive sum at
// the beam centre exactly matches the original intensity × colour, while the
// edges blend softly as each outer beam falls away.
export class SoftSpotLight {
  readonly beams: Array<LightSource & { type: 'spot' }>;

  constructor(p: SoftSpotParams) {
    this.beams = Array.from({ length: BEAM_COUNT }, (_, i) => ({
      type: 'spot' as const,
      x: p.x,
      y: p.y,
      radius: p.radius,
      color: p.color,
      intensity: p.intensity / BEAM_COUNT,
      angle: p.angle,
      coneAngle: p.coneAngle * (1 + 0.08 + i * 0.03),
      ...(p.noOcclusion ? { noOcclusion: true as const } : {}),
    }));
  }

  update(x: number, y: number): void {
    for (const beam of this.beams) {
      beam.x = x;
      beam.y = y;
    }
  }

  // Set the total intensity across all beams (divides evenly so the centre sum equals `total`).
  setIntensity(total: number): void {
    const perBeam = total / BEAM_COUNT;
    for (const beam of this.beams) {
      beam.intensity = perBeam;
    }
  }
}
