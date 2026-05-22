import { describe, it, expect, beforeEach } from 'vitest';
import { CityManager, type Building } from '../game/CityManager';

describe('CityManager', () => {
  let manager: CityManager;

  beforeEach(() => {
    manager = new CityManager();
  });

  describe('addBuilding', () => {
    it('adds a building to the city', () => {
      const building: Building = { id: '1', type: 'house', level: 1, income: 10 };
      manager.addBuilding(building);
      expect(manager.getBuildings()).toHaveLength(1);
    });

    it('returns a copy so internal state cannot be mutated externally', () => {
      manager.addBuilding({ id: '1', type: 'house', level: 1, income: 10 });
      manager.getBuildings().pop();
      expect(manager.getBuildings()).toHaveLength(1);
    });
  });

  describe('removeBuilding', () => {
    it('removes a building by id and returns true', () => {
      manager.addBuilding({ id: '1', type: 'house', level: 1, income: 10 });
      expect(manager.removeBuilding('1')).toBe(true);
      expect(manager.getBuildings()).toHaveLength(0);
    });

    it('returns false when building is not found', () => {
      expect(manager.removeBuilding('nonexistent')).toBe(false);
    });
  });

  describe('calculateIncome', () => {
    it('returns 0 with no buildings', () => {
      expect(manager.calculateIncome()).toBe(0);
    });

    it('sums income across all buildings', () => {
      manager.addBuilding({ id: '1', type: 'house', level: 1, income: 10 });
      manager.addBuilding({ id: '2', type: 'shop', level: 1, income: 25 });
      expect(manager.calculateIncome()).toBe(35);
    });
  });

  describe('tick', () => {
    it('accumulates gold based on income each tick', () => {
      manager.addBuilding({ id: '1', type: 'house', level: 1, income: 10 });
      manager.tick();
      expect(manager.getGold()).toBe(10);
      manager.tick();
      expect(manager.getGold()).toBe(20);
    });

    it('starts with zero gold', () => {
      expect(manager.getGold()).toBe(0);
    });
  });
});
