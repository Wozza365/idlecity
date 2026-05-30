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
