import type { BuildingPalettes } from '../ThemeTypes';

// ── Classic building palettes ──────────────────────────────────────────────
// Every value below is a 1:1 extraction of the hex literal that each tier's
// renderer (src/buildings/*.ts) used to hardcode for that semantic slot —
// this is the Classic theme's data, so rendering with these values produces
// pixel-identical output to the pre-refactor code.
//
// Slots a given tier's renderer doesn't read are filled with a harmless
// placeholder value (marked `// unused by Classic`) so every tier conforms
// to the full BuildingPalette shape.
export const classicBuildingPalettes: BuildingPalettes = {
  // ── Tier 1: starter house ───────────────────────────────────────────────
  tier1: {
    wall:               0xfdf7ed,
    wallShade:          0xfdf7ed, // unused by Classic
    roof:               0xb04030,
    roofShade:          0xb04030, // unused by Classic
    foundation:         0x9e9890,
    trim:               0xf0e4cc,
    door:               0xb02e1e,
    doorAccent:         0xc84030,
    windowFrame:        0xffffff,
    windowGlassDay:     0x8ab4cc,
    windowGlassDayAlt:  0x9ec2d8,
    chimney:            0x9a3e2e,
    yardGround:         0x5a8c3a,
    yardAccent:         0x4a7a2e,
    fence:              0xe8e4d8,
    glass:              0x8ab4cc, // unused by Classic
    glassShade:         0x0c1e2e, // unused by Classic
    accents:            [0xe83030, 0xffcc00, 0xff88aa],
  },

  // ── Two-storey house ─────────────────────────────────────────────────────
  twoStorey: {
    wall:               0xf2ead8,
    wallShade:          0xf2ead8, // unused by Classic
    roof:               0xa03828,
    roofShade:          0xa03828, // unused by Classic
    foundation:         0x9e9890,
    trim:               0xf0e4cc,
    door:               0x8a2010,
    doorAccent:         0xa02818,
    windowFrame:        0xffffff,
    windowGlassDay:     0x8ab4cc,
    windowGlassDayAlt:  0x9ec2d8,
    chimney:            0x9a3e2e,
    yardGround:         0x5a8c3a,
    yardAccent:         0x4a7a2e,
    fence:              0xe8e4d8,
    glass:              0x8ab4cc, // unused by Classic
    glassShade:         0x0c1e2e, // unused by Classic
    accents:            [],
  },

  // ── Townhouse ────────────────────────────────────────────────────────────
  townhouse: {
    wall:               0xb04030,
    wallShade:          0xb04030, // unused by Classic
    roof:               0x9a8870, // unused by Classic
    roofShade:          0x9a8870, // unused by Classic
    foundation:         0x9a8870,
    trim:               0xffffff, // unused by Classic
    door:               0x0a0a08,
    doorAccent:         0x1a1410,
    windowFrame:        0xffffff,
    windowGlassDay:     0x8ab4cc,
    windowGlassDayAlt:  0x8ab4cc, // unused by Classic
    chimney:            0x9a3e2e, // unused by Classic
    yardGround:         0xc8b898,
    yardAccent:         0xc8b898, // unused by Classic
    fence:              0xe8e4d8, // unused by Classic
    glass:              0x8ab4cc, // unused by Classic
    glassShade:         0x0c1e2e, // unused by Classic
    accents:            [],
  },

  // ── Small apartment ──────────────────────────────────────────────────────
  smallApartment: {
    wall:               0x8a3a28,
    wallShade:          0x8a3a28, // unused by Classic
    roof:               0x707868, // unused by Classic
    roofShade:          0x707868, // unused by Classic
    foundation:         0x707868,
    trim:               0xffffff, // unused by Classic
    door:               0x0a0a08, // unused by Classic
    doorAccent:         0x1a1410, // unused by Classic
    windowFrame:        0xffffff, // unused by Classic
    windowGlassDay:     0x4a8aaa,
    windowGlassDayAlt:  0x3a6888,
    chimney:            0x9a3e2e, // unused by Classic
    yardGround:         0xb8b0a0,
    yardAccent:         0xb8b0a0, // unused by Classic
    fence:              0xe8e4d8, // unused by Classic
    glass:              0x4a8aaa, // unused by Classic
    glassShade:         0x3a6888, // unused by Classic
    accents:            [],
  },

  // ── Large apartment / hotel ──────────────────────────────────────────────
  largeApartment: {
    wall:               0x3a5570,
    wallShade:          0x2d4055,
    roof:               0x3a5570, // unused by Classic
    roofShade:          0x2d4055, // unused by Classic
    foundation:         0x2a3040,
    trim:               0x90a8c0, // unused by Classic
    door:               0x0a1520,
    doorAccent:         0x2a4a62,
    windowFrame:        0xffffff, // unused by Classic
    windowGlassDay:     0x3a88c8, // unused by Classic
    windowGlassDayAlt:  0x3a88c8, // unused by Classic
    chimney:            0x2a3040, // unused by Classic
    yardGround:         0xb8b0a0,
    yardAccent:         0xb8b0a0, // unused by Classic
    fence:              0xe8e4d8, // unused by Classic
    glass:              0x3a88c8,
    glassShade:         0x0e141e,
    accents:            [],
  },

  // ── Office block ─────────────────────────────────────────────────────────
  officeBlock: {
    wall:               0x1e2e3e,
    wallShade:          0x243848,
    roof:               0x2a3a4a,
    roofShade:          0x2a3a4a, // unused by Classic
    foundation:         0x1e2e3e, // unused by Classic
    trim:               0x384858,
    door:               0x1e2e3e, // unused by Classic
    doorAccent:         0x384858, // unused by Classic
    windowFrame:        0xffffff, // unused by Classic
    windowGlassDay:     0x3a5a72, // unused by Classic
    windowGlassDayAlt:  0x1e3448, // unused by Classic
    chimney:            0x2a3a4a, // unused by Classic
    yardGround:         0xa8a090,
    yardAccent:         0xa8a090, // unused by Classic
    fence:              0x384858, // unused by Classic
    glass:              0x3a5a72,
    glassShade:         0x1e3448,
    accents:            [],
  },

  // ── Tier 4: skyscraper ───────────────────────────────────────────────────
  tier4Skyscraper: {
    wall:               0x0e1824,
    wallShade:          0x162030,
    roof:               0x1c2c3c,
    roofShade:          0x1c2c3c, // unused by Classic
    foundation:         0x0e1824, // unused by Classic
    trim:               0x1c2c3c, // unused by Classic
    door:               0x0e1824, // unused by Classic
    doorAccent:         0x162030, // unused by Classic
    windowFrame:        0xffffff, // unused by Classic
    windowGlassDay:     0x2c5880, // unused by Classic
    windowGlassDayAlt:  0x0e2030, // unused by Classic
    chimney:            0x1c2c3c, // unused by Classic
    yardGround:         0x989088,
    yardAccent:         0x989088, // unused by Classic
    fence:              0x1c2c3c, // unused by Classic
    glass:              0x2c5880,
    glassShade:         0x0e2030,
    accents:            [],
  },

  // ── Empty plot ───────────────────────────────────────────────────────────
  emptyPlot: {
    wall:               0x7a5228, // unused by Classic
    wallShade:          0x7a5228, // unused by Classic
    roof:               0x5c3c18, // unused by Classic
    roofShade:          0x5c3c18, // unused by Classic
    foundation:         0x7a5228, // unused by Classic
    trim:               0x5c3c18, // unused by Classic
    door:               0x7a5228, // unused by Classic
    doorAccent:         0x5c3c18, // unused by Classic
    windowFrame:        0xffffff, // unused by Classic
    windowGlassDay:     0x8ab4cc, // unused by Classic
    windowGlassDayAlt:  0x9ec2d8, // unused by Classic
    chimney:            0x5c3c18, // unused by Classic
    yardGround:         0x7a5228,
    yardAccent:         0x5c3c18,
    fence:              0x7a5228, // unused by Classic
    glass:              0x8ab4cc, // unused by Classic
    glassShade:         0x0c1e2e, // unused by Classic
    accents:            [],
  },
};
