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
