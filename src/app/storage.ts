/**
 * Named save slots on top of any Storage-like key/value store (localStorage
 * in the browser, a Map in tests). Grids are stored as Dustbox RLE strings
 * (see src/sim/rle.ts) at the 'state' detail level (species + registers), so
 * a typical 300x300 scene costs a few KB instead of 180 KB of raw planes.
 */
import { decodeGrid, encodeGrid, type GridSnapshot } from '../sim/rle'
import type { World } from '../sim/world'

export const SLOT_COUNT = 6

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SlotMeta {
  readonly index: number
  readonly name: string
  /** Epoch milliseconds. */
  readonly savedAt: number
  readonly width: number
  readonly height: number
  /** Non-empty cell count at save time. */
  readonly cells: number
}

interface SlotRecord extends SlotMeta {
  readonly grid: string
}

export class SlotStore {
  private readonly storage: StorageLike
  private readonly prefix: string

  constructor(storage: StorageLike, prefix = 'dustbox:slot:') {
    this.storage = storage
    this.prefix = prefix
  }

  key(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) {
      throw new RangeError(`slot index out of range: ${index}`)
    }
    return `${this.prefix}${index}`
  }

  /** Metadata for every slot; `null` where the slot is empty or unreadable. */
  list(): (SlotMeta | null)[] {
    const out: (SlotMeta | null)[] = []
    for (let i = 0; i < SLOT_COUNT; i++) {
      const rec = this.read(i)
      out.push(rec ? { index: i, name: rec.name, savedAt: rec.savedAt, width: rec.width, height: rec.height, cells: rec.cells } : null)
    }
    return out
  }

  save(index: number, name: string, world: World, now = Date.now()): SlotMeta {
    const snap = world.snapshot()
    const rec: SlotRecord = {
      index,
      name: name.trim() || `Slot ${index + 1}`,
      savedAt: now,
      width: world.width,
      height: world.height,
      cells: world.tally(),
      grid: encodeGrid(snap, 'state'),
    }
    this.storage.setItem(this.key(index), JSON.stringify(rec))
    const { grid: _grid, ...meta } = rec
    return meta
  }

  /** Decoded grid for a slot, or `null` if the slot is empty. */
  load(index: number): (GridSnapshot & SlotMeta) | null {
    const rec = this.read(index)
    if (!rec) return null
    const snap = decodeGrid(rec.grid)
    return { ...snap, index, name: rec.name, savedAt: rec.savedAt, width: snap.width, height: snap.height, cells: rec.cells }
  }

  remove(index: number): void {
    this.storage.removeItem(this.key(index))
  }

  private read(index: number): SlotRecord | null {
    const raw = this.storage.getItem(this.key(index))
    if (!raw) return null
    try {
      const rec = JSON.parse(raw) as Partial<SlotRecord>
      if (typeof rec.grid !== 'string' || typeof rec.width !== 'number' || typeof rec.height !== 'number') return null
      return {
        index,
        name: typeof rec.name === 'string' ? rec.name : `Slot ${index + 1}`,
        savedAt: typeof rec.savedAt === 'number' ? rec.savedAt : 0,
        width: rec.width,
        height: rec.height,
        cells: typeof rec.cells === 'number' ? rec.cells : 0,
        grid: rec.grid,
      }
    } catch {
      return null
    }
  }
}

/** Copy a decoded snapshot into a world, resampling registers/shades if sizes differ. */
export function applySnapshot(world: World, snap: GridSnapshot, initialRegister: (species: number) => number): void {
  if (snap.width === world.width && snap.height === world.height && snap.reg) {
    // Same size with registers: verbatim. Shades are re-rolled if absent.
    world.load(snap)
    return
  }
  // Different size (or species-only data): nearest-neighbour resample and
  // rebuild the registers so fire lifetimes and liquid headings are sane.
  world.clear()
  const { width: sw, height: sh, species } = snap
  for (let y = 0; y < world.height; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / world.height))
    for (let x = 0; x < world.width; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / world.width))
      const s = species[sy * sw + sx]
      if (s !== 0) world.setAt(y * world.width + x, s, initialRegister(s))
    }
  }
}
