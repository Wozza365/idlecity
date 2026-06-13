import type { ThemeDefinition } from '../ThemeTypes';
import { classicBuildingPalettes } from './classicBuildingPalettes';

export const ClassicTheme: ThemeDefinition = {
  id: 0,
  name: 'Classic',
  emoji: '🏙️',

  palette: {
    sky: {
      night:      [0x04040f, 0x08082a],
      preDawn:    [0x160c2a, 0x3a100a],
      sunrise:    [0x1e3878, 0xc85c14],
      goldenHour: [0x4466aa, 0xff9933],
      morning:    [0x2255aa, 0x78aac8],
      day:        [0x2a6aa0, 0x6aaad0],
    },

    road: {
      dirtBase:     0x6b4c2a,
      dirtSpecks:   [0x9a7050, 0xb48860, 0x7a5530, 0xc89060, 0x4a3018, 0x8a6040, 0xd4a870],
      cobbleBase:   0x7c7260,
      cobbleTracks: 0x585048,
      cobbleChips:  [0xa89880, 0xc4b8a8, 0x666058, 0xd8ccbc, 0x484440, 0x908070],
      asphalt:      0x333333,
      asphaltLines: 0xffffff,
      divider:      0x888888,
      highway:      0x222222,
      highwayLines: 0xffd700,
    },

    verge: {
      grassBase:     0x4a8c3a,
      grassAlt:      0x3d7a2e,
      dirtBase:      0x7a5a35,
      treeTrunk:     0x5c3a1e,
      treeCanopy:    [0x1e4a1a, 0x336622, 0x4a8c32, 0x66cc44, 0x152808, 0x234e10, 0x347020, 0x4ea030],
      flowerColors:  [
        0xff1155, 0xff4488, 0xff77aa, 0x00ccff, 0x33bbff, 0x0099ff, 0xffcc00, 0xffaa00,
        0xffee22, 0x00ffcc, 0x00ddbb, 0x44ffdd, 0xff5500, 0xff7700, 0xff9922, 0x88ff00,
        0xaaff33, 0x66ee00, 0xff00bb, 0xff33cc, 0xff66dd, 0xaa33ff, 0xcc66ff, 0x8811ee,
      ],
      benchWood:     0xc8a46e,
      benchMetal:    0x4a4a4a,
      pavingBase:    0xbcb0a0,
      pavingLine:    0x706050,
      cyclePathBase: 0xb22820,
      bollardColor:  0x111111,
      cyclistColors: [0x4ecdc4, 0xff6b6b, 0x95e77e, 0xffd93d, 0xc77dff, 0xff9f43],
    },

    water: {
      waterTop:  0x1A5C9E,
      waterBot:  0x3AA0DC,
      sand:      0xD4B483,
      sandWet:   0xB8946A,
      rockBase:  0x5A5A5A,
      rockMid:   0x6E6E6E,
      rockLight: 0x888888,
      rockWet:   0x474D55,
      mossGreen: 0x6E8B3D,
      mossDark:  0x4F6B2A,
      dockWood:  0xA0784A,
      pierWood:  0xB8884E,
      pedColors:   [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff, 0xff9f43, 0x00d2d3, 0xff6bcd],
      towelColors: [0xE63946, 0x4CC9F0, 0xF4D35E, 0x3A86FF, 0xFFB347, 0xFF6BBA, 0x06D6A0, 0xB5838D],
    },

    building: classicBuildingPalettes,
  },

  params: {
    carSpeedMultiplier: 1,
    pedestrianSpeedMultiplier: 1,
    ambientLightColor: 0x888888,
    lampColor: 0xffcc66,
    windowGlowColor: 0xffaa44,
  },
};
