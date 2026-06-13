import type { ThemeDefinition } from '../ThemeTypes';
import { ClassicTheme } from './ClassicTheme';

export const THEMES: readonly ThemeDefinition[] = [ClassicTheme];

export function getTheme(index: number): ThemeDefinition {
  return THEMES[index] ?? THEMES[0];
}
