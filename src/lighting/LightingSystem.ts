import Phaser from 'phaser';
import { UI_HEIGHT } from '../constants';
import {
  type Point,
  type Segment,
  buildScreenBoundary,
  segmentsFromRect,
  segmentsFromPolygon,
  computeVisibilityPolygon,
  computeSpotVisibilityPolygon,
} from '../utils/visibilityPolygon';
import { ShadowMapRenderer } from './ShadowMapRenderer';
import { LightingComposite, type AmbientState } from './LightingComposite';

// ── Light source types ─────────────────────────────────────────────────────

export type LightSource =
  | { type?: 'point'; x: number; y: number; radius: number; color: number; intensity?: number; noOcclusion?: boolean }
  | { type: 'spot';   x: number; y: number; radius: number; color: number;
      angle: number; coneAngle: number; intensity?: number; noOcclusion?: boolean }
  | { type: 'window'; x: number; y: number; radius: number; color: number; intensity?: number; noOcclusion?: boolean };

interface HasOutlinePoints {
  getOutlinePoints(): Array<{ x: number; y: number }>;
}
function hasOutlinePoints(o: unknown): o is HasOutlinePoints {
  return typeof (o as HasOutlinePoints).getOutlinePoints === 'function';
}

// ── Ambient colour table ───────────────────────────────────────────────────
// elevation: Math.sin(sunAngle). +1 = solar noon, -1 = solar midnight.

function ambientFromElevation(elevation: number): AmbientState {
  // Clamp to [-1, 1]
  const e = Math.max(-1, Math.min(1, elevation));

  if (e >= 0.3) {
    // Full day
    return { r: 1.0, g: 0.95, b: 0.85, intensity: 1.0 };
  } else if (e >= 0.0) {
    // Golden hour → twilight
    const t = e / 0.3;
    return {
      r: lerp(0.3, 1.0, t),
      g: lerp(0.25, 0.95, t),
      b: lerp(0.4, 0.85, t),
      intensity: lerp(0.35, 1.0, t),
    };
  } else if (e >= -0.2) {
    // Twilight → deep night
    const t = (e + 0.2) / 0.2;
    return {
      r: lerp(0.68, 0.3, t),
      g: lerp(0.72, 0.25, t),
      b: lerp(0.87, 0.4, t),
      intensity: lerp(1.0, 0.35, t),
    };
  } else {
    // Full night
    return { r: 0.68, g: 0.72, b: 0.87, intensity: 1.0 };
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── LightingSystem ─────────────────────────────────────────────────────────

export class LightingSystem {
  private readonly scene: Phaser.Scene;
  readonly lights: LightSource[] = [];

  private readonly shadowRenderer: ShadowMapRenderer;
  private readonly composite: LightingComposite;

  constructor(scene: Phaser.Scene, _groundY: number) {
    this.scene = scene;
    const { width, height } = scene.scale;
    const gameH = height - UI_HEIGHT;

    // Shadow map must match the camera output size (full screen) so that the
    // composite filter's UV coordinates align 1:1 with the shadow map.
    // Lights are positioned in game pixel coords (y=0 at top), which maps
    // directly into the full-height FBO.
    this.shadowRenderer = new ShadowMapRenderer(scene, width, height);
    this.composite = new LightingComposite(
      scene,
      this.shadowRenderer.shadowMap,
      gameH / height,  // fraction of screen that is game area (not UI)
    );

    // Kick off with full-day ambient so first frame is correct.
    this.composite.setAmbient({ r: 1.0, g: 0.95, b: 0.85, intensity: 1.0 });
  }

  addLight(light: LightSource): void {
    this.lights.push(light);
  }

  removeLight(light: LightSource): void {
    const idx = this.lights.indexOf(light);
    if (idx !== -1) this.lights.splice(idx, 1);
  }

  // Called every frame from GameScene.onClockTick().
  update(sunAngle: number): void {
    const elevation = Math.sin(sunAngle);
    this.composite.setAmbient(ambientFromElevation(elevation));

    const segs = this.collectSegments();

    this.shadowRenderer.beginFrame();
    for (const light of this.lights) {
      if (light.noOcclusion) {
        if (light.type === 'spot') {
          this.shadowRenderer.renderSpotLightNoOcclusion(light);
        } else {
          this.shadowRenderer.renderPointLightNoOcclusion(light);
        }
      } else if (light.type === 'spot') {
        const poly = computeSpotVisibilityPolygon(
          { x: light.x, y: light.y },
          light.angle,
          light.coneAngle / 2,
          segs,
        );
        this.shadowRenderer.renderSpotLight(light, poly);
      } else {
        const poly = computeVisibilityPolygon({ x: light.x, y: light.y }, segs);
        this.shadowRenderer.renderPointLight(light as Parameters<ShadowMapRenderer['renderPointLight']>[0], poly);
      }
    }
    this.shadowRenderer.endFrame();
  }

  destroy(): void {
    this.shadowRenderer.destroy();
    this.composite.destroy();
  }

  // ── Segment collection ────────────────────────────────────────────────────

  collectSegments(): Segment[] {
    const { width, height } = this.scene.scale;
    const gameH = height - UI_HEIGHT;
    const segs: Segment[] = buildScreenBoundary(width, gameH);

    for (const child of this.scene.children.list) {
      if (!(child instanceof Phaser.GameObjects.Container)) continue;
      const c = child as Phaser.GameObjects.Container & { depth?: number };
      if ((c.depth ?? 0) < 8 || (c.depth ?? 0) > 10) continue;

      if (hasOutlinePoints(c)) {
        const pts: Point[] = c.getOutlinePoints().map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));
        segs.push(...segmentsFromPolygon(pts));
      } else {
        const bounds = c.getBounds();
        if (bounds.height > 20 && bounds.width > 10) {
          segs.push(...segmentsFromRect(bounds.x, bounds.y, bounds.width, bounds.height));
        }
      }
    }

    return segs;
  }
}
