export interface Building {
  id: string;
  type: string;
  level: number;
  income: number;
}

export class CityManager {
  private buildings: Building[] = [];
  private gold: number = 0;

  addBuilding(building: Building): void {
    this.buildings.push(building);
  }

  removeBuilding(id: string): boolean {
    const index = this.buildings.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.buildings.splice(index, 1);
    return true;
  }

  getBuildings(): Building[] {
    return [...this.buildings];
  }

  calculateIncome(): number {
    return this.buildings.reduce((total, b) => total + b.income, 0);
  }

  tick(): void {
    this.gold += this.calculateIncome();
  }

  getGold(): number {
    return this.gold;
  }
}
