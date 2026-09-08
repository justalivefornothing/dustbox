import { describe, expect, it } from 'vitest'
import { SlotStore, SLOT_COUNT, applySnapshot, type StorageLike } from './storage'
import { World } from '../sim/world'
import { E } from '../sim/species'
import { FORMAT_TAG, rleEncode } from '../sim/rle'
import { initialRegister } from '../sim/rules'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

function scene(seed: number): World {
  const w = new World(300, 300, seed)
  w.paint(150, 80, 40, E.Sand, 'circle')
  w.paint(70, 220, 30, E.Water, 'square')
  w.paint(230, 220, 20, E.Lava, 'circle')
  w.paint(150, 40, 8, E.Fire, 'circle')
  w.step(25)
  return w
}

describe('save slots', () => {
  it('exposes six slots', () => {
    const store = new SlotStore(new MemoryStorage())
    expect(SLOT_COUNT).toBe(6)
    expect(store.list()).toHaveLength(6)
    expect(store.list().every((s) => s === null)).toBe(true)
    expect(() => store.key(6)).toThrow(RangeError)
  })

  it('round-trips a world through a slot with identical buffers', () => {
    const mem = new MemoryStorage()
    const store = new SlotStore(mem)
    const w = scene(7)
    const meta = store.save(2, 'Lava pit', w, 1_700_000_000_000)
    expect(meta).toMatchObject({ index: 2, name: 'Lava pit', width: 300, height: 300, savedAt: 1_700_000_000_000 })
    expect(meta.cells).toBe(w.tally())

    const loaded = store.load(2)!
    expect(loaded.name).toBe('Lava pit')
    expect(Buffer.from(loaded.species).equals(Buffer.from(w.species))).toBe(true)
    expect(Buffer.from(loaded.reg!).equals(Buffer.from(w.reg))).toBe(true)
    // Shade noise is deliberately not persisted (see rle.ts GridDetail).
    expect(loaded.shade).toBeUndefined()

    const list = store.list()
    expect(list[2]?.name).toBe('Lava pit')
    expect(list.filter(Boolean)).toHaveLength(1)

    // Applying the loaded slot to a fresh world reproduces the species and
    // registers exactly and fills in fresh shades for every cell.
    const dst = new World(300, 300, 1)
    applySnapshot(dst, loaded, (s) => initialRegister(s, dst.rng))
    expect(Buffer.from(dst.species).equals(Buffer.from(w.species))).toBe(true)
    expect(Buffer.from(dst.reg).equals(Buffer.from(w.reg))).toBe(true)
    expect(dst.shade.some((v) => v !== 0)).toBe(true)
  })

  it('stores the grid with the RLE codec, not raw bytes', () => {
    const mem = new MemoryStorage()
    const store = new SlotStore(mem)
    const w = scene(8)
    store.save(0, 'a', w)
    const raw = mem.getItem('dustbox:slot:0')!
    const rec = JSON.parse(raw) as { grid: string }
    expect(rec.grid.startsWith(`${FORMAT_TAG};300;300;`)).toBe(true)
    // The species section is the base64 of rleEncode(species): far smaller than 90 KB.
    const speciesB64 = rec.grid.split(';')[3]
    expect(speciesB64).toBe(Buffer.from(rleEncode(w.species)).toString('base64'))
    expect(speciesB64.length).toBeLessThan(w.size / 4)
    // Whole record (species + registers) stays small: well under 40 KB for this scene.
    expect(raw.length).toBeLessThan(40_000)
  })

  it('removes slots and ignores corrupt records', () => {
    const mem = new MemoryStorage()
    const store = new SlotStore(mem)
    store.save(1, 'x', scene(9))
    store.remove(1)
    expect(store.load(1)).toBeNull()
    mem.setItem('dustbox:slot:3', '{not json')
    mem.setItem('dustbox:slot:4', JSON.stringify({ name: 'no grid' }))
    expect(store.list()[3]).toBeNull()
    expect(store.list()[4]).toBeNull()
  })

  it('defaults blank names', () => {
    const store = new SlotStore(new MemoryStorage())
    expect(store.save(5, '   ', new World(10, 10, 1)).name).toBe('Slot 6')
  })
})

describe('applySnapshot', () => {
  it('loads same-size snapshots verbatim', () => {
    const src = scene(3)
    const dst = new World(300, 300, 99)
    applySnapshot(dst, src.snapshot(), (s) => initialRegister(s, dst.rng))
    expect(Buffer.from(dst.species).equals(Buffer.from(src.species))).toBe(true)
    expect(Buffer.from(dst.reg).equals(Buffer.from(src.reg))).toBe(true)
  })

  it('resamples into a world of a different size', () => {
    const src = new World(20, 20, 1)
    src.paint(10, 10, 20, E.Stone, 'square')
    const dst = new World(40, 40, 2)
    applySnapshot(dst, src.snapshot(), (s) => initialRegister(s, dst.rng))
    expect(dst.count(E.Stone)).toBe(1600)
  })
})
