// Vite resolves these glob URLs at build time — works in dev and production.
// The path is relative to this file (src/objects/ → ../../assets/trees/).
const _treeUrlMap = import.meta.glob<string>(
  '../../assets/trees/*.png',
  { query: '?url', import: 'default', eager: true },
);

export function getTreeUrl(key: string): string {
  return _treeUrlMap[`../../assets/trees/${key}.png`] ?? '';
}

// Canopy "leaf cluster" and trunk textures, one of each per tree-size tier.
// Drawn in neutral grey/white tones so they can be recoloured at runtime via
// setTint() — canopies with the seasonally-lerped foliage colour, trunks with
// palette.treeTrunk.
export const TREE_KEYS: readonly string[] = [
  'canopy_small', 'canopy_medium', 'canopy_large',
  'trunk_small', 'trunk_medium', 'trunk_large',
];

// Canopy images are centred on the canopy point; trunks anchor at their
// base (bottom-centre) so they sit flush with the ground.
export const CANOPY_ORIGIN  = 0.5;
export const TRUNK_ORIGIN_X = 0.5;
export const TRUNK_ORIGIN_Y = 1;

// Radius the "small" canopy texture was drawn at — used to scale it down
// for the secondary foliage clusters on mature (level 14+) trees.
export const CANOPY_SMALL_R = 11;
