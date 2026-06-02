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
// Phaser 4 uses ortho(0, width, height, 0) for its projection matrix (flipY=false).
// This maps: game y=0 (visual top) → NDC y=+1 (physical top) → texture UV y=1
//            game y=H (visual bottom) → NDC y=-1 (physical bottom) → texture UV y=0
//
// Scene texture UV convention: UV (0,0) = physical bottom = game y=H (visual bottom)
//                              UV (1,1) = physical top    = game y=0 (visual top)
//
// The composite filter's outTexCoord follows the same convention:
//   outTexCoord.y=0 = visual bottom (where the UI panel is)
//   outTexCoord.y=1 = visual top
//
// The shadow-map FBO uses the SAME convention by mapping:
//   POLY_VERT: game y=0 → NDC y=+1 (physical top) → UV y=1
//              game y=H → NDC y=-1 (physical bottom) → UV y=0
//
// fragPos in LIGHT_DISC_FRAG/SPOT_DISC_FRAG is derived as:
//   fragPos.x = vUV.x * W
//   fragPos.y = (1 - vUV.y) * H   ← inverts UV y back to game y (y=0 at top)
//
// This means both the scene and shadow map share the same UV y direction,
// so the composite can sample uShadowSampler with plain outTexCoord (no flip).
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
// Maps to NDC matching Phaser's projection: game y=0 → NDC y=+1 (physical top).
export const POLY_VERT = /* glsl */`
attribute vec2 aPosition;
uniform vec2 uResolution;

void main() {
    vec2 ndc = vec2(
        (aPosition.x / uResolution.x) * 2.0 - 1.0,
        1.0 - (aPosition.y / uResolution.y) * 2.0
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
    // vUV.y=0 at physical bottom (game bottom); invert to get game y (y=0 at top)
    vec2  fragPos = vec2(vUV.x * uResolution.x, (1.0 - vUV.y) * uResolution.y);
    float dist    = length(fragPos - uLightPos) / uRadius;
    float falloff = pow(max(0.0, 1.0 - dist), 2.0);
    if (falloff < 0.002) discard;
    gl_FragColor  = vec4(uLightColor * falloff * uIntensity, falloff);
}
`;

// ── Spot-light disc fragment shader ──────────────────────────────────────────
// Same as LIGHT_DISC_FRAG plus a smoothstep angular cone term.
// uCosInnerHalfCone: cos of the full-brightness boundary (inner edge).
// uCosOuterHalfCone: cos of the zero-brightness boundary (outer penumbra edge).
// smoothstep returns 0 at the outer edge and 1 at the inner because cosine
// decreases as angle increases, so outer cos < inner cos.
export const SPOT_DISC_FRAG = /* glsl */`
precision mediump float;
varying vec2 vUV;

uniform vec2  uLightPos;
uniform float uRadius;
uniform vec3  uLightColor;
uniform float uIntensity;
uniform vec2  uResolution;
uniform vec2  uLightDir;          // normalised direction vector in game space
uniform float uCosInnerHalfCone;  // cos(innerConeAngle / 2) — full brightness
uniform float uCosOuterHalfCone;  // cos(outerConeAngle / 2) — penumbra edge

void main() {
    vec2  fragPos  = vec2(vUV.x * uResolution.x, (1.0 - vUV.y) * uResolution.y);
    vec2  toFrag   = fragPos - uLightPos;
    float dist     = length(toFrag) / uRadius;
    float falloff  = pow(max(0.0, 1.0 - dist), 2.0);
    if (falloff < 0.002) discard;

    float cosAngle   = dot(normalize(toFrag), uLightDir);
    float coneFactor = smoothstep(uCosOuterHalfCone, uCosInnerHalfCone, cosAngle);
    falloff         *= coneFactor;
    if (falloff < 0.002) discard;

    gl_FragColor = vec4(uLightColor * falloff * uIntensity, falloff);
}
`;

// ── Composite fragment shader (BaseFilterShader, camera.filters.external) ────
// Inputs:
//   uMainSampler   – scene texture (auto-bound to slot 0 by Phaser)
//   uShadowSampler – shadow map accumulated in Pass 1 (bound to slot 1)
// Both textures share the same UV orientation (y=0 at visual bottom, matching Phaser).
//
// Output: scene.rgb × clamp(ambient + lightMap.rgb, 0, 1.5)
// The 1.5 clamp allows slight overexposure (warm bloom) near bright lights.
// uGameFraction = gameH / screenH.  Pixels with outTexCoord.y < (1 - uGameFraction)
// are in the UI panel — pass them through unmodified so the UI is never
// darkened by the night ambient multiply.
export const COMPOSITE_FRAG = /* glsl */`
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D uShadowSampler;
uniform vec3      uAmbientColor;
uniform float     uAmbientIntensity;
uniform float     uGameFraction;
uniform float     uTopFraction;

varying vec2 outTexCoord;

void main() {
    vec4 scene = texture2D(uMainSampler, outTexCoord);
    if (outTexCoord.y < (1.0 - uGameFraction) || outTexCoord.y > (1.0 - uTopFraction)) {
        gl_FragColor = scene;
        return;
    }
    // Shadow map shares the same UV convention as the scene texture — no flip needed.
    vec4 lmap  = texture2D(uShadowSampler, outTexCoord);
    // Ambient uses actual scene colour (dark surfaces stay dark without lights).
    // Light map uses a minimum reflectance floor so spotlights are visible even
    // on near-black surfaces like road asphalt or dark sign backgrounds.
    vec3 ambient = scene.rgb * uAmbientColor * uAmbientIntensity;
    vec3 lit     = max(scene.rgb, vec3(0.2)) * lmap.rgb;
    gl_FragColor = vec4(clamp(ambient + lit, 0.0, 1.5), scene.a);
}
`;

// ── Tree-mask eraser fragment shader ─────────────────────────────────────────
// Writes vec4(0) to zero out accumulated light at tree canopy positions,
// so trees are only affected by ambient, not dynamic point/spot lights.
export const MASK_FRAG = /* glsl */`
precision mediump float;
void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
}
`;
