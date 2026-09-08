/**
 * Pixel writer: turns a World into RGBA bytes.
 *
 * DOM-free on purpose — the same function feeds an ImageData in the browser,
 * PNG export, and the Node preview/bench scripts. Two passes:
 *
 *   1. base colour: species x shade lookup, with lifetime-driven ramps for
 *      fire and smoke and a cheap sine-table shimmer for liquids
 *   2. glow: emissive intensity (fire, lava, a hint for acid) is box-blurred
 *      twice with running prefix sums (O(n) regardless of radius) and added
 *      on top as warm light; Uint8ClampedArray does the saturation for free
 */
import type { World } from '../sim/world'
import { E, GLOW, SPECIES, SPECIES_SLOTS } from '../sim/species'
import { buildColorLut } from '../sim/palette'

export interface RenderBuffers {
  readonly size: number
  readonly width: number
  readonly height: number
  /** Full-resolution emissive intensity, written by the base pass. */
  readonly emit: Float32Array
  /** Half-resolution copies the blur runs on (4x cheaper, visually identical for a soft glow). */
  readonly loWidth: number
  readonly loHeight: number
  readonly lo: Float32Array
  readonly loTmp: Float32Array
  readonly prefix: Float32Array
}

export interface RenderOptions {
  /** Enable the additive glow pass. */
  glow: boolean
  /** Frame counter driving the liquid shimmer. */
  frame: number
  /** Blur radius of the glow in cells. */
  glowRadius?: number
  /** Overall glow strength multiplier. */
  glowStrength?: number
}

export function createRenderBuffers(width: number, height: number): RenderBuffers {
  const size = width * height
  const loWidth = Math.ceil(width / 2)
  const loHeight = Math.ceil(height / 2)
  return {
    size,
    width,
    height,
    emit: new Float32Array(size),
    loWidth,
    loHeight,
    lo: new Float32Array(loWidth * loHeight),
    loTmp: new Float32Array(loWidth * loHeight),
    prefix: new Float32Array(Math.max(loWidth, loHeight) + 1),
  }
}

/** Shared colour lookup: [((species << 8) | shade) * 3 + c]. */
export const COLOR_LUT: Uint8ClampedArray = buildColorLut()

/** Fire colour ramp by remaining lifetime (0..255): ember red -> white-yellow. */
const FIRE_RAMP = new Uint8ClampedArray(256 * 3)
for (let life = 0; life < 256; life++) {
  const t = Math.min(1, life / 36)
  const o = life * 3
  FIRE_RAMP[o] = 180 + 75 * t
  FIRE_RAMP[o + 1] = 30 + 200 * t * t
  FIRE_RAMP[o + 2] = 8 + 110 * t * t * t
}

/** Smoke fades towards the background as its lifetime runs out. */
const SMOKE_RAMP = new Uint8ClampedArray(256 * 3)
{
  const bg = SPECIES[E.Empty].color
  const sm = SPECIES[E.Smoke].color
  for (let life = 0; life < 256; life++) {
    const t = Math.min(1, life / 70)
    const o = life * 3
    SMOKE_RAMP[o] = bg[0] + (sm[0] - bg[0]) * t
    SMOKE_RAMP[o + 1] = bg[1] + (sm[1] - bg[1]) * t
    SMOKE_RAMP[o + 2] = bg[2] + (sm[2] - bg[2]) * t
  }
}

/** 256-entry sine table in [-1, 1]. */
const SINE = new Float32Array(256)
for (let i = 0; i < 256; i++) SINE[i] = Math.sin((i / 256) * Math.PI * 2)

/** Shimmer amplitude per species (liquids only). */
const SHIMMER = new Float32Array(SPECIES_SLOTS)
SHIMMER[E.Water] = 9
SHIMMER[E.Oil] = 5
SHIMMER[E.Acid] = 14
SHIMMER[E.Lava] = 26

const GLOW_R = 255
const GLOW_G = 128
const GLOW_B = 44

/**
 * Write the world into `rgba` (length = 4 * size). Returns true if any
 * emissive cells were present (useful for deciding whether to composite).
 */
export function renderPixels(world: World, rgba: Uint8ClampedArray, buffers: RenderBuffers, opts: RenderOptions): boolean {
  const { species, reg, shade, size } = world
  const lut = COLOR_LUT
  const frame = opts.frame | 0
  const emit = buffers.emit
  const wantGlow = opts.glow
  let anyGlow = false

  const bg = SPECIES[E.Empty].color
  const bgR = bg[0]
  const bgG = bg[1]
  const bgB = bg[2]

  for (let i = 0, o = 0; i < size; i++, o += 4) {
    const s = species[i]
    if (s === 0) {
      rgba[o] = bgR
      rgba[o + 1] = bgG
      rgba[o + 2] = bgB
      rgba[o + 3] = 255
      if (wantGlow) emit[i] = 0
      continue
    }
    let r: number
    let g: number
    let b: number
    if (s === E.Fire) {
      const life = reg[i]
      const fo = life * 3
      const n = (shade[i] - 128) * 0.15
      r = FIRE_RAMP[fo] + n
      g = FIRE_RAMP[fo + 1] + n
      b = FIRE_RAMP[fo + 2]
      if (wantGlow) {
        emit[i] = 0.55 + Math.min(1, life / 36) * 0.65
        anyGlow = true
      }
    } else if (s === E.Smoke) {
      const so = reg[i] * 3
      const n = (shade[i] - 128) * 0.06
      r = SMOKE_RAMP[so] + n
      g = SMOKE_RAMP[so + 1] + n
      b = SMOKE_RAMP[so + 2] + n
      if (wantGlow) emit[i] = 0
    } else {
      const lo = ((s << 8) | shade[i]) * 3
      r = lut[lo]
      g = lut[lo + 1]
      b = lut[lo + 2]
      const amp = SHIMMER[s]
      if (amp !== 0) {
        const wave = SINE[(frame * 3 + shade[i] * 5 + (i % world.width) * 2) & 255] * amp
        r += wave
        g += wave
        b += wave * 0.6
      }
      if (wantGlow) {
        const gl = GLOW[s]
        if (gl !== 0) {
          emit[i] = s === E.Lava ? gl * (0.75 + 0.25 * SINE[(frame * 2 + shade[i] * 3) & 255]) : gl
          anyGlow = true
        } else {
          emit[i] = 0
        }
      }
    }
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }

  if (wantGlow && anyGlow) {
    const radius = Math.max(1, Math.round((opts.glowRadius ?? 3) / 2))
    downsample2x(buffers)
    blur2d(buffers, radius)
    blur2d(buffers, radius)
    composite(rgba, buffers, opts.glowStrength ?? 1.15)
  }
  return anyGlow
}

/** Average 2x2 blocks of `emit` into the half-resolution `lo` field. */
function downsample2x(buffers: RenderBuffers): void {
  const { width: w, height: h, emit, loWidth: lw, loHeight: lh, lo } = buffers
  for (let ly = 0; ly < lh; ly++) {
    const y0 = ly * 2
    const y1 = y0 + 1 < h ? y0 + 1 : y0
    const r0 = y0 * w
    const r1 = y1 * w
    const lrow = ly * lw
    for (let lx = 0; lx < lw; lx++) {
      const x0 = lx * 2
      const x1 = x0 + 1 < w ? x0 + 1 : x0
      lo[lrow + lx] = (emit[r0 + x0] + emit[r0 + x1] + emit[r1 + x0] + emit[r1 + x1]) * 0.25
    }
  }
}

/** Separable box blur of `buffers.lo` in place using prefix sums. */
function blur2d(buffers: RenderBuffers, radius: number): void {
  const { loWidth: w, loHeight: h, lo: src, loTmp: tmp, prefix } = buffers
  const norm = 1 / (radius * 2 + 1)
  // Horizontal: src -> tmp
  for (let y = 0; y < h; y++) {
    const row = y * w
    prefix[0] = 0
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + src[row + x]
    for (let x = 0; x < w; x++) {
      const lo = x - radius < 0 ? 0 : x - radius
      const hi = x + radius + 1 > w ? w : x + radius + 1
      tmp[row + x] = (prefix[hi] - prefix[lo]) * norm
    }
  }
  // Vertical: tmp -> src
  for (let x = 0; x < w; x++) {
    prefix[0] = 0
    for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      const lo = y - radius < 0 ? 0 : y - radius
      const hi = y + radius + 1 > h ? h : y + radius + 1
      src[y * w + x] = (prefix[hi] - prefix[lo]) * norm
    }
  }
}

/**
 * Add the blurred half-res glow onto the RGBA buffer with bilinear
 * upsampling. Rows that are completely dark are skipped early, which is the
 * common case: glow is usually confined to one part of the scene.
 */
function composite(rgba: Uint8ClampedArray, buffers: RenderBuffers, strength: number): void {
  const { width: w, height: h, loWidth: lw, loHeight: lh, lo, loTmp: row } = buffers
  const kR = GLOW_R * strength
  const kG = GLOW_G * strength
  const kB = GLOW_B * strength
  for (let y = 0; y < h; y++) {
    // Pixel centre (y + 0.5) maps to half-res coordinate y/2 - 0.25: even
    // rows sit 3/4 of the way from lo row y/2-1 to y/2, odd rows 1/4 of the
    // way from (y-1)/2 to (y+1)/2. Same for x, so no per-pixel floor() is needed.
    const odd = y & 1
    let ya = odd ? (y - 1) >> 1 : (y >> 1) - 1
    let yb = ya + 1
    const wb = odd ? 0.25 : 0.75
    if (ya < 0) ya = 0
    if (yb >= lh) yb = lh - 1
    const rowA = ya * lw
    const rowB = yb * lw
    // Vertically interpolate this row of the half-res field, tracking whether
    // anything is lit so dark rows are skipped in O(lw) instead of O(w).
    let live = false
    for (let lx = 0; lx < lw; lx++) {
      const a = lo[rowA + lx]
      const v = a + (lo[rowB + lx] - a) * wb
      row[lx] = v
      if (v > 0.004) live = true
    }
    if (!live) continue
    let o = y * w * 4
    let prev = row[0]
    for (let lx = 0; lx < lw; lx++) {
      const cur = row[lx]
      const next = lx + 1 < lw ? row[lx + 1] : cur
      // Pixel 2*lx leans on the previous sample, pixel 2*lx+1 on the next.
      const e0 = prev * 0.25 + cur * 0.75
      if (e0 > 0.004) {
        rgba[o] += kR * e0
        rgba[o + 1] += kG * e0
        rgba[o + 2] += kB * e0
      }
      o += 4
      if (lx * 2 + 1 < w) {
        const e1 = cur * 0.75 + next * 0.25
        if (e1 > 0.004) {
          rgba[o] += kR * e1
          rgba[o + 1] += kG * e1
          rgba[o + 2] += kB * e1
        }
        o += 4
      }
      prev = cur
    }
  }
}

/** Nearest-neighbour upscale of an RGBA buffer by an integer factor. */
export function upscaleRgba(src: Uint8ClampedArray, w: number, h: number, scale: number): Uint8ClampedArray {
  if (scale === 1) return src
  const dw = w * scale
  const out = new Uint8ClampedArray(dw * h * scale * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4
      const r = src[si]
      const g = src[si + 1]
      const b = src[si + 2]
      const a = src[si + 3]
      for (let dy = 0; dy < scale; dy++) {
        let di = ((y * scale + dy) * dw + x * scale) * 4
        for (let dx = 0; dx < scale; dx++, di += 4) {
          out[di] = r
          out[di + 1] = g
          out[di + 2] = b
          out[di + 3] = a
        }
      }
    }
  }
  return out
}
