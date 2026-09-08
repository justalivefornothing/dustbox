import { describe, expect, it } from 'vitest'
import { buildColorLut, nearestElement } from './palette'
import { SPECIES, E, SPECIES_SLOTS } from './species'

describe('palette', () => {
  it('maps every species base colour back to itself', () => {
    for (const s of SPECIES) {
      const [r, g, b] = s.color
      expect(nearestElement(r, g, b)).toBe(s.id)
    }
  })

  it('tolerates shade noise', () => {
    const lut = buildColorLut()
    for (const s of SPECIES) {
      for (const shade of [0, 64, 128, 200, 255]) {
        const o = ((s.id << 8) | shade) * 3
        expect(nearestElement(lut[o], lut[o + 1], lut[o + 2])).toBe(s.id)
      }
    }
  })

  it('treats transparent pixels as empty', () => {
    expect(nearestElement(255, 255, 255, 0)).toBe(E.Empty)
  })

  it('builds a full lookup table', () => {
    const lut = buildColorLut()
    expect(lut.length).toBe(SPECIES_SLOTS * 256 * 3)
    const o = ((E.Sand << 8) | 128) * 3
    expect(Array.from(lut.slice(o, o + 3))).toEqual([222, 186, 108])
  })
})
