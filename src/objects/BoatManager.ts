import Phaser from 'phaser';
import { ROAD_H, VERGE_H } from '../constants';
import { type LightSource } from '../lighting/LightingSystem';
import { Boat } from './Boat';
import { BOAT_DEFS, pickRandomBoat, type BoatDef } from './BoatAssets';

// Spawn interval bounds (ms) — decreases with level
const BASE_INTERVAL_MS = 69_000;
const MIN_INTERVAL_MS  = 12_500;
const DOCK_DURATION_MS = 7_000;
const DOCK_VARY_MS     = 5_000;

const WAKE_MAX_AGE    = 1.5;   // seconds before a wake point disappears
const WAKE_SPREAD     = 5;     // px spread per second of age (half-width of V)
const WAKE_SAMPLE_MS  = 45;    // how often to record a wake point (ms)

interface LightSystem {
  addLight(l: LightSource): void;
  removeLight(l: LightSource): void;
}

interface WakePoint { x: number; age: number; }
interface WakeTrail { points: WakePoint[]; y: number; sampleTimer: number; }

function spawnInterval(level: number): number {
  return Math.max(MIN_INTERVAL_MS, BASE_INTERVAL_MS / (1 + level * 0.55));
}

function maxBoats(level: number): number {
  return Math.min(2 + Math.floor(level * 0.85), 12);
}

export class BoatManager {
  private readonly scene: Phaser.Scene;
  private boats: Boat[] = [];
  private spawnTimer = 0;
  private waterLevel = 0;
  private sceneWidth = 0;
  private waterY = 0;
  private dockSlots: number[] = [];
  private occupiedSlots = new Set<number>();
  private lightSystem: LightSystem | null = null;
  private wakeGfx: Phaser.GameObjects.Graphics;
  private wakes = new Map<Boat, WakeTrail>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.wakeGfx = scene.add.graphics().setDepth(5.53);
  }

  rebuild(waterLevel: number, groundY: number): void {
    this.destroyBoats();
    this.waterLevel = waterLevel;
    this.sceneWidth = (this.scene.scale as Phaser.Scale.ScaleManager).width;
    this.waterY     = groundY + ROAD_H + VERGE_H;
    this.spawnTimer = spawnInterval(waterLevel) * 0.3;
  }

  setDockSlots(slots: number[]): void {
    this.dockSlots = [...slots];
  }

  attachLights(system: LightSystem): void {
    this.lightSystem = system;
    for (const boat of this.boats) {
      for (const l of boat.lights) system.addLight(l);
    }
  }

  detachLights(system: LightSystem): void {
    for (const boat of this.boats) {
      for (const l of boat.lights) system.removeLight(l);
    }
    if (this.lightSystem === system) this.lightSystem = null;
  }

  update(delta: number, elevation: number = 0): void {
    if (this.waterLevel === 0) {
      this.wakeGfx.clear();
      return;
    }

    // Move existing boats; remove off-screen ones
    const toRemove: number[] = [];
    for (let i = 0; i < this.boats.length; i++) {
      const done = this.boats[i].update(delta);
      if (done) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const boat = this.boats[toRemove[i]];
      if (this.lightSystem) {
        for (const l of boat.lights) this.lightSystem.removeLight(l);
      }
      const slotX = boat.assignedDockX;
      if (slotX !== null) this.occupiedSlots.delete(slotX);
      this.wakes.delete(boat);
      boat.destroy();
      this.boats.splice(toRemove[i], 1);
    }

    // Sample wake points for each active boat
    const dt = delta / 1000;
    for (const boat of this.boats) {
      let trail = this.wakes.get(boat);
      if (!trail) {
        trail = { points: [], y: boat.y, sampleTimer: 0 };
        this.wakes.set(boat, trail);
      }
      trail.sampleTimer -= delta;
      if (trail.sampleTimer <= 0) {
        trail.points.push({ x: boat.posX, age: 0 });
        trail.sampleTimer = WAKE_SAMPLE_MS;
      }
      // Age and cull
      for (let j = trail.points.length - 1; j >= 0; j--) {
        trail.points[j].age += dt;
        if (trail.points[j].age >= WAKE_MAX_AGE) trail.points.splice(j, 1);
      }
    }

    // Draw wakes
    this.wakeGfx.clear();
    for (const trail of this.wakes.values()) {
      for (const pt of trail.points) {
        const spread = pt.age * WAKE_SPREAD;
        const alpha  = (1 - pt.age / WAKE_MAX_AGE) * 0.28;
        if (alpha < 0.01 || spread < 0.5) continue;
        this.wakeGfx.fillStyle(0xaaddff, alpha);
        // Two side dots of the V — symmetric above and below boat y
        this.wakeGfx.fillRect(Math.round(pt.x), Math.round(trail.y - spread), 2, 1);
        this.wakeGfx.fillRect(Math.round(pt.x), Math.round(trail.y + spread), 2, 1);
      }
    }

    // Spawn new boats — fewer at night
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.boats.length < maxBoats(this.waterLevel)) {
      // Night multiplier: at full night boats are 3× less frequent
      const nightMult = 1 + 2 * Math.max(0, (0.15 - elevation) / 0.25);
      this.spawnTimer = spawnInterval(this.waterLevel) * nightMult * (0.7 + Math.random() * 0.6);
      this.spawnBoat();
    }
  }

  updateLighting(elevation: number): void {
    for (const boat of this.boats) boat.updateLighting(elevation);
  }

  forceSpawn(key: string): void {
    const def = BOAT_DEFS.find(d => d.key === key);
    if (def) this.spawnBoatDef(def, true);
  }

  private spawnBoat(): void {
    this.spawnBoatDef(pickRandomBoat());
  }

  private spawnBoatDef(def: BoatDef, force = false): void {
    // Single lane across the deep water, a fixed distance below the shoreline
    // (independent of WATER_H) so boats stay near the dock/pier even as the
    // water area extends further out to sea.
    const y = this.waterY + 75 + Math.random() * 12;

    // Don't spawn if another boat is too close to the left edge.
    // Force-spawns (from the dev panel) skip this check.
    if (!force) {
      const MIN_SEPARATION = 100 + def.w;
      if (this.boats.some(b => b.posX < MIN_SEPARATION)) {
        this.spawnTimer = 3000 + Math.random() * 2000;
        return;
      }
    }

    let dockX: number | null = null;
    if (def.canDock && this.dockSlots.length > 0) {
      const freeDock = this.dockSlots.find(s => !this.occupiedSlots.has(s));
      if (freeDock !== undefined && Math.random() < 0.45) {
        dockX = freeDock;
        this.occupiedSlots.add(freeDock);
      }
    }

    const spawnX = force ? this.sceneWidth / 2 : -def.w / 2 - 10;
    const dockDuration = DOCK_DURATION_MS + Math.random() * DOCK_VARY_MS;
    const boat = new Boat(this.scene, {
      def, x: spawnX, y,
      sceneWidth: this.sceneWidth,
      dockX, dockDuration,
    });

    if (this.lightSystem) {
      for (const l of boat.lights) this.lightSystem.addLight(l);
    }

    this.boats.push(boat);
  }

  private destroyBoats(): void {
    for (const b of this.boats) {
      if (this.lightSystem) {
        for (const l of b.lights) this.lightSystem.removeLight(l);
      }
      b.destroy();
    }
    this.boats = [];
    this.wakes.clear();
    this.occupiedSlots.clear();
    this.wakeGfx.clear();
  }

  destroy(): void {
    this.destroyBoats();
    this.wakeGfx.destroy();
  }
}
