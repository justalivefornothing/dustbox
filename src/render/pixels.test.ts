import { describe, expect, it } from 'vitest'
import { createRenderBuffers, renderPixels, upscaleRgba, COLOR_LUT } from './pixels'
import { World } from '../sim/world'
import { E, SPECIES } from '../sim/species'

function px(rgba: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number, number] {
  const o = (y * w + x) * 4
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]]
}

describe('pixel renderer', () => {
  it('writes an opaque RGBA buffer shaped like ImageData.data (4 bytes per cell)', () => {
    const w = new World(16, 12, 1)
    w.paint(8, 6, 3, E.Sand, 'square')
    const rgba = new Uint8ClampedArray(w.size * 4)
    renderPixels(w, rgba, createRenderBuffers(16, 12), { glow: false, frame: 0 })
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255)
    const bg = SPECIES[E.Empty].color
    expect(px(rgba, 16, 0, 0)).toEqual([bg[0], bg[1], bg[2], 255])
    const [r, g, b] = px(rgba, 16, 8, 6)
    const base = SPECIES[E.Sand].color
    // Within the per-cell noise envelope of the base colour.
    expect(Math.abs(r - base[0])).toBeLessThanOrEqual(SPECIES[E.Sand].variation + 1)
    expect(Math.abs(g - base[1])).toBeLessThanOrEqual(SPECIES[E.Sand].variation + 1)
    expect(Math.abs(b - base[2])).toBeLessThanOrEqual(SPECIES[E.Sand].variation + 1)
  })

  it('varies colour per cell using the shade byte', () => {
    const w = new World(32, 1, 2)
    for (let x = 0; x < 32; x++) w.set(x, 0, E.Sand)
    const rgba = new Uint8ClampedArray(w.size * 4)
    renderPixels(w, rgba, createRenderBuffers(32, 1), { glow: false, frame: 0 })
    const reds = new Set<number>()
    for (let x = 0; x < 32; x++) reds.add(px(rgba, 32, x, 0)[0])
    expect(reds.size).toBeGreaterThan(4)
  })

  it('adds glow around hot cells and reports emissive presence', () => {
    const w = new World(32, 32, 3)
    w.paint(16, 16, 2, E.Lava, 'square')
    const plain = new Uint8ClampedArray(w.size * 4)
    const lit = new Uint8ClampedArray(w.size * 4)
    expect(renderPixels(w, plain, createRenderBuffers(32, 32), { glow: false, frame: 0 })).toBe(false)
    expect(renderPixels(w, lit, createRenderBuffers(32, 32), { glow: true, frame: 0 })).toBe(true)
    // A cell just outside the lava is brighter with glow than without.
    const a = px(plain, 32, 16, 12)
    const b = px(lit, 32, 16, 12)
    expect(b[0]).toBeGreaterThan(a[0])
    // Far away nothing changes.
    expect(px(lit, 32, 1, 1)).toEqual(px(plain, 32, 1, 1))
    // A cold scene reports no glow.
    const cold = new World(8, 8, 4)
    cold.paint(4, 4, 2, E.Stone, 'square')
    expect(renderPixels(cold, new Uint8ClampedArray(cold.size * 4), createRenderBuffers(8, 8), { glow: true, frame: 0 })).toBe(false)
  })

  it('upscales by integer factors with crisp pixels', () => {
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    const out = upscaleRgba(src, 2, 1, 3)
    expect(out.length).toBe(6 * 3 * 4)
    expect(px(out, 6, 2, 2)).toEqual([255, 0, 0, 255])
    expect(px(out, 6, 3, 0)).toEqual([0, 255, 0, 255])
    expect(upscaleRgba(src, 2, 1, 1)).toBe(src)
  })

  it('has a complete colour LUT', () => {
    expect(COLOR_LUT.length).toBe(16 * 256 * 3)
  })
})
