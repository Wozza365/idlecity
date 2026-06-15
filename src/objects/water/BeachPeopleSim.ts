// ── Beach-person walk/sit pure logic ────────────────────────────────────────
// Position-clamp/direction-flip and phase/phaseTimer state-machine transitions
// extracted from WaterArea.updateBeachPeople() — pure mutations with no
// Phaser/scene dependency. WaterArea calls these per-person each tick, then
// applies the resulting state to the person's sprites.

/** Subset of WaterArea's `BeachPerson` fields these pure helpers read/write. */
export interface BeachPersonSimState {
  x: number;
  dir: 1 | -1;
  xMin: number;
  xMax: number;
  speed: number;
  phase: 'walk' | 'sit';
  phaseTimer: number;
}

/** Walks `p` toward `xMax`/`xMin`, clamping and reversing `dir` at the bounds. */
export function advanceBeachPersonPosition(p: BeachPersonSimState, dt: number): void {
  p.x += p.speed * p.dir * dt;
  if (p.x <= p.xMin) { p.x = p.xMin; p.dir = 1; }
  if (p.x >= p.xMax) { p.x = p.xMax; p.dir = -1; }
}

/**
 * Counts down `p.phaseTimer` and flips `p.phase` between 'walk' and 'sit'
 * when it expires, re-arming the timer (and, on the sit→walk transition,
 * randomizing `p.dir`). Returns true if a phase transition occurred this tick.
 */
export function advanceBeachPersonPhase(p: BeachPersonSimState, delta: number): boolean {
  p.phaseTimer -= delta;
  if (p.phaseTimer > 0) return false;

  if (p.phase === 'walk') {
    p.phase = 'sit';
    p.phaseTimer = 7000 + Math.random() * 12000;
  } else {
    p.phase = 'walk';
    p.phaseTimer = 3000 + Math.random() * 7000;
    p.dir = Math.random() < 0.5 ? 1 : -1;
  }
  return true;
}
