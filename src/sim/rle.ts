/**
 * Run-length codec and grid serialisation.
 *
 * Grids are mostly long runs of the same species, so a byte-pair RLE
 * (run length 1..255, value) shrinks a typical 300x300 scene from 90 KB to
 * a few KB. Worst case (pure noise) doubles the size, which the round-trip
 * test exercises on purpose.
 *
 * Text form: `DB1;<w>;<h>;<species>[;<reg>;<shade>]` where each section is
 * the base64 of the RLE bytes. Presets ship species only; save slots carry
 * all three arrays so fire lifetimes and grain colours survive a reload.
 */

export function rleEncode(src: Uint8Array): Uint8Array {
  // Upper bound: every byte its own run.
  const out = new Uint8Array(src.length * 2 + 2)
  let o = 0
  let i = 0
  const n = src.length
  while (i < n) {
    const v = src[i]
    let run = 1
    while (i + run < n && run < 255 && src[i + run] === v) run++
    out[o++] = run
    out[o++] = v
    i += run
  }
  return out.subarray(0, o)
}

/** Decode into `out`; returns the number of bytes written. Throws on overflow. */
export function rleDecode(packed: Uint8Array, out: Uint8Array): number {
  let o = 0
  const n = packed.length - (packed.length & 1)
  for (let p = 0; p < n; p += 2) {
    const run = packed[p]
    const v = packed[p + 1]
    if (o + run > out.length) throw new RangeError('RLE data overflows target buffer')
    out.fill(v, o, o + run)
    o += run
  }
  return o
}

// -------------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_REV = new Int16Array(128).fill(-1)
for (let i = 0; i < 64; i++) B64_REV[B64.charCodeAt(i)] = i
// Accept URL-safe variants too.
B64_REV['-'.charCodeAt(0)] = 62
B64_REV['_'.charCodeAt(0)] = 63

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  let i = 0
  const n = bytes.length
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    parts.push(B64[(v >>> 18) & 63], B64[(v >>> 12) & 63], B64[(v >>> 6) & 63], B64[v & 63])
  }
  if (i < n) {
    const b0 = bytes[i]
    const b1 = i + 1 < n ? bytes[i + 1] : 0
    const v = (b0 << 16) | (b1 << 8)
    parts.push(B64[(v >>> 18) & 63], B64[(v >>> 12) & 63])
    parts.push(i + 1 < n ? B64[(v >>> 6) & 63] : '=', '=')
  }
  return parts.join('')
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/\-_]/g, '')
  const n = clean.length
  const out = new Uint8Array(Math.floor((n * 3) / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < n; i++) {
    const c = clean.charCodeAt(i)
    const v = c < 128 ? B64_REV[c] : -1
    if (v < 0) throw new SyntaxError(`bad base64 character '${clean[i]}'`)
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >>> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

// ------------------------------------------------------------- grid strings

export interface GridSnapshot {
  width: number
  height: number
  species: Uint8Array
  reg?: Uint8Array
  shade?: Uint8Array
}

export const FORMAT_TAG = 'DB1'

/**
 * How much of the world a grid string carries:
 *   'species'  what is where (presets, shareable levels)
 *   'state'    + registers, so fire lifetimes and flow headings survive
 *   'full'     + per-cell shade noise (incompressible: ~2 bytes per cell)
 * Save slots use 'state' and re-roll shades on load; the visual difference is
 * nil and it keeps a 300x300 save at a few KB instead of 250 KB.
 */
export type GridDetail = 'species' | 'state' | 'full'

export function encodeGrid(snap: GridSnapshot, detail: GridDetail | boolean = 'full'): string {
  const level: GridDetail = detail === true ? 'full' : detail === false ? 'species' : detail
  const parts = [FORMAT_TAG, String(snap.width), String(snap.height), bytesToBase64(rleEncode(snap.species))]
  if (level !== 'species' && snap.reg) {
    parts.push(bytesToBase64(rleEncode(snap.reg)))
    if (level === 'full' && snap.shade) parts.push(bytesToBase64(rleEncode(snap.shade)))
  }
  return parts.join(';')
}

export function decodeGrid(text: string): GridSnapshot {
  const parts = text.trim().split(';')
  if (parts[0] !== FORMAT_TAG || parts.length < 4) throw new SyntaxError('not a Dustbox grid string')
  const width = Number.parseInt(parts[1], 10)
  const height = Number.parseInt(parts[2], 10)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 1 << 24) {
    throw new RangeError('bad grid dimensions')
  }
  const size = width * height
  const species = new Uint8Array(size)
  if (rleDecode(base64ToBytes(parts[3]), species) !== size) throw new RangeError('species length mismatch')
  const snap: GridSnapshot = { width, height, species }
  if (parts.length >= 5) {
    const reg = new Uint8Array(size)
    if (rleDecode(base64ToBytes(parts[4]), reg) !== size) throw new RangeError('register length mismatch')
    snap.reg = reg
  }
  if (parts.length >= 6) {
    const shade = new Uint8Array(size)
    if (rleDecode(base64ToBytes(parts[5]), shade) !== size) throw new RangeError('shade length mismatch')
    snap.shade = shade
  }
  return snap
}

/**
 * Nearest-neighbour resample of a species grid so a preset authored at one
 * size can be dropped into a world of another size.
 */
export function resampleSpecies(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (sw === dw && sh === dh) return src.slice()
  const out = new Uint8Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh))
    const row = sy * sw
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw))
      out[y * dw + x] = src[row + sx]
    }
  }
  return out
}
