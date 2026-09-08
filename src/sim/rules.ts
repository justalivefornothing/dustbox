/**
 * Per-species update rules.
 *
 * Every rule receives the world plus the cell's (x, y, index) and mutates the
 * grid in place. Rules must only touch the cell itself and its immediate
 * neighbours (plus `explode`, which is bounded), and they must draw all
 * randomness from `w.rng` so a seeded run is reproducible.
 *
 * Reactions run before movement: once a cell has swapped away, `i` refers
 * to whatever moved into its old slot.
 *
 * Performance notes: species ids and lookup tables are copied into module
 * locals (a live ESM binding read is slower than a local in some loaders),
 * and most rules pull a single 32-bit word from the RNG and slice it into
 * the several small decisions they need.
 */
import type { World } from './world'
import type { Rng } from './rng'
import { E, DENSITY, PHASE, PHASE_OF, FLAMMABILITY, DISSOLVABLE } from './species'

export type Rule = (w: World, x: number, y: number, i: number) => void

const EMPTY = E.Empty
const SAND = E.Sand
const WATER = E.Water
const OIL = E.Oil
const FIRE = E.Fire
const SMOKE = E.Smoke
const PLANT = E.Plant
const ACID = E.Acid
const LAVA = E.Lava
const STONE = E.Stone
const ICE = E.Ice
const GAS = E.Gas

const SOLID = PHASE.Solid
const POWDER = PHASE.Powder
const DENS = DENSITY
const PH = PHASE_OF
const FLAM = FLAMMABILITY
const DISS = DISSOLVABLE

/** Starting register value for a freshly created cell of `species`. */
export function initialRegister(species: number, rng: Rng): number {
  switch (species) {
    case FIRE:
      return 18 + rng.below(28)
    case SMOKE:
      return 60 + rng.below(120)
    case ICE:
      return 6
    case WATER:
    case OIL:
    case ACID:
    case LAVA:
      return rng.next() & 1
    default:
      return 0
  }
}

/** True if `target` is a fluid (gas/liquid/powder) less dense than `self`. */
function sinks(self: number, target: number): boolean {
  return PH[target] !== SOLID && DENS[target] < DENS[self]
}

/** True if `target` is a gas or liquid denser than `self` (buoyancy). */
function rises(self: number, target: number): boolean {
  const p = PH[target]
  return p !== SOLID && p !== POWDER && DENS[target] > DENS[self]
}

/** Von Neumann neighbourhood offsets: right, left, down, up. */
const NX = [1, -1, 0, 0]
const NY = [0, 0, 1, -1]

export const noop: Rule = () => {}

// --------------------------------------------------------------------- sand

export const sandRule: Rule = (w, x, y, i) => {
  const below = w.at(x, y + 1)
  if (sinks(SAND, below)) {
    // Sinking through liquid is slower than falling through air.
    if (below === EMPTY || (w.rng.next() & 0xff) < 120) w.moveTo(i, x, y + 1)
    return
  }
  const d = (w.rng.next() & 1) === 1 ? 1 : -1
  if (sinks(SAND, w.at(x + d, y + 1)) && PH[w.at(x + d, y)] !== SOLID) {
    w.moveTo(i, x + d, y + 1)
    return
  }
  if (sinks(SAND, w.at(x - d, y + 1)) && PH[w.at(x - d, y)] !== SOLID) {
    w.moveTo(i, x - d, y + 1)
  }
}

// ------------------------------------------------------------------ liquids

/**
 * Shared liquid motion. `fluidity` is the per-tick chance (of 256) that the
 * cell moves at all, so lava can creep while water rushes. Liquids remember
 * their horizontal heading in bit 0 of the register and only flip it when
 * blocked, which lets a puddle spread out several cells per second instead
 * of random-walking in place.
 */
function flowLiquid(w: World, x: number, y: number, i: number, self: number, fluidity: number): void {
  if (fluidity < 255 && (w.rng.next() & 0xff) >= fluidity) return
  if (sinks(self, w.at(x, y + 1))) {
    w.moveTo(i, x, y + 1)
    return
  }
  const d = (w.reg[i] & 1) === 1 ? 1 : -1
  if (sinks(self, w.at(x + d, y + 1))) {
    w.moveTo(i, x + d, y + 1)
    return
  }
  if (sinks(self, w.at(x - d, y + 1))) {
    w.reg[i] ^= 1
    w.moveTo(i, x - d, y + 1)
    return
  }
  if (sinks(self, w.at(x + d, y))) {
    w.moveTo(i, x + d, y)
    return
  }
  if (sinks(self, w.at(x - d, y))) {
    w.reg[i] ^= 1
    w.moveTo(i, x - d, y)
    return
  }
  // Boxed in: occasionally re-roll heading so trapped pockets keep jiggling.
  if ((w.rng.next() & 0xff) < 16) w.reg[i] ^= 1
}

export const waterRule: Rule = (w, x, y, i) => {
  flowLiquid(w, x, y, i, WATER, 255)
}

export const oilRule: Rule = (w, x, y, i) => {
  flowLiquid(w, x, y, i, OIL, 255)
}

export const acidRule: Rule = (w, x, y, i) => {
  // Corrode one random neighbour, favouring downward.
  const r = w.rng.next()
  const k = (r & 1) === 1 ? 2 : (r >>> 1) & 3
  const nx = x + NX[k]
  const ny = y + NY[k]
  const t = w.at(nx, ny)
  if (t === LAVA) {
    // Boiled off.
    w.setAt(i, SMOKE, initialRegister(SMOKE, w.rng))
    return
  }
  if (DISS[t] === 1 && ((r >>> 8) & 0xff) < 72) {
    w.set(nx, ny, EMPTY)
    if (((r >>> 16) & 0xff) < 110) {
      w.setAt(i, EMPTY)
      return
    }
  }
  flowLiquid(w, x, y, i, ACID, 255)
}

export const lavaRule: Rule = (w, x, y, i) => {
  for (let k = 0; k < 4; k++) {
    const nx = x + NX[k]
    const ny = y + NY[k]
    const t = w.at(nx, ny)
    if (t === WATER) {
      // Quenched: lava hardens, some of the water flashes to steam.
      w.setAt(i, STONE)
      if ((w.rng.next() & 0xff) < 96) w.set(nx, ny, SMOKE, initialRegister(SMOKE, w.rng))
      return
    }
    if (t === ICE) {
      if ((w.rng.next() & 0xff) < 200) w.set(nx, ny, WATER, initialRegister(WATER, w.rng))
    } else if (t === ACID) {
      if ((w.rng.next() & 0xff) < 128) w.set(nx, ny, SMOKE, initialRegister(SMOKE, w.rng))
    } else if (FLAM[t] !== 0 && (w.rng.next() & 0xff) < FLAM[t]) {
      if (t === GAS) explode(w, nx, ny)
      else w.set(nx, ny, FIRE, initialRegister(FIRE, w.rng))
    }
  }
  flowLiquid(w, x, y, i, LAVA, 56)
}

// --------------------------------------------------------------------- fire

export const fireRule: Rule = (w, x, y, i) => {
  let fuel = false
  for (let k = 0; k < 4; k++) {
    const nx = x + NX[k]
    const ny = y + NY[k]
    const t = w.at(nx, ny)
    if (t === WATER) {
      // Doused. Steam rises off the surface.
      w.setAt(i, SMOKE, 20 + w.rng.below(40))
      return
    }
    if (t === ICE) {
      if ((w.rng.next() & 0xff) < 90) w.set(nx, ny, WATER, initialRegister(WATER, w.rng))
    } else if (FLAM[t] !== 0) {
      fuel = true
      if ((w.rng.next() & 0xff) < FLAM[t]) {
        if (t === GAS) explode(w, nx, ny)
        else w.set(nx, ny, FIRE, initialRegister(FIRE, w.rng))
      }
    }
  }
  const life = w.reg[i]
  if (life <= 1) {
    if ((w.rng.next() & 0xff) < 150) w.setAt(i, SMOKE, initialRegister(SMOKE, w.rng))
    else w.setAt(i, EMPTY)
    return
  }
  w.reg[i] = life - 1
  // Flames cling to fuel; free-floating flames lick upward now and then.
  if (fuel) return
  const r = w.rng.next()
  if ((r & 0xff) < 70) {
    const d = (r & 0x100) !== 0 ? 1 : -1
    if (w.at(x, y - 1) === EMPTY) w.moveTo(i, x, y - 1)
    else if (w.at(x + d, y - 1) === EMPTY) w.moveTo(i, x + d, y - 1)
  }
}

/**
 * Gas detonation: everything burnable or empty within a small radius becomes
 * flame at once. Walls and stone survive; the chain reaction through the
 * rest of a gas cloud happens naturally over the following ticks.
 */
export function explode(w: World, cx: number, cy: number): void {
  const r = 3 + w.rng.below(3)
  const r2 = r * r
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue
      const x = cx + dx
      const y = cy + dy
      if (!w.inBounds(x, y)) continue
      const t = w.at(x, y)
      if (t === EMPTY || t === GAS || t === SMOKE || t === FIRE || FLAM[t] !== 0) {
        w.set(x, y, FIRE, 10 + w.rng.below(30))
      }
    }
  }
}

// -------------------------------------------------------------------- gases

export const smokeRule: Rule = (w, x, y, i) => {
  const life = w.reg[i]
  if (life <= 1) {
    w.setAt(i, EMPTY)
    return
  }
  w.reg[i] = life - 1
  const r = w.rng.next()
  const d = (r & 1) === 1 ? 1 : -1
  if (((r >>> 8) & 0xff) < 200 && rises(SMOKE, w.at(x, y - 1))) {
    w.moveTo(i, x, y - 1)
  } else if (rises(SMOKE, w.at(x + d, y - 1))) {
    w.moveTo(i, x + d, y - 1)
  } else if ((r & 0x10000) !== 0 && rises(SMOKE, w.at(x + d, y))) {
    w.moveTo(i, x + d, y)
  }
}

export const gasRule: Rule = (w, x, y, i) => {
  for (let k = 0; k < 4; k++) {
    const t = w.at(x + NX[k], y + NY[k])
    if (t === FIRE || t === LAVA) {
      explode(w, x, y)
      return
    }
  }
  // Diffuse: mostly drift up, but wander sideways a lot.
  const r = w.rng.next()
  const d = (r & 1) === 1 ? 1 : -1
  const roll = (r >>> 8) & 0xff
  if (roll < 110) {
    if (rises(GAS, w.at(x, y - 1))) w.moveTo(i, x, y - 1)
  } else if (roll < 170) {
    if (rises(GAS, w.at(x + d, y - 1))) w.moveTo(i, x + d, y - 1)
  } else if (roll < 250) {
    const t = w.at(x + d, y)
    if (t === EMPTY || (t !== GAS && rises(GAS, t))) w.moveTo(i, x + d, y)
  }
}

// ------------------------------------------------------------------- solids

export const plantRule: Rule = (w, x, y, i) => {
  const r = w.rng.next()
  const k = r & 3
  const nx = x + NX[k]
  const ny = y + NY[k]
  if (w.at(nx, ny) === WATER && ((r >>> 8) & 0xff) < 40) {
    w.set(nx, ny, PLANT)
    // Growth slowly mutates the shade so leaves are not uniform.
    w.shade[i] = (w.shade[i] + ((r >>> 16) & 7) - 4) & 0xff
  }
}

export const iceRule: Rule = (w, x, y, i) => {
  for (let k = 0; k < 4; k++) {
    const t = w.at(x + NX[k], y + NY[k])
    if ((t === FIRE || t === LAVA) && (w.rng.next() & 0xff) < 80) {
      w.setAt(i, WATER, initialRegister(WATER, w.rng))
      return
    }
  }
  // Frost spreads through water, but only `reg` cells deep from where it was
  // painted so a single crystal does not freeze an entire ocean.
  const budget = w.reg[i]
  if (budget === 0) return
  const r = w.rng.next()
  const k = r & 3
  const nx = x + NX[k]
  const ny = y + NY[k]
  if (w.at(nx, ny) === WATER && ((r >>> 8) & 0xff) < 36) {
    w.set(nx, ny, ICE, budget - 1)
  }
}
