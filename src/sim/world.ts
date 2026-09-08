/**
 * World: the falling-sand grid and its fixed-step update loop.
 *
 * Memory layout is four parallel flat typed arrays, one byte per cell each:
 *
 *   species[i]  what lives in the cell (see `E` in species.ts)
 *   reg[i]      a general purpose register: fire/smoke lifetime, liquid flow
 *               direction, ice spread budget, ...
 *   shade[i]    a per-cell noise byte assigned when the cell is created and
 *               carried along when it moves, so grains keep their colour
 *   clock[i]    parity bit of the last tick that touched this cell; a cell
 *               whose clock already equals the current tick's parity has been
 *               updated (or moved into place) this tick and is skipped
 *
 * Rows are scanned bottom-to-top so falling columns move as a unit; the
 * horizontal direction is re-rolled for every row of every tick to kill the
 * left/right bias a fixed scan would introduce. All randomness flows through
 * one seeded xorshift generator, so (seed, initial grid) fully determines the
 * future — the test-suite relies on this.
 *
 * This module has no DOM or third-party dependencies and runs unchanged in
 * Node, Workers and the browser.
 */
import { Rng } from './rng'
import { E, SPECIES_SLOTS, PHASE, PHASE_OF, canSinkInto, canRiseInto } from './species'
import {
  initialRegister,
  sandRule,
  waterRule,
  oilRule,
  fireRule,
  smokeRule,
  plantRule,
  acidRule,
  lavaRule,
  iceRule,
  gasRule,
} from './rules'

const WALL = E.Wall

export type BrushShape = 'circle' | 'square'

export interface WorldSnapshot {
  width: number
  height: number
  species: Uint8Array
  reg: Uint8Array
  shade: Uint8Array
}

export class World {
  readonly width: number
  readonly height: number
  readonly size: number
  readonly species: Uint8Array
  readonly reg: Uint8Array
  readonly shade: Uint8Array
  readonly clock: Uint8Array
  readonly rng: Rng
  /** Per-species cell counts, refreshed by `tally()`. */
  readonly counts = new Uint32Array(SPECIES_SLOTS)
  /** Number of ticks simulated since construction / last `clear()`. */
  generation = 0
  /** Parity of the tick in progress (or of the last completed tick). */
  parity = 0

  constructor(width: number, height: number, seed = 0x5eed1234) {
    if (width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new RangeError(`World size out of range: ${width}x${height}`)
    }
    this.width = width | 0
    this.height = height | 0
    this.size = this.width * this.height
    this.species = new Uint8Array(this.size)
    this.reg = new Uint8Array(this.size)
    this.shade = new Uint8Array(this.size)
    this.clock = new Uint8Array(this.size)
    this.rng = new Rng(seed)
    // Give empty cells a random shade too so the background can carry noise.
    for (let i = 0; i < this.size; i++) this.shade[i] = this.rng.byte()
  }

  // ------------------------------------------------------------------ access

  idx(x: number, y: number): number {
    return y * this.width + x
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  /** Species at (x, y); anything outside the grid reads as Wall. */
  at(x: number, y: number): number {
    // Unsigned compare folds the negative check into the upper-bound check.
    if ((x >>> 0) >= this.width || (y >>> 0) >= this.height) return WALL
    return this.species[y * this.width + x]
  }

  /** Write a cell by coordinates. No-op outside the grid. */
  set(x: number, y: number, species: number, reg = 0): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    this.setAt(y * this.width + x, species, reg)
  }

  /** Write a cell by index. Assigns a fresh shade and stamps the clock. */
  setAt(i: number, species: number, reg = 0): void {
    this.species[i] = species
    this.reg[i] = reg
    this.shade[i] = this.rng.byte()
    this.clock[i] = this.parity
  }

  /** Exchange two cells (species, register and shade) and stamp both clocks. */
  swap(i: number, j: number): void {
    const sp = this.species
    const rg = this.reg
    const sh = this.shade
    const s = sp[i]
    sp[i] = sp[j]
    sp[j] = s
    const r = rg[i]
    rg[i] = rg[j]
    rg[j] = r
    const h = sh[i]
    sh[i] = sh[j]
    sh[j] = h
    this.clock[i] = this.parity
    this.clock[j] = this.parity
  }

  /** Swap the cell at index `i` with the cell at (x, y). Caller checks bounds. */
  moveTo(i: number, x: number, y: number): void {
    this.swap(i, y * this.width + x)
  }

  /** Movement helpers re-exported for rules so they need only the World. */
  canSink(self: number, target: number): boolean {
    return canSinkInto(self, target)
  }

  canRise(self: number, target: number): boolean {
    return canRiseInto(self, target)
  }

  isSolid(species: number): boolean {
    return PHASE_OF[species] === PHASE.Solid
  }

  // --------------------------------------------------------------- painting

  /**
   * Paint a brush stamp. `radius` 0 paints a single cell. Painting a
   * non-empty species only fills empty cells (so you can drizzle sand into a
   * pool without deleting it); painting Empty erases everything except Wall
   * unless `force` is set; painting Wall always overwrites.
   */
  paint(cx: number, cy: number, radius: number, species: number, shape: BrushShape, force = false): void {
    const r = Math.max(0, radius | 0)
    const r2 = r * r + r * 0.5
    const x0 = Math.max(0, cx - r)
    const x1 = Math.min(this.width - 1, cx + r)
    const y0 = Math.max(0, cy - r)
    const y1 = Math.min(this.height - 1, cy + r)
    const erasing = species === E.Empty
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        if (shape === 'circle' && dx * dx + dy * dy > r2) continue
        const i = y * this.width + x
        const cur = this.species[i]
        if (erasing) {
          if (cur === E.Empty) continue
          if (cur === E.Wall && !force) continue
        } else if (cur !== E.Empty && !force && species !== E.Wall) {
          continue
        }
        this.setAt(i, species, initialRegister(species, this.rng))
      }
    }
  }

  /** Paint a straight line of stamps between two points (for fast strokes). */
  paintLine(x0: number, y0: number, x1: number, y1: number, radius: number, species: number, shape: BrushShape, force = false): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(1, radius * 0.5)))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      this.paint(Math.round(x0 + dx * t), Math.round(y0 + dy * t), radius, species, shape, force)
    }
  }

  /** Reset to an empty grid but keep the RNG stream and generation. */
  clear(): void {
    this.species.fill(E.Empty)
    this.reg.fill(0)
    this.clock.fill(this.parity)
  }

  /**
   * Replace the grid contents from a snapshot (sizes must match). Missing
   * registers are zeroed; missing shades are re-rolled from the RNG.
   */
  load(snap: { width: number; height: number; species: Uint8Array; reg?: Uint8Array; shade?: Uint8Array }): void {
    if (snap.width !== this.width || snap.height !== this.height) {
      throw new RangeError('snapshot size mismatch')
    }
    this.species.set(snap.species)
    if (snap.reg) this.reg.set(snap.reg)
    else this.reg.fill(0)
    if (snap.shade) this.shade.set(snap.shade)
    else for (let i = 0; i < this.size; i++) this.shade[i] = this.rng.byte()
    this.clock.fill(this.parity)
  }

  snapshot(): WorldSnapshot {
    return {
      width: this.width,
      height: this.height,
      species: this.species.slice(),
      reg: this.reg.slice(),
      shade: this.shade.slice(),
    }
  }

  // ----------------------------------------------------------------- update

  /** Advance the simulation by one fixed step. */
  tick(): void {
    this.generation++
    const parity = this.generation & 1
    this.parity = parity
    const w = this.width
    const h = this.height
    const sp = this.species
    const ck = this.clock
    const rng = this.rng

    // Bottom-up so a column of sand drops as one body per tick.
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w
      if (rng.bool()) {
        for (let x = 0; x < w; x++) {
          const i = row + x
          const s = sp[i]
          if (s === 0 || ck[i] === parity) continue
          ck[i] = parity
          this.applyRule(s, x, y, i)
        }
      } else {
        for (let x = w - 1; x >= 0; x--) {
          const i = row + x
          const s = sp[i]
          if (s === 0 || ck[i] === parity) continue
          ck[i] = parity
          this.applyRule(s, x, y, i)
        }
      }
    }
  }

  /**
   * Species -> rule dispatch. This mirrors ELEMENTS[id].rule exactly (a test
   * enforces it) but as a switch so every call site stays monomorphic and
   * inlinable, which is measurably faster than indexing a function table.
   */
  applyRule(s: number, x: number, y: number, i: number): void {
    switch (s) {
      case E.Sand:
        sandRule(this, x, y, i)
        break
      case E.Water:
        waterRule(this, x, y, i)
        break
      case E.Oil:
        oilRule(this, x, y, i)
        break
      case E.Fire:
        fireRule(this, x, y, i)
        break
      case E.Smoke:
        smokeRule(this, x, y, i)
        break
      case E.Plant:
        plantRule(this, x, y, i)
        break
      case E.Acid:
        acidRule(this, x, y, i)
        break
      case E.Lava:
        lavaRule(this, x, y, i)
        break
      case E.Ice:
        iceRule(this, x, y, i)
        break
      case E.Gas:
        gasRule(this, x, y, i)
        break
      default:
        // Wall, Stone and unknown ids are inert.
        break
    }
  }

  /** Run `n` ticks. */
  step(n: number): void {
    for (let k = 0; k < n; k++) this.tick()
  }

  /** Recount cells per species into `counts`. Returns the non-empty total. */
  tally(): number {
    const c = this.counts
    c.fill(0)
    const sp = this.species
    for (let i = 0; i < sp.length; i++) c[sp[i]]++
    return this.size - c[0]
  }

  /** Count cells of one species without touching `counts`. */
  count(species: number): number {
    let n = 0
    const sp = this.species
    for (let i = 0; i < sp.length; i++) if (sp[i] === species) n++
    return n
  }
}
