export interface SeasonSaveState {
  gameDayCount: number;
  lastSaveTimestamp: number;
  weatherType: 'clear' | 'rain' | 'snow';
  weatherIntensity: number;
  weatherEndMs: number;
  nextWeatherMs: number;
}

export class SeasonSystem {
  gameDayCount: number;
  private dayElapsedMs: number = 0;

  weatherType: 'clear' | 'rain' | 'snow' = 'clear';
  weatherIntensity: number = 0;
  private weatherEndMs: number = 0;
  private nextWeatherMs: number = 0;
  private weatherRising: boolean = false;

  private static readonly DAY_MS = 240_000;
  private static readonly HOUR_MS = 10_000;   // 1 game hour = 10 000 ms clock time
  private static readonly FADE_MS = 10_000;   // 10s to ramp intensity up or down
  private static readonly MAX_CATCHUP_DAYS = 40;

  constructor(saved?: Partial<SeasonSaveState>) {
    if (saved && typeof saved.gameDayCount === 'number') {
      this.gameDayCount = saved.gameDayCount;
      this.weatherType = (saved.weatherType as SeasonSystem['weatherType']) ?? 'clear';
      this.weatherIntensity = saved.weatherIntensity ?? 0;
      this.weatherEndMs = saved.weatherEndMs ?? 0;
      this.nextWeatherMs = saved.nextWeatherMs ?? 0;

      // Advance gameDayCount by real elapsed time since last save
      if (typeof saved.lastSaveTimestamp === 'number' && saved.lastSaveTimestamp > 0) {
        const elapsedReal = Date.now() - saved.lastSaveTimestamp;
        const elapsedDays = Math.floor(elapsedReal / SeasonSystem.DAY_MS);
        this.gameDayCount += Math.min(elapsedDays, SeasonSystem.MAX_CATCHUP_DAYS);
      }
    } else {
      this.gameDayCount = SeasonSystem.defaultStartDay();
    }
    this.weatherRising = this.weatherType !== 'clear' && this.weatherIntensity < 1;
  }

  // ── Oscillators ───────────────────────────────────────────────────────────

  get yearProgress(): number { return (this.gameDayCount % 40) / 40; }

  /** +1.0 at summer solstice, −1.0 at winter solstice */
  get c1(): number { return Math.cos(2 * Math.PI * this.yearProgress); }

  /** +1.0 at peak autumn, −1.0 at peak spring */
  get s1(): number { return Math.sin(2 * Math.PI * this.yearProgress); }

  get summerWeight(): number { return Math.max(0,  this.c1); }
  get autumnWeight():  number { return Math.max(0,  this.s1); }
  get winterWeight(): number { return Math.max(0, -this.c1); }
  get springWeight(): number { return Math.max(0, -this.s1); }

  /** Human-readable label — only for dev panel display, never used as a branch condition */
  get seasonLabel(): string {
    return ['Summer', 'Autumn', 'Winter', 'Spring'][Math.floor(this.gameDayCount / 10) % 4];
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(delta: number): void {
    this.dayElapsedMs += delta;
    if (this.dayElapsedMs >= SeasonSystem.DAY_MS) {
      this.dayElapsedMs -= SeasonSystem.DAY_MS;
      this.gameDayCount++;
    }

    this.tickWeather(delta);
  }

  private tickWeather(delta: number): void {
    const clockMs = this.gameDayCount * SeasonSystem.DAY_MS + this.dayElapsedMs;

    if (this.weatherType === 'clear') {
      // Decay intensity to 0
      this.weatherIntensity = Math.max(0, this.weatherIntensity - delta / SeasonSystem.FADE_MS);

      if (clockMs >= this.nextWeatherMs) {
        this.maybeStartEvent(clockMs);
      }
    } else {
      // Active event — ramp intensity up or down
      if (clockMs >= this.weatherEndMs) {
        this.weatherType = 'clear';
        this.weatherRising = false;
        this.scheduleNextEvent(clockMs);
      } else if (this.weatherRising) {
        this.weatherIntensity = Math.min(1, this.weatherIntensity + delta / SeasonSystem.FADE_MS);
        if (this.weatherIntensity >= 1) this.weatherRising = false;
      }
    }
  }

  private maybeStartEvent(clockMs: number): void {
    // Per-tick probability — evaluated ~once per game hour worth of ticks
    // eventChance = probability per game-hour; convert to per-tick via HOUR_MS
    const eventChance = 0.05
      + 0.60 * this.winterWeight
      + 0.35 * this.springWeight
      + 0.25 * this.autumnWeight;

    // Roll once per game hour on average
    const tickRoll = Math.random() * (SeasonSystem.HOUR_MS / 16); // ~16ms tick
    if (tickRoll >= eventChance) return;

    // Decide type: snow only possible in winter, probability proportional
    const snowRatio = this.winterWeight * 0.70;
    this.weatherType = Math.random() < snowRatio ? 'snow' : 'rain';
    this.weatherRising = true;
    this.weatherIntensity = 0;

    const minDur = (0.5 + 0.5 * this.winterWeight) * SeasonSystem.HOUR_MS;
    const maxDur = (4   + 20  * this.winterWeight) * SeasonSystem.HOUR_MS;
    const dur = minDur + Math.random() * (maxDur - minDur);
    this.weatherEndMs = clockMs + dur;
  }

  private scheduleNextEvent(clockMs: number): void {
    const minBreak = (1 + 1 * this.summerWeight) * SeasonSystem.HOUR_MS;
    const maxBreak = (6 + 18 * this.summerWeight) * SeasonSystem.HOUR_MS;
    this.nextWeatherMs = clockMs + minBreak + Math.random() * (maxBreak - minBreak);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  toSaveState(): SeasonSaveState {
    return {
      gameDayCount: this.gameDayCount,
      lastSaveTimestamp: Date.now(),
      weatherType: this.weatherType,
      weatherIntensity: this.weatherIntensity,
      weatherEndMs: this.weatherEndMs,
      nextWeatherMs: this.nextWeatherMs,
    };
  }

  // ── Moon phase ────────────────────────────────────────────────────────────

  /** 0 = full moon, 0.5 = new moon, 1 = full moon — 12-day cycle */
  get moonPhase(): number { return (this.gameDayCount % 12) / 12; }

  // ── First-launch season detection ─────────────────────────────────────────

  private static defaultStartDay(): number {
    const month = new Date().getMonth(); // 0=Jan … 11=Dec
    // 0–9 = Summer, 10–19 = Autumn, 20–29 = Winter, 30–39 = Spring
    if (month >= 5 && month <= 7)  return 0;   // Jun–Aug → Summer
    if (month >= 8 && month <= 10) return 10;  // Sep–Nov → Autumn
    if (month === 11 || month <= 1) return 20; // Dec–Feb → Winter
    return 30;                                  // Mar–May → Spring
  }
}
