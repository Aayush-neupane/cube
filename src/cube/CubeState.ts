import { Cubie, Sticker, Vec3, vecKey, parseMove, Axis } from './types';
import { rotateVec } from './types';

function buildSolvedCubies(): Cubie[] {
  const cubies: Cubie[] = [];
  const colorOf = (dir: Vec3): Sticker['color'] => {
    if (dir[0] === 1) return 'R';
    if (dir[0] === -1) return 'L';
    if (dir[1] === 1) return 'U';
    if (dir[1] === -1) return 'D';
    if (dir[2] === 1) return 'F';
    return 'B';
  };
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const pos: Vec3 = [x, y, z];
        const stickers: Sticker[] = [];
        if (x !== 0) {
          const d: Vec3 = [Math.sign(x), 0, 0];
          stickers.push({ dir: [...d] as Vec3, homeDir: [...d] as Vec3, color: colorOf(d) });
        }
        if (y !== 0) {
          const d: Vec3 = [0, Math.sign(y), 0];
          stickers.push({ dir: [...d] as Vec3, homeDir: [...d] as Vec3, color: colorOf(d) });
        }
        if (z !== 0) {
          const d: Vec3 = [0, 0, Math.sign(z)];
          stickers.push({ dir: [...d] as Vec3, homeDir: [...d] as Vec3, color: colorOf(d) });
        }
        cubies.push({ id: vecKey(pos), home: [...pos] as Vec3, pos: [...pos] as Vec3, stickers });
      }
    }
  }
  return cubies;
}

export class CubeState {
  cubies: Cubie[];

  constructor() {
    this.cubies = buildSolvedCubies();
  }

  clone(): CubeState {
    const c = new CubeState();
    c.cubies = this.cubies.map((cb) => ({
      id: cb.id,
      home: [...cb.home] as Vec3,
      pos: [...cb.pos] as Vec3,
      stickers: cb.stickers.map((s) => ({
        dir: [...s.dir] as Vec3,
        homeDir: [...s.homeDir] as Vec3,
        color: s.color,
      })),
    }));
    return c;
  }

  reset(): void {
    this.cubies = buildSolvedCubies();
  }

  applyMove(move: string): void {
    const p = parseMove(move);
    this.applyParsed(p.axis, p.layer, p.quarter);
  }

  applyMoves(moves: string[]): void {
    for (const m of moves) this.applyMove(m);
  }

  private applyParsed(axis: Axis, layer: number | 'all', quarter: number): void {
    const q = quarter === 2 ? 2 : quarter === -2 ? 2 : quarter;
    for (const cb of this.cubies) {
      const v = axis === 'x' ? cb.pos[0] : axis === 'y' ? cb.pos[1] : cb.pos[2];
      if (layer !== 'all' && v !== layer) continue;
      cb.pos = rotateVec(cb.pos, axis, q);
      for (const s of cb.stickers) {
        s.dir = rotateVec(s.dir, axis, q);
      }
    }
  }

  isSolved(): boolean {
    for (const cb of this.cubies) {
      if (cb.pos[0] !== cb.home[0] || cb.pos[1] !== cb.home[1] || cb.pos[2] !== cb.home[2]) {
        return false;
      }
      for (const s of cb.stickers) {
        if (s.dir[0] !== s.homeDir[0] || s.dir[1] !== s.homeDir[1] || s.dir[2] !== s.homeDir[2]) {
          return false;
        }
      }
    }
    return true;
  }

  /** Snapshot key for undo/redo comparisons & tests */
  key(): string {
    const parts = this.cubies
      .map((cb) => `${cb.pos.join(',')}|${cb.stickers.map((s) => s.dir.join(',')).join(';')}`)
      .sort();
    return parts.join('#');
  }

  /**
   * Export 54 facelets in U,R,F,D,L,B order, row-major in standard viewing
   * orientation (U up for sides, B edge on top for U, F edge on top for D).
   * Letters are home-face colors — the convention Kociemba-style solvers take.
   */
  toFacelets(): string {
    const byPos = new Map<string, Cubie>();
    for (const cb of this.cubies) byPos.set(vecKey(cb.pos), cb);
    const at = (x: number, y: number, z: number): Cubie => {
      const cb = byPos.get(`${x},${y},${z}`);
      if (!cb) throw new Error(`Missing cubie at ${x},${y},${z}`);
      return cb;
    };
    const facing = (cb: Cubie, dx: number, dy: number, dz: number): string => {
      const s = cb.stickers.find((st) => st.dir[0] === dx && st.dir[1] === dy && st.dir[2] === dz);
      if (!s) throw new Error(`Missing sticker facing ${dx},${dy},${dz}`);
      return s.color;
    };
    let out = '';
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) out += facing(at(x, 1, z), 0, 1, 0); // U
    for (let y = 1; y >= -1; y--) for (let z = 1; z >= -1; z--) out += facing(at(1, y, z), 1, 0, 0); // R
    for (let y = 1; y >= -1; y--) for (let x = -1; x <= 1; x++) out += facing(at(x, y, 1), 0, 0, 1); // F
    for (let z = 1; z >= -1; z--) for (let x = -1; x <= 1; x++) out += facing(at(x, -1, z), 0, -1, 0); // D
    for (let y = 1; y >= -1; y--) for (let z = -1; z <= 1; z++) out += facing(at(-1, y, z), -1, 0, 0); // L
    for (let y = 1; y >= -1; y--) for (let x = 1; x >= -1; x--) out += facing(at(x, y, -1), 0, 0, -1); // B
    return out;
  }
}

// Singleton engine shared between store (logic) and renderer (visual target).
export const cubeEngine = new CubeState();
