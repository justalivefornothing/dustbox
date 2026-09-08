import { describe, expect, it } from 'vitest'
import { speciesFromRgba, loadSpecies } from './pngio'
import { SPECIES, E } from '../sim/species'
import { World } from '../sim/world'
import { createRenderBuffers, renderPixels } from '../render/pixels'

function paintRgba(w: number, h: number, fill: (x: number, y: number) => readonly [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y)
      const o = (y * w + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  }
  return out
}

describe('PNG import mapping', () => {
  it('snaps every element base colour to that element', () => {
    for (const s of SPECIES) {
      const rgba = paintRgba(2, 2, () => [s.color[0], s.color[1], s.color[2], 255])
      const grid = speciesFromRgba(rgba, 2, 2, 2, 2)
      expect(Array.from(grid)).toEqual([s.id, s.id, s.id, s.id])
    }
  })

  it('treats transparent pixels as empty and resamples to the grid size', () => {
    // 4x4 image: left half sand, right half transparent.
    const sand = SPECIES[E.Sand].color
    const rgba = paintRgba(4, 4, (x) => (x < 2 ? [sand[0], sand[1], sand[2], 255] : [0, 0, 0, 0]))
    const grid = speciesFromRgba(rgba, 4, 4, 8, 6)
    expect(grid.length).toBe(48)
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 8; x++) expect(grid[y * 8 + x]).toBe(x < 4 ? E.Sand : E.Empty)
    }
  })

  it('round-trips a rendered world back to the same species grid', () => {
    const w = new World(64, 64, 11)
    w.paint(20, 20, 8, E.Water, 'circle')
    w.paint(44, 40, 10, E.Stone, 'square')
    w.paint(10, 55, 5, E.Plant, 'circle')
    w.paint(50, 10, 6, E.Ice, 'square')
    const rgba = new Uint8ClampedArray(w.size * 4)
    renderPixels(w, rgba, createRenderBuffers(64, 64), { glow: false, frame: 0 })
    const grid = speciesFromRgba(rgba, 64, 64, 64, 64)
    expect(Buffer.from(grid).equals(Buffer.from(w.species))).toBe(true)
    const w2 = new World(64, 64, 12)
    loadSpecies(w2, grid)
    expect(Buffer.from(w2.species).equals(Buffer.from(w.species))).toBe(true)
  })

  it('rejects undersized buffers', () => {
    expect(() => speciesFromRgba(new Uint8ClampedArray(8), 4, 4, 4, 4)).toThrow(RangeError)
  })
})
