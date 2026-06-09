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
  | { type?: 'point'; x: number; y: number; radius: number; color: number; intensity?: number; noOcclusion?: boolean; cursorLight?: boolean }
  | { type: 'spot';   x: number; y: number; radius: number; color: number;
      angle: number; coneAngle: number; penumbraAngle?: number; intensity?: number; noOcclusion?: boolean; cursorLight?: boolean }
  | { type: 'window'; x: number; y: number; radius: number; color: number; intensity?: number; noOcclusion?: boolean; cursorLight?: boolean };

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
    return { r: 1.0, g: 0.95, b: 0.85, intensity: 1.0, nightWeight: 0 };
  } else if (e >= 0.0) {
    // Dusk/dawn: lerp day white-yellow → night blue
    const t = e / 0.3;
    return {
      r: lerp(0.55, 1.0, t),
      g: lerp(0.65, 0.95, t),
      b: lerp(0.95, 0.85, t),
      intensity: lerp(1.09, 1.0, t),
      nightWeight: lerp(1.0, 0.0, t),
    };
  } else {
    // Night: vivid moonlit blue ambient with a raised floor
    return { r: 0.55, g: 0.65, b: 0.95, intensity: 1.09, nightWeight: 1.0 };
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
  private _cachedSegments: Segment[] | null = null;
  private _segmentsDirty = true;
  private _treeOccluders: Array<{ x: number; y: number; r: number }> = [];

  constructor(scene: Phaser.Scene, _groundY: number, topUIPx: number = 0) {
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
      this.shadowRenderer.cursorMap,
      gameH / height,      // fraction of screen that is game area (not bottom UI)
      topUIPx / height,    // fraction occupied by the top dev panel
    );

    // Kick off with full-day ambient so first frame is correct.
    this.composite.setAmbient({ r: 1.0, g: 0.95, b: 0.85, intensity: 1.0, nightWeight: 0 });
  }

  addLight(light: LightSource): void {
    this.lights.push(light);
  }

  removeLight(light: LightSource): void {
    const idx = this.lights.indexOf(light);
    if (idx !== -1) this.lights.splice(idx, 1);
  }

  markSegmentsDirty(): void {
    this._segmentsDirty = true;
  }

  setTreeOccluders(occluders: Array<{ x: number; y: number; r: number }>): void {
    this._treeOccluders = occluders;
    this._segmentsDirty = true;
  }

  // Called every frame from GameScene.onClockTick().
  update(sunAngle: number, moonPhase: number = 0): void {
    const elevation = Math.sin(sunAngle);
    const ambient = ambientFromElevation(elevation);
    if (elevation < 0) {
      const moonElev = Math.max(0, Math.sin(sunAngle + Math.PI));
      const moonIllumination = (1 + Math.cos(2 * Math.PI * moonPhase)) / 2;
      ambient.intensity += moonElev * moonIllumination * 0.14;
    }
    this.composite.setAmbient(ambient);

    if (this._segmentsDirty || this._cachedSegments === null) {
      this._cachedSegments = this.collectSegments();
      this._segmentsDirty = false;
    }
    const segs = this._cachedSegments;

    this.shadowRenderer.beginFrame();
    for (const light of this.lights) {
      if (light.cursorLight) continue;
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
          (light.coneAngle + (light.penumbraAngle ?? 0)) / 2,
          segs,
        );
        this.shadowRenderer.renderSpotLight(light, poly);
      } else {
        const poly = computeVisibilityPolygon({ x: light.x, y: light.y }, segs);
        this.shadowRenderer.renderPointLight(light as Parameters<ShadowMapRenderer['renderPointLight']>[0], poly);
      }
    }
    this.shadowRenderer.renderTreeMasks(this._treeOccluders);
    this.shadowRenderer.endFrame();

    // Cursor lights go into a separate FBO so the composite shader can apply them
    // with an ambient-tinted floor instead of the hard 0.2 reflectance floor used
    // for regular lights. This prevents the grey-circle artefact on dark surfaces.
    this.shadowRenderer.beginCursorFrame();
    for (const light of this.lights) {
      if (!light.cursorLight) continue;
      this.shadowRenderer.renderPointLightNoOcclusion(light);
    }
    this.shadowRenderer.endCursorFrame();
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
