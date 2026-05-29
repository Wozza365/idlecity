import Phaser from 'phaser';
import { COMPOSITE_FRAG } from './shaders';
import { type ShadowMap } from './ShadowMapRenderer';

// Pass 2: composite the accumulated shadow map over the scene.
//
// Uses Phaser 4's BaseFilterShader + Controller filter system.
// The node is created at runtime by accessing the internal Phaser class.
// setupTextures adds the shadow map to texture slot 1.
// setupUniforms sets ambient colour/intensity from the controller.
//
// Controller stores ambient state so the node can read it per-frame.

const NODE_NAME = 'FilterLightingComposite';

export interface AmbientState {
  r: number; g: number; b: number;
  intensity: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

export class LightingComposite {
  private readonly controller: Phaser.Filters.Controller;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly renderNodes: any;

  constructor(scene: Phaser.Scene, shadowMap: ShadowMap, gameFraction: number) {
    this.camera = scene.cameras.main;
    const renderer = scene.renderer as AnyObj;
    this.renderNodes = renderer.renderNodes;

    // Get Phaser's BaseFilterShader class at runtime.
    const BaseFilterShader: AnyObj =
      (Phaser as AnyObj).Renderer?.WebGL?.RenderNodes?.BaseFilterShader;

    if (!BaseFilterShader) {
      throw new Error('[LightingComposite] BaseFilterShader not found in Phaser internals');
    }

    // Create the render node and override the two hooks.
    const node: AnyObj = new BaseFilterShader(
      NODE_NAME,
      this.renderNodes,
      null,
      COMPOSITE_FRAG,
    );

    // Bind the shadow map texture to slot 1 in the textures array.
    // textures[0] = scene (auto-populated by BaseFilterShader.run)
    // Must use textureWrapper (has .webGLTexture) — raw WebGLTexture won't work
    // because WebGLTextureUnitsWrapper.bind() reads texture.webGLTexture.
    node.setupTextures = (
      _controller: AnyObj,
      textures: AnyObj[],
      _drawingContext: AnyObj,
    ) => {
      textures[1] = shadowMap.textureWrapper;
    };

    // Set shader uniforms from controller's ambient state.
    node.setupUniforms = (
      controller: AnyObj,
      _drawingContext: AnyObj,
    ) => {
      const pm = node.programManager;
      pm.setUniform('uShadowSampler', 1);
      pm.setUniform('uAmbientColor', [controller.ambientR, controller.ambientG, controller.ambientB]);
      pm.setUniform('uAmbientIntensity', controller.ambientIntensity);
      pm.setUniform('uGameFraction', controller.gameFraction);
    };

    this.renderNodes.addNode(NODE_NAME, node);

    // Create a base Controller that references our node.
    this.controller = new Phaser.Filters.Controller(this.camera, NODE_NAME);
    (this.controller as AnyObj).ambientR = 1.0;
    (this.controller as AnyObj).ambientG = 0.95;
    (this.controller as AnyObj).ambientB = 0.85;
    (this.controller as AnyObj).ambientIntensity = 1.0;
    (this.controller as AnyObj).gameFraction = gameFraction;

    // Attach to camera's external filter list.
    this.camera.filters!.external.add(this.controller);
  }

  setAmbient(ambient: AmbientState): void {
    const c = this.controller as AnyObj;
    c.ambientR = ambient.r;
    c.ambientG = ambient.g;
    c.ambientB = ambient.b;
    c.ambientIntensity = ambient.intensity;
  }

  destroy(): void {
    this.camera.filters?.external.remove(this.controller);
    // Remove the registered render node.
    if (this.renderNodes._nodes) {
      delete this.renderNodes._nodes[NODE_NAME];
    }
  }
}
