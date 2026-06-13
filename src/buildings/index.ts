import Phaser from 'phaser';
import { Tier1House } from './Tier1House';
import { TwoStoreyHouse } from './TwoStoreyHouse';
import { Townhouse } from './Townhouse';
import { SmallApartment } from './SmallApartment';
import { LargeApartment } from './LargeApartment';
import { OfficeBlock } from './OfficeBlock';
import { Tier4Skyscraper } from './Tier4Skyscraper';
import type { BuildingPalettes, ThemeParams } from '../theme/ThemeTypes';

export { EmptyPlot } from './EmptyPlot';

export function createBuilding(
  scene: Phaser.Scene,
  x: number,
  plotWidth: number,
  groundY: number,
  level: number,
  palettes: BuildingPalettes,
  params: ThemeParams,
  savedParticles?: object[],
): Phaser.GameObjects.Container {
  if (level <= 15) return new Tier1House(scene, x, plotWidth, groundY, level, palettes.tier1, params, savedParticles as never);
  if (level <= 25) return new TwoStoreyHouse(scene, x, plotWidth, groundY, level, palettes.twoStorey, params, savedParticles as never);
  if (level <= 40) return new Townhouse(scene, x, plotWidth, groundY, level, palettes.townhouse, params);
  if (level <= 55) return new SmallApartment(scene, x, plotWidth, groundY, level, palettes.smallApartment, params);
  if (level <= 70) return new LargeApartment(scene, x, plotWidth, groundY, level, palettes.largeApartment, params);
  if (level <= 85) return new OfficeBlock(scene, x, plotWidth, groundY, level, palettes.officeBlock, params);
  return new Tier4Skyscraper(scene, x, plotWidth, groundY, level, palettes.tier4Skyscraper, params);
}
