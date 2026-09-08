import { describe, expect, it } from 'vitest'
import { World } from './world'
import { E } from './species'

/** Build a world whose outer ring is Wall so liquids cannot leak away. */
function walled(w: number, h: number, seed: number): World {
  const world = new World(w, h, seed)
  for (let x = 0; x < w; x++) {
    world.set(x, 0, E.Wall)
    world.set(x, h - 1, E.Wall)
  }
  for (let y = 0; y < h; y++) {
    world.set(0, y, E.Wall)
    world.set(w - 1, y, E.Wall)
  }
  return world
}

function fillRect(w: World, x0: number, y0: number, x1: number, y1: number, s: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.set(x, y, s, w.rng.next() & 1)
}

function extent(w: World, s: number): { minX: number; maxX: number; minY: number; maxY: number; n: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let n = 0
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (w.at(x, y) !== s) continue
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, maxX, minY, maxY, n }
}

describe('sand', () => {
  it('falls exactly one row per tick through empty space', () => {
    const w = new World(9, 40, 1)
    w.set(4, 0, E.Sand)
    for (let t = 1; t <= 30; t++) {
      w.tick()
      expect(w.at(4, t)).toBe(E.Sand)
      expect(w.at(4, t - 1)).toBe(E.Empty)
      expect(w.count(E.Sand)).toBe(1)
    }
  })

  it('slides diagonally off a single-cell peak to form a pile', () => {
    const w = new World(21, 20, 3)
    for (let t = 0; t < 60; t++) {
      if (w.at(10, 0) === E.Empty) w.set(10, 0, E.Sand)
      w.tick()
    }
    for (let t = 0; t < 100; t++) w.tick()
    const e = extent(w, E.Sand)
    expect(e.maxX - e.minX).toBeGreaterThan(4)
    // Nothing floats: every sand cell has sand or floor beneath it.
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (w.at(x, y) === E.Sand) expect([E.Sand, E.Wall]).toContain(w.at(x, y + 1))
      }
    }
  })

  it('sinks through water', () => {
    const w = walled(7, 30, 4)
    fillRect(w, 1, 15, 5, 28, E.Water)
    w.set(3, 2, E.Sand)
    for (let t = 0; t < 200; t++) w.tick()
    expect(w.at(3, 28)).toBe(E.Sand)
  })
})

describe('water', () => {
  it('spreads horizontally across a flat floor within 50 ticks', () => {
    const w = walled(80, 24, 5)
    fillRect(w, 38, 12, 41, 22, E.Water) // 4 wide x 11 tall column
    const before = extent(w, E.Water)
    expect(before.maxX - before.minX).toBe(3)
    for (let t = 0; t < 50; t++) w.tick()
    const after = extent(w, E.Water)
    expect(after.n).toBe(before.n)
    expect(after.maxX - after.minX).toBeGreaterThanOrEqual(20)
    expect(after.maxY - after.minY).toBeLessThanOrEqual(2)
  })

  it('is conserved while flowing', () => {
    const w = walled(40, 40, 6)
    fillRect(w, 5, 5, 15, 15, E.Water)
    const n = w.count(E.Water)
    for (let t = 0; t < 300; t++) w.tick()
    expect(w.count(E.Water)).toBe(n)
  })
})

describe('oil', () => {
  it('rests above water after 100 ticks when dropped on top', () => {
    const w = walled(20, 30, 7)
    fillRect(w, 1, 20, 18, 28, E.Water)
    fillRect(w, 8, 10, 12, 14, E.Oil)
    for (let t = 0; t < 100; t++) w.tick()
    const oil = extent(w, E.Oil)
    const water = extent(w, E.Water)
    expect(oil.n).toBe(25)
    expect(oil.maxY).toBeLessThan(water.minY + 1)
    // Oil sits directly on the surface: the row under the oil is water, not air.
    let onSurface = 0
    for (let x = 1; x < 19; x++) if (w.at(x, oil.maxY) === E.Oil && w.at(x, oil.maxY + 1) === E.Water) onSurface++
    expect(onSurface).toBeGreaterThan(0)
  })

  it('floats up when trapped beneath water', () => {
    const w = walled(12, 30, 8)
    fillRect(w, 1, 10, 10, 26, E.Water)
    fillRect(w, 3, 27, 8, 28, E.Oil)
    for (let t = 0; t < 200; t++) w.tick()
    const oil = extent(w, E.Oil)
    const water = extent(w, E.Water)
    expect(oil.maxY).toBeLessThan(water.minY + 1)
  })
})

describe('fire', () => {
  it('ignites adjacent oil, which burns away leaving smoke or nothing', () => {
    const w = walled(30, 30, 9)
    fillRect(w, 5, 24, 24, 28, E.Oil)
    w.set(14, 23, E.Fire, 30)
    const oil0 = w.count(E.Oil)
    let sawSmoke = false
    let sawMoreFire = false
    for (let t = 0; t < 600; t++) {
      w.tick()
      if (w.count(E.Smoke) > 0) sawSmoke = true
      if (w.count(E.Fire) > 1) sawMoreFire = true
    }
    expect(sawMoreFire).toBe(true)
    expect(sawSmoke).toBe(true)
    expect(w.count(E.Oil)).toBeLessThan(oil0)
    expect(w.count(E.Oil)).toBe(0)
    expect(w.count(E.Fire)).toBe(0)
    // Whatever remains inside the box is smoke or empty.
    for (let y = 1; y < 29; y++) {
      for (let x = 1; x < 29; x++) expect([E.Empty, E.Smoke]).toContain(w.at(x, y))
    }
  })

  it('burns out on its own into smoke or empty', () => {
    const w = new World(5, 5, 10)
    w.set(2, 2, E.Fire, 12)
    for (let t = 0; t < 12; t++) w.tick()
    expect(w.count(E.Fire)).toBe(0)
  })

  it('is doused by water', () => {
    const w = walled(3, 6, 11)
    w.set(1, 3, E.Fire, 200)
    w.set(1, 4, E.Water) // 1-wide shaft: the water cannot flow away
    w.tick()
    expect(w.count(E.Fire)).toBe(0)
    expect(w.count(E.Water)).toBe(1)
  })

  it('does not ignite stone or sand', () => {
    const w = walled(7, 7, 12)
    w.set(2, 3, E.Stone)
    w.set(4, 3, E.Sand)
    w.set(3, 3, E.Fire, 5)
    for (let t = 0; t < 30; t++) w.tick()
    expect(w.count(E.Stone)).toBe(1)
    expect(w.count(E.Sand)).toBe(1)
  })
})

describe('acid', () => {
  it('removes a stone cell', () => {
    // A 1-cell-wide shaft: acid sits on the stone and cannot slide off it.
    const w = walled(3, 5, 13)
    w.set(1, 2, E.Acid)
    w.set(1, 3, E.Stone)
    for (let t = 0; t < 200 && w.at(1, 3) === E.Stone; t++) w.tick()
    expect(w.at(1, 3)).not.toBe(E.Stone)
  })

  it('never touches walls', () => {
    const w = walled(5, 5, 14)
    fillRect(w, 1, 1, 3, 3, E.Acid)
    for (let t = 0; t < 300; t++) w.tick()
    expect(w.count(E.Wall)).toBe(16)
  })

  it('is consumed as it dissolves', () => {
    const w = walled(12, 20, 15)
    fillRect(w, 1, 10, 10, 18, E.Stone)
    fillRect(w, 1, 4, 10, 9, E.Acid)
    const acid0 = w.count(E.Acid)
    for (let t = 0; t < 400; t++) w.tick()
    expect(w.count(E.Acid)).toBeLessThan(acid0)
  })
})

describe('lava', () => {
  it('becomes stone when touching water', () => {
    const w = walled(7, 7, 16)
    w.set(3, 3, E.Lava)
    w.set(4, 3, E.Water)
    for (let t = 0; t < 5 && w.count(E.Lava) > 0; t++) w.tick()
    expect(w.count(E.Lava)).toBe(0)
    expect(w.count(E.Stone)).toBe(1)
  })

  it('ignites oil', () => {
    const w = walled(9, 9, 17)
    w.set(4, 4, E.Lava)
    fillRect(w, 1, 6, 7, 7, E.Oil)
    let sawFire = false
    for (let t = 0; t < 120; t++) {
      w.tick()
      if (w.count(E.Fire) > 0) sawFire = true
    }
    expect(sawFire).toBe(true)
  })

  it('flows more slowly than water', () => {
    const wl = walled(60, 12, 18)
    const ww = walled(60, 12, 18)
    fillRect(wl, 28, 5, 31, 10, E.Lava)
    fillRect(ww, 28, 5, 31, 10, E.Water)
    for (let t = 0; t < 30; t++) {
      wl.tick()
      ww.tick()
    }
    const l = extent(wl, E.Lava)
    const a = extent(ww, E.Water)
    expect(l.maxX - l.minX).toBeLessThan(a.maxX - a.minX)
  })
})

describe('plant', () => {
  it('grows into adjacent water', () => {
    const w = walled(4, 3, 19)
    w.set(1, 1, E.Plant)
    w.set(2, 1, E.Water)
    for (let t = 0; t < 200 && w.at(2, 1) !== E.Plant; t++) w.tick()
    expect(w.at(2, 1)).toBe(E.Plant)
    expect(w.count(E.Water)).toBe(0)
  })

  it('burns', () => {
    const w = walled(9, 9, 20)
    fillRect(w, 1, 4, 7, 7, E.Plant)
    w.set(4, 3, E.Fire, 40)
    const plant0 = w.count(E.Plant)
    for (let t = 0; t < 300; t++) w.tick()
    expect(w.count(E.Plant)).toBeLessThan(plant0)
  })
})

describe('ice', () => {
  it('freezes adjacent water', () => {
    const w = walled(4, 3, 21)
    w.set(1, 1, E.Ice, 6)
    w.set(2, 1, E.Water)
    for (let t = 0; t < 200 && w.at(2, 1) !== E.Ice; t++) w.tick()
    expect(w.at(2, 1)).toBe(E.Ice)
  })

  it('only spreads a bounded distance into a pool', () => {
    const w = walled(60, 5, 22)
    fillRect(w, 1, 1, 58, 3, E.Water)
    w.set(30, 2, E.Ice, 6)
    for (let t = 0; t < 2000; t++) w.tick()
    expect(w.count(E.Water)).toBeGreaterThan(0)
    const ice = extent(w, E.Ice)
    expect(ice.maxX - ice.minX).toBeLessThanOrEqual(12)
  })

  it('melts next to lava', () => {
    const w = walled(6, 6, 23)
    w.set(2, 2, E.Ice, 0)
    w.set(3, 2, E.Lava)
    // Lava next to fresh melt-water turns to stone, so we just need the ice gone.
    for (let t = 0; t < 100 && w.count(E.Ice) > 0; t++) w.tick()
    expect(w.count(E.Ice)).toBe(0)
  })
})

describe('gases', () => {
  it('smoke rises one row per tick and dissipates', () => {
    const w = new World(7, 40, 24)
    w.set(3, 39, E.Smoke, 30)
    w.tick()
    expect(w.count(E.Smoke)).toBe(1)
    // The clock bit stops the bottom-up scan from moving smoke twice per tick.
    const e = extent(w, E.Smoke)
    expect(e.minY).toBeGreaterThanOrEqual(38)
    for (let t = 0; t < 40; t++) w.tick()
    expect(w.count(E.Smoke)).toBe(0)
  })

  it('gas rises and explodes into fire when touched by flame', () => {
    const w = walled(21, 21, 25)
    fillRect(w, 5, 5, 15, 8, E.Gas)
    for (let t = 0; t < 40; t++) w.tick()
    expect(w.count(E.Gas)).toBeGreaterThan(0)
    // Gas is lighter than air: it should have collected under the ceiling.
    expect(extent(w, E.Gas).minY).toBe(1)
    w.set(10, 2, E.Fire, 30)
    let peakFire = 0
    for (let t = 0; t < 60; t++) {
      w.tick()
      peakFire = Math.max(peakFire, w.count(E.Fire))
    }
    expect(peakFire).toBeGreaterThan(20)
  })
})
