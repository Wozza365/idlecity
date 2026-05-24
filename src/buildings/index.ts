import Phaser from 'phaser';
import { Tier1House } from './Tier1House';
import { Tier2Apartment } from './Tier2Apartment';
import { Tier3Office } from './Tier3Office';
import { Tier4Skyscraper } from './Tier4Skyscraper';

export { EmptyPlot } from './EmptyPlot';

export function createBuilding(
  scene: Phaser.Scene,
  x: number,
  plotWidth: number,
  groundY: number,
  level: number,
): Phaser.GameObjects.Container {
  if (level <= 15) return new Tier1House(scene, x, plotWidth, groundY, level);
  if (level <= 35) return new Tier2Apartment(scene, x, plotWidth, groundY, level);
  if (level <= 65) return new Tier3Office(scene, x, plotWidth, groundY, level);
  return new Tier4Skyscraper(scene, x, plotWidth, groundY, level);
}
