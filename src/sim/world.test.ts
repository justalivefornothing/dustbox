import { describe, expect, it } from 'vitest'
import { World } from './world'
import { E } from './species'
import { ELEMENTS, PAINTABLE, RULES } from './elements'
import { Rng } from './rng'

function seededScene(seed: number): World {
  const w = new World(120, 90, seed)
  const r = new Rng(seed ^ 0xabcdef)
  const kinds = [E.Sand, E.Water, E.Oil, E.Plant, E.Stone, E.Acid, E.Lava, E.Ice, E.Gas, E.Fire, E.Wall]
  for (let y = 10; y < 80; y++) {
    for (let x = 5; x < 115; x++) {
      if (r.chance(120)) w.set(x, y, kinds[r.below(kinds.length)], r.below(40))
    }
  }
  return w
}

describe('determinism', () => {
  it('produces identical buffers for the same seed and initial grid after 200 ticks', () => {
    const a = seededScene(1234)
    const b = seededScene(1234)
    expect(a.species).toEqual(b.species)
    for (let t = 0; t < 200; t++) {
      a.tick()
      b.tick()
    }
    expect(Buffer.from(a.species).equals(Buffer.from(b.species))).toBe(true)
    expect(Buffer.from(a.reg).equals(Buffer.from(b.reg))).toBe(true)
    expect(Buffer.from(a.shade).equals(Buffer.from(b.shade))).toBe(true)
    expect(a.generation).toBe(200)
  })

  it('diverges for a different seed', () => {
    const a = seededScene(1)
    const b = new World(120, 90, 2)
    b.load({ ...a.snapshot() })
    for (let t = 0; t < 200; t++) {
      a.tick()
      b.tick()
    }
    expect(Buffer.from(a.species).equals(Buffer.from(b.species))).toBe(false)
  })
})

describe('clock bit', () => {
  it('prevents a cell that moved from being updated twice in one tick', () => {
    // Bottom-up scan + rising smoke would otherwise chain-move it to the top.
    const w = new World(5, 50, 3)
    w.set(2, 49, E.Smoke, 200)
    w.tick()
    expect(w.at(2, 48)).toBe(E.Smoke)
    expect(w.at(2, 47)).toBe(E.Empty)
  })

  it('processes cells painted between ticks on the very next tick', () => {
    const w = new World(5, 10, 4)
    w.tick()
    w.tick()
    w.tick()
    w.paint(2, 0, 0, E.Sand, 'square')
    w.tick()
    expect(w.at(2, 1)).toBe(E.Sand)
  })
})

describe('brush', () => {
  it('paints circles and squares of the requested radius', () => {
    const w = new World(41, 41, 5)
    w.paint(20, 20, 10, E.Sand, 'square')
    expect(w.count(E.Sand)).toBe(21 * 21)
    w.clear()
    w.paint(20, 20, 10, E.Sand, 'circle')
    const n = w.count(E.Sand)
    expect(n).toBeLessThan(21 * 21)
    expect(n).toBeGreaterThan(Math.PI * 100 * 0.9)
  })

  it('does not overwrite existing cells unless forced, and erases without touching walls', () => {
    const w = new World(10, 10, 6)
    w.paint(5, 5, 2, E.Wall, 'square')
    w.paint(5, 5, 4, E.Water, 'square')
    expect(w.count(E.Wall)).toBe(25)
    expect(w.count(E.Water)).toBe(81 - 25)
    w.paint(5, 5, 4, E.Empty, 'square')
    expect(w.count(E.Water)).toBe(0)
    expect(w.count(E.Wall)).toBe(25)
    w.paint(5, 5, 4, E.Empty, 'square', true)
    expect(w.count(E.Wall)).toBe(0)
  })

  it('clips at the edges', () => {
    const w = new World(10, 10, 7)
    w.paint(0, 0, 30, E.Stone, 'circle')
    expect(w.count(E.Stone)).toBe(100)
  })
})

describe('registry', () => {
  it('registers exactly 12 paintable elements with colour, density and a rule', () => {
    expect(PAINTABLE).toHaveLength(12)
    const names = PAINTABLE.map((e) => e.name).sort()
    expect(names).toEqual(
      ['Acid', 'Fire', 'Gas', 'Ice', 'Lava', 'Oil', 'Plant', 'Sand', 'Smoke', 'Stone', 'Wall', 'Water'].sort(),
    )
    for (const e of ELEMENTS) {
      expect(e.color).toHaveLength(3)
      for (const c of e.color) expect(c >= 0 && c <= 255).toBe(true)
      expect(typeof e.density).toBe('number')
      expect(typeof e.rule).toBe('function')
      expect(ELEMENTS[e.id]).toBe(e)
      expect(RULES[e.id]).toBe(e.rule)
    }
    const ids = new Set(ELEMENTS.map((e) => e.id))
    expect(ids.size).toBe(ELEMENTS.length)
  })

  it('maps keys 1-9 and 0 to ten distinct elements', () => {
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
    const hit = digits.map((d) => PAINTABLE.find((e) => e.key === d))
    for (const e of hit) expect(e).toBeDefined()
    expect(new Set(hit.map((e) => e!.id)).size).toBe(10)
  })

  it('World.applyRule dispatches to the same function as ELEMENTS[id].rule', () => {
    for (const el of PAINTABLE) {
      // Two identical worlds: one goes through the switch, one through the table.
      const a = new World(9, 9, 99)
      a.set(4, 4, el.id, 30)
      a.set(5, 4, E.Water)
      a.set(4, 5, E.Oil)
      const b = new World(9, 9, 99)
      b.load(a.snapshot())
      b.rng.state = a.rng.state
      a.applyRule(el.id, 4, 4, a.idx(4, 4))
      el.rule(b, 4, 4, b.idx(4, 4))
      expect(Buffer.from(a.species).equals(Buffer.from(b.species))).toBe(true)
      expect(Buffer.from(a.reg).equals(Buffer.from(b.reg))).toBe(true)
      expect(a.rng.state).toBe(b.rng.state)
    }
  })
})

describe('tally', () => {
  it('counts every species', () => {
    const w = new World(10, 10, 8)
    w.paint(2, 2, 1, E.Sand, 'square')
    w.paint(7, 7, 0, E.Lava, 'square')
    const nonEmpty = w.tally()
    expect(nonEmpty).toBe(10)
    expect(w.counts[E.Sand]).toBe(9)
    expect(w.counts[E.Lava]).toBe(1)
    expect(w.counts[E.Empty]).toBe(90)
  })
})
