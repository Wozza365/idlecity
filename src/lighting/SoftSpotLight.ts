import { type LightSource } from './LightingSystem';

// Outer penumbra edge = coneAngle × (1 + PENUMBRA_RATIO), matching the old
// 15-beam range which spanned from coneAngle×1.08 to coneAngle×1.50.
const PENUMBRA_RATIO = 0.5;

export type SoftSpotParams = {
  x: number; y: number;
  radius: number; color: number; intensity: number;
  angle: number; coneAngle: number;
  penumbraRatio?: number;
  noOcclusion?: boolean;
};

// Single spot light with a shader-driven penumbra instead of 15 stacked beams.
// The GLSL smoothstep between inner (coneAngle) and outer (coneAngle × 1.5)
// produces the same gradual edge falloff at 1/15th the draw-call cost.
export class SoftSpotLight {
  readonly beams: Array<LightSource & { type: 'spot' }>;

  constructor(p: SoftSpotParams) {
    this.beams = [{
      type: 'spot',
      x: p.x,
      y: p.y,
      radius: p.radius,
      color: p.color,
      intensity: p.intensity,
      angle: p.angle,
      coneAngle: p.coneAngle,
      penumbraAngle: p.coneAngle * (p.penumbraRatio ?? PENUMBRA_RATIO),
      ...(p.noOcclusion ? { noOcclusion: true as const } : {}),
    }];
  }

  update(x: number, y: number): void {
    this.beams[0].x = x;
    this.beams[0].y = y;
  }

  setIntensity(total: number): void {
    this.beams[0].intensity = total;
  }
}
