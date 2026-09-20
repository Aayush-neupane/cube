export interface Algo {
  id: string;
  name: string;
  group: 'OLL' | 'PLL' | 'F2L';
  notation: string;
  moves: string[];
  description: string;
}

export const ALGORITHMS: Algo[] = [
  // OLL — a small curated set (beginner-friendly + common)
  { id: 'oll-27', name: 'OLL 27 — Sune', group: 'OLL', notation: "R U R' U R U2 R'", moves: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"], description: 'Orient last layer, single fish.' },
  { id: 'oll-26', name: 'OLL 26 — Anti-Sune', group: 'OLL', notation: "R U2 R' U' R U' R'", moves: ['R', 'U2', "R'", "U'", 'R', "U'", "R'"], description: 'Mirror of Sune.' },
  { id: 'oll-21', name: 'OLL 21 — H', group: 'OLL', notation: "R U R' U R U' R' U R U2 R'", moves: ['R', 'U', "R'", 'U', 'R', "U'", "R'", 'U', 'R', 'U2', "R'"], description: 'Double Sune, H pattern.' },
  { id: 'oll-22', name: 'OLL 22 — Pi', group: 'OLL', notation: "R U2 R2 U' R2 U' R2 U2 R", moves: ['R', 'U2', 'R2', "U'", 'R2', "U'", 'R2', 'U2', 'R'], description: 'Pi / wheelchair shape.' },
  { id: 'oll-23', name: 'OLL 23 — Headlights', group: 'OLL', notation: "R2 D R' U2 R D' R' U2 R'", moves: ['R2', 'D', "R'", 'U2', 'R', "D'", "R'", 'U2', "R'"], description: 'Sune-variant with D moves.' },
  { id: 'oll-cross', name: 'OLL — Cross', group: 'OLL', notation: "F R U R' U' F'", moves: ['F', 'R', 'U', "R'", "U'", "F'"], description: 'Make the yellow cross.' },
  // PLL
  { id: 'pll-ua', name: 'PLL Ua', group: 'PLL', notation: "R U' R U R U R U' R' U' R2", moves: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'], description: '3-cycle edges, clockwise.' },
  { id: 'pll-ub', name: 'PLL Ub', group: 'PLL', notation: "R2 U R U R' U' R' U' R' U R'", moves: ['R2', 'U', 'R', 'U', "R'", "U'", "R'", "U'", "R'", 'U', "R'"], description: '3-cycle edges, counter-clockwise.' },
  { id: 'pll-h', name: 'PLL H', group: 'PLL', notation: "M2 U M2 U2 M2 U M2", moves: ['M2', 'U', 'M2', 'U2', 'M2', 'U', 'M2'], description: 'Swap opposite edges. (M2 = L2 R2 + center — practice as R2 L2 pattern on trainer)' },
  { id: 'pll-z', name: 'PLL Z', group: 'PLL', notation: "M2 U M2 U M' U2 M2 U2 M'", moves: ['M2', 'U', 'M2', 'U', "M'", 'U2', 'M2', 'U2', "M'"], description: 'Swap adjacent edges.' },
  { id: 'pll-aa', name: 'PLL Aa', group: 'PLL', notation: "R' F R' B2 R F' R' B2 R2", moves: ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'], description: '3-cycle corners.' },
  { id: 'pll-t', name: 'PLL T', group: 'PLL', notation: "R U R' U' R' F R2 U' R' U' R U R' F'", moves: ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"], description: 'Adjacent corner + edge swap.' },
  // F2L
  { id: 'f2l-basic-1', name: 'F2L — Basic insert', group: 'F2L', notation: "U R U' R'", moves: ['U', 'R', "U'", "R'"], description: 'White corner up, pair and insert.' },
  { id: 'f2l-basic-2', name: 'F2L — Left insert', group: 'F2L', notation: "U' L' U L", moves: ["U'", "L'", 'U', 'L'], description: 'Mirror of basic insert.' },
  { id: 'f2l-pair', name: 'F2L — Split pair', group: 'F2L', notation: "R U R' U' R U R'", moves: ['R', 'U', "R'", "U'", 'R', 'U', "R'"], description: 'Separate and re-pair.' },
  { id: 'f2l-sledge', name: 'F2L — Sledgehammer', group: 'F2L', notation: "R' F R F'", moves: ["R'", 'F', 'R', "F'"], description: 'Sledgehammer insertion.' },
  { id: 'f2l-hide', name: 'F2L — Hide & pair', group: 'F2L', notation: "U' R U R' U2 R U' R'", moves: ["U'", 'R', 'U', "R'", 'U2', 'R', "U'", "R'"], description: 'Hide slot, pair, insert.' },
];

export const ALGO_GROUPS = ['OLL', 'PLL', 'F2L'] as const;
