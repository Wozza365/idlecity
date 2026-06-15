// ── Time-of-day pure logic ──────────────────────────────────────────────────
// The "master clock" is a value from 0 to 240_000 representing real ms over a
// 24-game-hour cycle (240_000 ms real = 24 game hours — see GAME_HOUR_FACTOR
// in constants.ts). `timeOffsetMs` shifts that clock (used by dev-panel time
// controls). These pure helpers compute derived values from the clock +
// offset without any Phaser/scene dependency.

const DAY_MS = 240_000;

/**
 * Elapsed time within the 24-game-hour cycle, combining the raw master-clock
 * value with the current time offset.
 */
export function elapsedMs(masterClockValue: number, timeOffsetMs: number): number {
  return ((masterClockValue + timeOffsetMs) % DAY_MS + DAY_MS) % DAY_MS;
}

/**
 * Sun angle (radians) for a given elapsed-time value, taking into account the
 * seasonal sunrise/sunset shift via `c1` (the season system's seasonal
 * oscillator: +1 at summer solstice, -1 at winter solstice).
 *
 * Sunrise/sunset hours vary smoothly by season via the sinusoidal c1 oscillator.
 * Summer (c1=+1): sunrise 3am, sunset 9pm (18h daylight).
 * Winter (c1=-1): sunrise 6am, sunset 6pm (12h daylight).
 */
export function computeSunAngle(elapsedMs: number, c1: number): number {
  const sunriseHour = 4.5 - 1.5 * c1;   // 3.0 → 6.0
  const sunsetHour  = 19.5 + 1.5 * c1;  // 21.0 → 18.0
  const afterHours  = sunsetHour - 12;
  const mornHours   = 12 - sunriseHour;
  const nightHours  = 24 - (sunsetHour - sunriseHour);
  const NC          = 0.667; // night compression — keeps night visually fast
  const msPerDayHr  = DAY_MS / (afterHours + mornHours + NC * nightHours);
  const SUNSET      = afterHours * msPerDayHr;
  const SUNRISE     = SUNSET + nightHours * msPerDayHr * NC;

  if (elapsedMs < SUNSET) {
    // Noon→sunset: sunAngle π/2 → π
    return Math.PI / 2 + (elapsedMs / SUNSET) * (Math.PI / 2);
  } else if (elapsedMs < SUNRISE) {
    // Sunset→sunrise (night): sunAngle π → 2π (fast)
    return Math.PI + ((elapsedMs - SUNSET) / (SUNRISE - SUNSET)) * Math.PI;
  } else {
    // Sunrise→noon: sunAngle 2π → 5π/2
    return 2 * Math.PI + ((elapsedMs - SUNRISE) / (DAY_MS - SUNRISE)) * (Math.PI / 2);
  }
}

/** Formats the elapsed in-game time as `HH:MM`, where elapsed=0 corresponds to 12:00 (noon). */
export function gameTimeString(elapsedMs: number): string {
  const totalMins = (elapsedMs / DAY_MS) * 24 * 60;
  const hour = Math.floor(12 + totalMins / 60) % 24;
  const min  = Math.floor(totalMins) % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Advances the time offset by one game hour (240_000/24 ms), wrapping at DAY_MS. */
export function advanceTime(currentOffsetMs: number): number {
  return (currentOffsetMs + DAY_MS / 24) % DAY_MS;
}

/** Computes the new `timeOffsetMs` that makes the clock read midnight (elapsed = 120_000). */
export function setMidnight(masterClockValue: number): number {
  const MIDNIGHT_ELAPSED = 120_000;
  return ((MIDNIGHT_ELAPSED - masterClockValue) % DAY_MS + DAY_MS) % DAY_MS;
}
