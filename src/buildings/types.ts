export interface DoorEntrance {
  x: number;
  y: number;
}

export interface HasDoorEntrances {
  readonly doorEntrances: DoorEntrance[];
}

export function hasDoorEntrances(o: unknown): o is HasDoorEntrances {
  return o != null && Array.isArray((o as HasDoorEntrances).doorEntrances);
}

export interface HasShadowOverlay {
  setShadowAlpha(alpha: number): void;
}

export function hasShadowOverlay(o: unknown): o is HasShadowOverlay {
  return o != null && typeof (o as HasShadowOverlay).setShadowAlpha === 'function';
}

export interface HasSmokeUpdate {
  updateSmoke(t: number): void;
}

export function hasSmokeUpdate(o: unknown): o is HasSmokeUpdate {
  return o != null && typeof (o as HasSmokeUpdate).updateSmoke === 'function';
}

export interface HasFlagUpdate {
  updateFlag(): void;
}

export function hasFlagUpdate(o: unknown): o is HasFlagUpdate {
  return o != null && typeof (o as HasFlagUpdate).updateFlag === 'function';
}

// Shared shape for the various per-window state records used by building
// `drawWindowGlass()` implementations. Each variant only populates the fields
// it needs; the rest are left absent (optional) on this common type.
export interface WindowRect {
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  sashH?: number;
  halfWw?: number;
  upperDay?: number;
  lowerDay?: number;
  dayColor?: number;
  shop?: boolean;
  isTv?: boolean;
  flickerFreq?: number;
  tvColor?: number;
  asleep?: boolean;
  bright?: boolean;
  accent?: boolean;
}

// Smoke particle emitted from chimneys (Tier1House, TwoStoreyHouse).
export type SmokeParticle = {
  x: number; y: number; alpha: number; dx: number; fadeRate: number;
  radius: number; maxAlpha: number; color: number; growing: boolean;
};
