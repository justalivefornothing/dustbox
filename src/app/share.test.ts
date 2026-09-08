import { describe, expect, it } from 'vitest'
import { levelFromHash, levelToHash, HASH_PREFIX } from './share'
import { World } from '../sim/world'
import { E } from '../sim/species'

describe('URL hash sharing', () => {
  it('round-trips the species grid through a hash string', () => {
    const w = new World(120, 120, 4)
    w.paint(60, 40, 20, E.Sand, 'circle')
    w.paint(30, 100, 15, E.Water, 'square')
    w.paint(90, 90, 10, E.Lava, 'circle')
    w.step(10)
    const hash = levelToHash(w)
    expect(hash.startsWith(HASH_PREFIX)).toBe(true)
    expect(hash.slice(HASH_PREFIX.length)).not.toMatch(/[\s#;]/) // separators are percent-encoded
    const snap = levelFromHash(hash)!
    expect(snap.width).toBe(120)
    expect(Buffer.from(snap.species).equals(Buffer.from(w.species))).toBe(true)
    expect(snap.reg).toBeUndefined()
  })

  it('is compact for typical scenes', () => {
    const w = new World(300, 300, 5)
    w.paint(150, 220, 80, E.Stone, 'circle')
    w.paint(150, 60, 40, E.Water, 'square')
    expect(levelToHash(w).length).toBeLessThan(8000)
  })

  it('ignores unrelated or malformed hashes', () => {
    expect(levelFromHash('')).toBeNull()
    expect(levelFromHash('#foo')).toBeNull()
    expect(levelFromHash(`${HASH_PREFIX}garbage`)).toBeNull()
    expect(levelFromHash(`${HASH_PREFIX}DB1%3B10%3B10%3BAAAA`)).toBeNull()
  })
})
