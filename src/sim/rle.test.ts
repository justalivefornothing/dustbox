import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { rleEncode, rleDecode, bytesToBase64, base64ToBytes, encodeGrid, decodeGrid, resampleSpecies } from './rle'
import { Rng } from './rng'
import { World } from './world'
import { E } from './species'

function randomGrid(n: number, seed: number, maxValue: number): Uint8Array {
  const r = new Rng(seed)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = r.below(maxValue)
  return out
}

describe('RLE', () => {
  it('round-trips a random 300x300 grid', () => {
    const src = randomGrid(300 * 300, 77, 13)
    const packed = rleEncode(src)
    const out = new Uint8Array(src.length)
    expect(rleDecode(packed, out)).toBe(src.length)
    expect(Buffer.from(out).equals(Buffer.from(src))).toBe(true)
  })

  it('compresses runs and splits those longer than 255', () => {
    const src = new Uint8Array(1000).fill(7)
    const packed = rleEncode(src)
    expect(packed.length).toBe(8) // 255+255+255+235
    const out = new Uint8Array(1000)
    rleDecode(packed, out)
    expect(out.every((v) => v === 7)).toBe(true)
  })

  it('handles empty input', () => {
    expect(rleEncode(new Uint8Array(0)).length).toBe(0)
    expect(rleDecode(new Uint8Array(0), new Uint8Array(0))).toBe(0)
  })

  it('refuses to overflow the destination', () => {
    const packed = rleEncode(new Uint8Array(10).fill(1))
    expect(() => rleDecode(packed, new Uint8Array(5))).toThrow(RangeError)
  })

  it('round-trips arbitrary byte arrays (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 2000 }), (bytes) => {
        const out = new Uint8Array(bytes.length)
        rleDecode(rleEncode(bytes), out)
        return Buffer.from(out).equals(Buffer.from(bytes))
      }),
    )
  })
})

describe('base64', () => {
  it('matches Node for random payloads of every length mod 3', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = randomGrid(len, len + 1, 256)
      const ours = bytesToBase64(bytes)
      expect(ours).toBe(Buffer.from(bytes).toString('base64'))
      expect(Buffer.from(base64ToBytes(ours)).equals(Buffer.from(bytes))).toBe(true)
    }
  })

  it('round-trips arbitrary bytes (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 500 }), (bytes) => {
        return Buffer.from(base64ToBytes(bytesToBase64(bytes))).equals(Buffer.from(bytes))
      }),
    )
  })

  it('rejects garbage', () => {
    expect(() => base64ToBytes('@@@')).not.toThrow() // stripped as non-alphabet
    expect(base64ToBytes('').length).toBe(0)
  })
})

describe('grid strings', () => {
  it('round-trips a full world snapshot including registers and shades', () => {
    const w = new World(300, 300, 5)
    w.paint(150, 100, 40, E.Sand, 'circle')
    w.paint(60, 250, 30, E.Water, 'square')
    w.paint(220, 40, 12, E.Fire, 'circle')
    for (let t = 0; t < 30; t++) w.tick()
    const text = encodeGrid(w.snapshot(), true)
    expect(text.startsWith('DB1;300;300;')).toBe(true)
    const snap = decodeGrid(text)
    expect(snap.width).toBe(300)
    expect(snap.height).toBe(300)
    expect(Buffer.from(snap.species).equals(Buffer.from(w.species))).toBe(true)
    expect(Buffer.from(snap.reg!).equals(Buffer.from(w.reg))).toBe(true)
    expect(Buffer.from(snap.shade!).equals(Buffer.from(w.shade))).toBe(true)
  })

  it('is small for a typical scene', () => {
    const w = new World(300, 300, 5)
    w.paint(150, 200, 60, E.Stone, 'circle')
    w.paint(150, 60, 50, E.Water, 'square')
    const text = encodeGrid(w.snapshot(), false)
    expect(text.length).toBeLessThan(6000)
  })

  it('rejects malformed input', () => {
    expect(() => decodeGrid('nope')).toThrow()
    expect(() => decodeGrid('DB1;10;10;AAAA')).toThrow(RangeError)
    expect(() => decodeGrid('DB1;-1;10;AAAA')).toThrow(RangeError)
  })

  it('resamples species between grid sizes', () => {
    const src = new Uint8Array(4 * 4)
    src.fill(2, 0, 8) // top half sand
    const up = resampleSpecies(src, 4, 4, 8, 8)
    expect(up.length).toBe(64)
    expect(up.slice(0, 32).every((v) => v === 2)).toBe(true)
    expect(up.slice(32).every((v) => v === 0)).toBe(true)
    const down = resampleSpecies(up, 8, 8, 4, 4)
    expect(Buffer.from(down).equals(Buffer.from(src))).toBe(true)
  })
})
