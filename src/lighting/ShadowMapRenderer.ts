import Phaser from 'phaser';
import { type LightSource } from './LightingSystem';
import { type Point } from '../utils/visibilityPolygon';
import {
  QUAD_VERT, LIGHT_DISC_FRAG, SPOT_DISC_FRAG,
  POLY_VERT, POLY_FRAG,
} from './shaders';

// Raw WebGL shadow map renderer — two sub-passes per light:
//   1. Draw visibility polygon into stencil buffer (POLY_VERT + POLY_FRAG).
//   2. Draw fullscreen quad with GLSL light-disc falloff, clipped by stencil.
// Uses true additive blend (ONE, ONE) so multiple lights accumulate correctly.

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function linkProgram(
  gl: WebGLRenderingContext,
  vert: string,
  frag: string,
): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Shader link error:\n${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

interface DiscProgram {
  program: WebGLProgram;
  aPosition: number;
  uLightPos: WebGLUniformLocation;
  uRadius: WebGLUniformLocation;
  uLightColor: WebGLUniformLocation;
  uIntensity: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
}

interface SpotProgram extends DiscProgram {
  uLightDir: WebGLUniformLocation;
  uCosInnerHalfCone: WebGLUniformLocation;
  uCosOuterHalfCone: WebGLUniformLocation;
}

interface PolyProgram {
  program: WebGLProgram;
  aPosition: number;
  uResolution: WebGLUniformLocation;
}

// Minimal WebGLTextureWrapper-compatible shim so Phaser's texture unit system
// (WebGLTextureUnitsWrapper.bind) can bind our raw WebGLTexture via
// texture.webGLTexture without receiving undefined.
export interface ShadowMapTextureWrapper {
  webGLTexture: WebGLTexture;
  needsMipmapRegeneration: boolean;
}

// Shadow map texture + FBO for the light accumulation buffer.
export interface ShadowMap {
  texture: WebGLTexture;
  textureWrapper: ShadowMapTextureWrapper;
  width: number;
  height: number;
}

export class ShadowMapRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer;

  private readonly discProg: DiscProgram;
  private readonly spotProg: SpotProgram;
  private readonly polyProg: PolyProgram;

  private readonly quadBuf: WebGLBuffer;
  private readonly polyBuf: WebGLBuffer;

  private fbo: WebGLFramebuffer;
  private depthStencilRbo: WebGLRenderbuffer;
  readonly shadowMap: ShadowMap;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    this.renderer = renderer;
    const gl = renderer.gl as WebGLRenderingContext;
    this.gl = gl;

    // ── Compile programs ────────────────────────────────────────────────────
    const discRaw = linkProgram(gl, QUAD_VERT, LIGHT_DISC_FRAG);
    this.discProg = {
      program: discRaw,
      aPosition:   gl.getAttribLocation(discRaw, 'aPosition'),
      uLightPos:   gl.getUniformLocation(discRaw, 'uLightPos')!,
      uRadius:     gl.getUniformLocation(discRaw, 'uRadius')!,
      uLightColor: gl.getUniformLocation(discRaw, 'uLightColor')!,
      uIntensity:  gl.getUniformLocation(discRaw, 'uIntensity')!,
      uResolution: gl.getUniformLocation(discRaw, 'uResolution')!,
    };

    const spotRaw = linkProgram(gl, QUAD_VERT, SPOT_DISC_FRAG);
    this.spotProg = {
      program: spotRaw,
      aPosition:    gl.getAttribLocation(spotRaw, 'aPosition'),
      uLightPos:    gl.getUniformLocation(spotRaw, 'uLightPos')!,
      uRadius:      gl.getUniformLocation(spotRaw, 'uRadius')!,
      uLightColor:  gl.getUniformLocation(spotRaw, 'uLightColor')!,
      uIntensity:   gl.getUniformLocation(spotRaw, 'uIntensity')!,
      uResolution:  gl.getUniformLocation(spotRaw, 'uResolution')!,
      uLightDir:         gl.getUniformLocation(spotRaw, 'uLightDir')!,
      uCosInnerHalfCone: gl.getUniformLocation(spotRaw, 'uCosInnerHalfCone')!,
      uCosOuterHalfCone: gl.getUniformLocation(spotRaw, 'uCosOuterHalfCone')!,
    };

    const polyRaw = linkProgram(gl, POLY_VERT, POLY_FRAG);
    this.polyProg = {
      program: polyRaw,
      aPosition:   gl.getAttribLocation(polyRaw, 'aPosition'),
      uResolution: gl.getUniformLocation(polyRaw, 'uResolution')!,
    };

    // ── Fullscreen quad (NDC, two triangles) ───────────────────────────────
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,   1, -1,   -1,  1,
       1, -1,   1,  1,   -1,  1,
    ]), gl.STATIC_DRAW);

    // Dynamic polygon buffer (will be resized per-light)
    this.polyBuf = gl.createBuffer()!;

    // ── Shadow map FBO ──────────────────────────────────────────────────────
    // Prefer RGBA16F (half-float) so light intensities > 1.0 accumulate without
    // clamping, enabling HDR bright spots. Falls back to RGBA8 on WebGL1 or
    // when EXT_color_buffer_float is unavailable.
    const gl2       = gl as unknown as WebGL2RenderingContext;
    const canHDR    = gl2.RGBA16F != null && !!gl.getExtension('EXT_color_buffer_float');
    const internalFmt = canHDR ? gl2.RGBA16F   : gl.RGBA;
    const pixelType   = canHDR ? gl2.HALF_FLOAT : gl.UNSIGNED_BYTE;

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, width, height, 0, gl.RGBA, pixelType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowMap = {
      texture: tex,
      textureWrapper: { webGLTexture: tex, needsMipmapRegeneration: false },
      width,
      height,
    };

    // Depth+stencil renderbuffer.
    // WebGL 2 requires DEPTH24_STENCIL8; WebGL 1 uses DEPTH_STENCIL (with OES_packed_depth_stencil).
    const depthStencilFmt: number =
      (gl as unknown as WebGL2RenderingContext).DEPTH24_STENCIL8 ?? gl.DEPTH_STENCIL;
    this.depthStencilRbo = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencilRbo);
    gl.renderbufferStorage(gl.RENDERBUFFER, depthStencilFmt, width, height);

    // Assemble FBO
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.depthStencilRbo);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Shadow map FBO is incomplete');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Call once per frame before renderLight() calls.
  beginFrame(): void {
    const { gl, renderer } = this;
    // Unbind any active VAO before our raw vertex calls so we don't corrupt
    // Phaser's named VAO objects (gl.vertexAttribPointer writes into the
    // currently bound VAO in WebGL 2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (renderer as any).glWrapper.updateVAO({ vao: null });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.shadowMap.width, this.shadowMap.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // true additive accumulation
  }

  renderPointLight(light: LightSource, poly: Point[]): void {
    if (poly.length < 3) return;
    this.drawLightWithStencil(this.discProg, light, poly, (prog) => {
      const { gl } = this;
      const r = ((light.color >> 16) & 0xff) / 255;
      const g = ((light.color >>  8) & 0xff) / 255;
      const b = ( light.color        & 0xff) / 255;
      gl.uniform2f(prog.uLightPos, light.x, light.y);
      gl.uniform1f(prog.uRadius, light.radius);
      gl.uniform3f(prog.uLightColor, r, g, b);
      gl.uniform1f(prog.uIntensity, light.intensity ?? 1.0);
      gl.uniform2f(prog.uResolution, this.shadowMap.width, this.shadowMap.height);
    });
  }

  renderSpotLight(light: LightSource & { type: 'spot' }, poly: Point[]): void {
    if (poly.length < 3) return;
    const prog = this.spotProg;
    this.drawLightWithStencil(prog, light, poly, () => {
      const { gl } = this;
      const r = ((light.color >> 16) & 0xff) / 255;
      const g = ((light.color >>  8) & 0xff) / 255;
      const b = ( light.color        & 0xff) / 255;
      const dirX = Math.cos(light.angle);
      const dirY = Math.sin(light.angle);
      gl.uniform2f(prog.uLightPos, light.x, light.y);
      gl.uniform1f(prog.uRadius, light.radius);
      gl.uniform3f(prog.uLightColor, r, g, b);
      gl.uniform1f(prog.uIntensity, light.intensity ?? 1.0);
      gl.uniform2f(prog.uResolution, this.shadowMap.width, this.shadowMap.height);
      gl.uniform2f(prog.uLightDir, dirX, dirY);
      const halfInner = light.coneAngle / 2;
      const halfOuter = (light.coneAngle + (light.penumbraAngle ?? 0.1)) / 2;
      gl.uniform1f(prog.uCosInnerHalfCone, Math.cos(halfInner));
      gl.uniform1f(prog.uCosOuterHalfCone, Math.cos(halfOuter));
    });
  }

  // Point light rendered without visibility-polygon stencil.
  renderPointLightNoOcclusion(light: LightSource): void {
    const { gl } = this;
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);

    const prog = this.discProg;
    gl.useProgram(prog.program);

    const r = ((light.color >> 16) & 0xff) / 255;
    const g = ((light.color >>  8) & 0xff) / 255;
    const b = ( light.color        & 0xff) / 255;
    gl.uniform2f(prog.uLightPos,   light.x, light.y);
    gl.uniform1f(prog.uRadius,     light.radius);
    gl.uniform3f(prog.uLightColor, r, g, b);
    gl.uniform1f(prog.uIntensity,  light.intensity ?? 1.0);
    gl.uniform2f(prog.uResolution, this.shadowMap.width, this.shadowMap.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Spot light rendered without visibility-polygon stencil — used for lights
  // that are embedded inside an occluder (e.g. a wall-mounted lantern).
  // The GLSL cone math still clips the angular shape; only the polygon mask is skipped.
  renderSpotLightNoOcclusion(light: LightSource & { type: 'spot' }): void {
    const { gl } = this;
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);

    const prog = this.spotProg;
    gl.useProgram(prog.program);

    const r = ((light.color >> 16) & 0xff) / 255;
    const g = ((light.color >>  8) & 0xff) / 255;
    const b = ( light.color        & 0xff) / 255;
    gl.uniform2f(prog.uLightPos,    light.x, light.y);
    gl.uniform1f(prog.uRadius,      light.radius);
    gl.uniform3f(prog.uLightColor,  r, g, b);
    gl.uniform1f(prog.uIntensity,   light.intensity ?? 1.0);
    gl.uniform2f(prog.uResolution,  this.shadowMap.width, this.shadowMap.height);
    gl.uniform2f(prog.uLightDir, Math.cos(light.angle), Math.sin(light.angle));
    const halfInner = light.coneAngle / 2;
    const halfOuter = (light.coneAngle + (light.penumbraAngle ?? 0.1)) / 2;
    gl.uniform1f(prog.uCosInnerHalfCone, Math.cos(halfInner));
    gl.uniform1f(prog.uCosOuterHalfCone, Math.cos(halfOuter));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // Restore Phaser's WebGL state after all lights have been rendered.
  endFrame(): void {
    const { gl, renderer } = this;
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Phaser's default premultiplied
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, renderer.width, renderer.height);
    // Resync Phaser's program state cache to null so its next program.bind()
    // call always issues gl.useProgram() instead of skipping it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (renderer as any).glWrapper.updateBindingsProgram({ bindings: { program: null } });
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteProgram(this.discProg.program);
    gl.deleteProgram(this.spotProg.program);
    gl.deleteProgram(this.polyProg.program);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.polyBuf);
    gl.deleteTexture(this.shadowMap.texture);
    gl.deleteRenderbuffer(this.depthStencilRbo);
    gl.deleteFramebuffer(this.fbo);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private drawLightWithStencil(
    discProg: DiscProgram,
    light: LightSource,
    poly: Point[],
    setUniforms: (prog: DiscProgram) => void,
  ): void {
    const { gl } = this;
    const { width, height } = this.shadowMap;

    // When a light is off-screen its visibility polygon vertices all land on the
    // buildScreenBoundary segments (x = -1 / W+1, y = -1 / H+1), which map to NDC
    // ≈ ±1.001 — just outside the WebGL clip volume. The GPU discards every stencil
    // triangle, so the disc pass sees stencil=0 everywhere and produces no light,
    // even when the radius still reaches on-screen pixels. Off-screen lights can't
    // be occluded by on-screen buildings (no building extends past the viewport), so
    // dropping the stencil for these lights is both a correct and complete fix.
    if (light.x < 0 || light.x > width || light.y < 0 || light.y > height) {
      gl.disable(gl.STENCIL_TEST);
      gl.colorMask(true, true, true, true);
      gl.useProgram(discProg.program);
      setUniforms(discProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(discProg.aPosition);
      gl.vertexAttribPointer(discProg.aPosition, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }

    // ── Step 1: write polygon to stencil (no colour write) ─────────────────
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);

    gl.useProgram(this.polyProg.program);
    gl.uniform2f(this.polyProg.uResolution, width, height);

    // Fan-triangulate the polygon: (poly[0], poly[i], poly[i+1])
    const fanVerts: number[] = [];
    for (let i = 1; i < poly.length - 1; i++) {
      fanVerts.push(poly[0].x, poly[0].y);
      fanVerts.push(poly[i].x, poly[i].y);
      fanVerts.push(poly[i + 1].x, poly[i + 1].y);
    }
    const fanData = new Float32Array(fanVerts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.polyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, fanData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.polyProg.aPosition);
    gl.vertexAttribPointer(this.polyProg.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, fanData.length / 2);

    // ── Step 2: draw light disc where stencil == 1 ─────────────────────────
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0x00); // no further stencil writes

    gl.useProgram(discProg.program);
    setUniforms(discProg);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(discProg.aPosition);
    gl.vertexAttribPointer(discProg.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Clear stencil for the next light.
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.STENCIL_TEST);
  }
}
