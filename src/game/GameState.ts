const SAVE_KEY = 'idlecity-save';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PlotState {
  id: number;
  unlocked: boolean;
  level: number; // 1–100 when unlocked; 0 when locked
}

/** All persistent game data lives here. */
export interface GameState {
  gold: number;
  plots: PlotState[];
}

// ── Default state ──────────────────────────────────────────────────────────────

export function defaultState(plotCount: number): GameState {
  return {
    gold: 0,
    plots: Array.from({ length: plotCount }, (_, i) => ({
      id: i,
      unlocked: i === 0,
      level: i === 0 ? 1 : 0,
    })),
  };
}

// ── Persistence ────────────────────────────────────────────────────────────────

export function saveGame(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

/**
 * Loads state from localStorage. Returns the default if nothing is saved,
 * the data is unreadable, or the plot count has changed.
 */
export function loadGame(plotCount: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState(plotCount);

    const parsed = JSON.parse(raw) as Partial<GameState>;

    if (
      typeof parsed.gold === 'number' &&
      Array.isArray(parsed.plots) &&
      parsed.plots.length === plotCount
    ) {
      return parsed as GameState;
    }
  } catch {
    // Corrupt or incompatible save — fall through to default
  }

  return defaultState(plotCount);
}
