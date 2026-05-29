// All GLSL source strings for the two-pass lighting system.
//
// Pass 1 — Shadow Map:
//   QUAD_VERT + LIGHT_DISC_FRAG  : fullscreen quad, per-pixel pow(1-d,2) falloff
//   QUAD_VERT + SPOT_DISC_FRAG   : same + smoothstep angular cone
//   POLY_VERT + POLY_FRAG        : visibility polygon drawn to stencil buffer
//
// Pass 2 — Composite:
//   COMPOSITE_FRAG               : scene.rgb * (ambient + shadowMap.rgb)
//
// Coordinate conventions
// ─────────────────────────────────────────────────────────────────────────────
// Phaser 4 framebuffer Y convention (documented in BaseFilterShader.js):
//   "gl_FragCoord.y = 0 = bottom of framebuffer = TOP of canvas"
//   → physical framebuffer y=0 corresponds to game y=0 (visual top).
//
// Therefore in the shadow-map FBO (and any FBO Phaser renders to):
//   UV (0, 0) = physical bottom = visual top  = game (0, 0)
//   UV (1, 1) = physical top    = visual bottom = game (W, H)
//
// This means vUV * uResolution == game pixel coords directly — no flip needed.
//
// The composite filter (BaseFilterShader) uses SimpleTexture-vert.js which
// assigns texcoord (0, 0) to NDC (-1, -1) = physical bottom = visual top.
// So outTexCoord also has y=0 at visual top, matching the shadow map UV.
// ─────────────────────────────────────────────────────────────────────────────

// ── Fullscreen quad vertex shader (used by light disc and spot disc) ──────────
// Covers the entire shadow-map framebuffer.  The varying vUV goes
//   (0,0) at physical bottom-left → (1,1) at physical top-right.
export const QUAD_VERT = /* glsl */`
attribute vec2 aPosition;
varying vec2 vUV;

void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// ── Visibility polygon vertex shader ─────────────────────────────────────────
// Receives polygon points in game pixel coordinates (y=0 at top).
// Maps to NDC so that game y=0 → NDC y=-1 (physical bottom = visual top).
export const POLY_VERT = /* glsl */`
attribute vec2 aPosition;
uniform vec2 uResolution;

void main() {
    vec2 ndc = vec2(
        (aPosition.x / uResolution.x) * 2.0 - 1.0,
        (aPosition.y / uResolution.y) * 2.0 - 1.0
    );
    gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

// ── Visibility polygon fragment shader (stencil-only draw) ───────────────────
export const POLY_FRAG = /* glsl */`
precision mediump float;
void main() {
    gl_FragColor = vec4(1.0);
}
`;

// ── Point-light disc fragment shader ─────────────────────────────────────────
// Per-pixel quadratic falloff: pow(max(0, 1 - dist/R), 2)
// This is the same curve used by pixi-lights and Unity 2D PointLight2D.
//
// Stencil test (set in ShadowMapRenderer) clips the fullscreen quad
// to the pre-computed visibility polygon, so no separate mask sample needed.
export const LIGHT_DISC_FRAG = /* glsl */`
precision mediump float;
varying vec2 vUV;

uniform vec2  uLightPos;    // game pixel coords (y=0 at top)
uniform float uRadius;      // pixels
uniform vec3  uLightColor;  // 0–1 per channel
uniform float uIntensity;
uniform vec2  uResolution;  // viewport width × height in pixels

void main() {
    // vUV * uResolution == game pixel position (y=0 at top) — see file header
    vec2  fragPos = vUV * uResolution;
    float dist    = length(fragPos - uLightPos) / uRadius;
    float falloff = pow(max(0.0, 1.0 - dist), 2.0);
    if (falloff < 0.002) discard;
    gl_FragColor  = vec4(uLightColor * falloff * uIntensity, falloff);
}
`;

// ── Spot-light disc fragment shader ──────────────────────────────────────────
// Same as LIGHT_DISC_FRAG plus a smoothstep angular cone term.
// The penumbra half-width is 0.05 radians (≈3°) either side of the cone edge.
export const SPOT_DISC_FRAG = /* glsl */`
precision mediump float;
varying vec2 vUV;

uniform vec2  uLightPos;
uniform float uRadius;
uniform vec3  uLightColor;
uniform float uIntensity;
uniform vec2  uResolution;
uniform vec2  uLightDir;     // normalised direction vector in game space
uniform float uCosHalfCone;  // cos(coneAngle / 2), pre-computed on CPU

void main() {
    vec2  fragPos  = vUV * uResolution;
    vec2  toFrag   = fragPos - uLightPos;
    float dist     = length(toFrag) / uRadius;
    float falloff  = pow(max(0.0, 1.0 - dist), 2.0);
    if (falloff < 0.002) discard;

    float cosAngle    = dot(normalize(toFrag), uLightDir);
    float coneFactor  = smoothstep(uCosHalfCone - 0.05, uCosHalfCone, cosAngle);
    falloff          *= coneFactor;
    if (falloff < 0.002) discard;

    gl_FragColor = vec4(uLightColor * falloff * uIntensity, falloff);
}
`;

// ── Composite fragment shader (BaseFilterShader, camera.filters.external) ────
// Inputs:
//   uMainSampler   – scene texture (auto-bound to slot 0 by Phaser)
//   uShadowSampler – shadow map accumulated in Pass 1 (bound to slot 1)
// Both textures share the same UV orientation: y=0 at visual top.
//
// Output: scene.rgb × clamp(ambient + lightMap.rgb, 0, 1.5)
// The 1.5 clamp allows slight overexposure (warm bloom) near bright lights.
export const COMPOSITE_FRAG = /* glsl */`
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uShadowSampler;
uniform vec3      uAmbientColor;
uniform float     uAmbientIntensity;

varying vec2 outTexCoord;

void main() {
    vec4 scene = texture2D(uMainSampler,  outTexCoord);
    vec4 lmap  = texture2D(uShadowSampler, outTexCoord);
    vec3 total = uAmbientColor * uAmbientIntensity + lmap.rgb;
    gl_FragColor = vec4(scene.rgb * clamp(total, 0.0, 1.5), scene.a);
}
`;
