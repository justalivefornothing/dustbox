/**
 * Builds the five preset scenes procedurally and writes them to
 * src/sim/presets.data.ts as species-only RLE strings.
 *
 *   npm run gen:presets
 *
 * The generator is deterministic (seeded) so re-running it produces the same
 * file. Scenes are authored at 300x300 and resampled on load for 200/400.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { E, Rng, encodeGrid } from '../src/sim/index'

const W = 300
const H = 300

class Canvas {
  readonly g = new Uint8Array(W * H)
  readonly rng: Rng
  constructor(seed: number) {
    this.rng = new Rng(seed)
  }
  set(x: number, y: number, s: number): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    this.g[y * W + x] = s
  }
  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= W || y >= H) return E.Wall
    return this.g[y * W + x]
  }
  rect(x0: number, y0: number, x1: number, y1: number, s: number, density = 256): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (density >= 256 || this.rng.chance(density)) this.set(x, y, s)
    }
  }
  disc(cx: number, cy: number, r: number, s: number, density = 256): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r * r && (density >= 256 || this.rng.chance(density))) this.set(x, y, s)
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, s: number): void {
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const nx = (x - cx) / rx
        const ny = (y - cy) / ry
        if (nx * nx + ny * ny <= 1) this.set(x, y, s)
      }
    }
  }
  /** Thick line between two points. */
  line(x0: number, y0: number, x1: number, y1: number, thick: number, s: number): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let k = 0; k <= steps; k++) {
      const t = steps === 0 ? 0 : k / steps
      this.disc(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), thick, s)
    }
  }
  /** Fill below a height-field: y > ground(x) becomes `s`. */
  terrain(ground: (x: number) => number, s: number, yMax = H - 1): void {
    for (let x = 0; x < W; x++) {
      const gy = Math.round(ground(x))
      for (let y = Math.max(0, gy); y <= yMax; y++) this.set(x, y, s)
    }
  }
  border(s = E.Wall): void {
    this.rect(0, 0, W - 1, 0, s)
    this.rect(0, H - 1, W - 1, H - 1, s)
    this.rect(0, 0, 0, H - 1, s)
    this.rect(W - 1, 0, W - 1, H - 1, s)
  }
  encode(): string {
    return encodeGrid({ width: W, height: H, species: this.g }, false)
  }
}

/** Cheap 1-D value noise for organic outlines. */
function noise1d(rng: Rng, points: number, amp: number): (x: number) => number {
  const ctrl = Array.from({ length: points + 1 }, () => (rng.float() * 2 - 1) * amp)
  return (x: number) => {
    const t = (x / W) * points
    const i = Math.min(points - 1, Math.floor(t))
    const f = t - i
    const s = f * f * (3 - 2 * f)
    return ctrl[i] * (1 - s) + ctrl[i + 1] * s
  }
}

function volcano(): Canvas {
  const c = new Canvas(101)
  const n = noise1d(c.rng, 14, 6)
  // Mountain
  c.terrain((x) => 300 - Math.max(0, 175 - Math.abs(x - 150) * 1.15) + n(x), E.Stone)
  // Sandy foothills
  c.terrain((x) => Math.min(H - 1, 262 - Math.max(0, 40 - Math.abs(x - 40) * 0.6) + n(x + 50)), E.Sand, 268)
  c.terrain((x) => Math.min(H - 1, 262 - Math.max(0, 40 - Math.abs(x - 262) * 0.6) + n(x + 90)), E.Sand, 268)
  // Chamber + vent
  c.ellipse(150, 245, 46, 26, E.Lava)
  c.rect(146, 128, 153, 245, E.Lava)
  // Crater lip filled with lava so it spills right away
  c.ellipse(150, 128, 16, 6, E.Empty)
  c.ellipse(150, 130, 14, 5, E.Lava)
  // Lakes
  c.rect(1, 280, 46, 298, E.Water)
  c.rect(254, 280, 298, 298, E.Water)
  // Greenery on the flanks
  for (let k = 0; k < 14; k++) {
    const x = 20 + c.rng.below(80)
    const gy = 300 - Math.max(0, 175 - Math.abs(x - 150) * 1.15) + n(x)
    c.disc(x, Math.round(gy) - 3, 3 + c.rng.below(4), E.Plant, 200)
    const x2 = 200 + c.rng.below(80)
    const gy2 = 300 - Math.max(0, 175 - Math.abs(x2 - 150) * 1.15) + n(x2)
    c.disc(x2, Math.round(gy2) - 3, 3 + c.rng.below(4), E.Plant, 200)
  }
  c.border()
  return c
}

function rainOnGarden(): Canvas {
  const c = new Canvas(202)
  const n = noise1d(c.rng, 10, 10)
  c.terrain((x) => 258 + n(x), E.Sand)
  c.terrain((x) => 280 + n(x + 77) * 0.5, E.Stone)
  // Stone planters
  c.rect(30, 236, 90, 240, E.Stone)
  c.rect(30, 236, 33, 256, E.Stone)
  c.rect(87, 236, 90, 256, E.Stone)
  c.rect(200, 226, 270, 230, E.Stone)
  c.rect(200, 226, 203, 256, E.Stone)
  c.rect(267, 226, 270, 256, E.Stone)
  // Seedlings
  for (let k = 0; k < 26; k++) {
    const x = 8 + c.rng.below(284)
    const gy = Math.round(258 + n(x))
    c.disc(x, gy - 2, 1 + c.rng.below(3), E.Plant)
  }
  c.rect(36, 244, 84, 256, E.Water)
  c.rect(206, 236, 264, 256, E.Water)
  c.disc(60, 243, 3, E.Plant)
  c.disc(235, 233, 3, E.Plant)
  // Rain
  c.rect(1, 1, 298, 150, E.Water, 14)
  c.border()
  return c
}

function oilSpill(): Canvas {
  const c = new Canvas(303)
  const n = noise1d(c.rng, 8, 8)
  c.rect(1, 190, 298, 298, E.Water)
  c.rect(1, 170, 298, 189, E.Oil)
  // Seabed
  c.terrain((x) => 284 + n(x), E.Sand)
  // Islands
  c.ellipse(70, 192, 34, 26, E.Stone)
  c.ellipse(70, 176, 26, 10, E.Sand)
  c.ellipse(232, 196, 40, 30, E.Stone)
  c.ellipse(232, 176, 30, 12, E.Sand)
  // Palms
  c.disc(66, 160, 5, E.Plant, 210)
  c.disc(240, 158, 6, E.Plant, 210)
  c.line(66, 165, 66, 172, 0, E.Plant)
  c.line(240, 164, 240, 172, 0, E.Plant)
  // A campfire that is about to get out of hand
  c.disc(96, 165, 2, E.Lava)
  // Tanker hull dripping oil
  c.rect(130, 118, 184, 124, E.Wall)
  c.rect(126, 124, 188, 132, E.Wall)
  c.rect(140, 132, 174, 136, E.Wall)
  c.rect(133, 126, 181, 131, E.Oil)
  c.rect(154, 132, 160, 136, E.Oil)
  c.border()
  return c
}

function acidBath(): Canvas {
  const c = new Canvas(404)
  // Hopper of acid with a narrow spout
  c.line(60, 40, 138, 110, 1, E.Wall)
  c.line(240, 40, 162, 110, 1, E.Wall)
  c.rect(138, 110, 141, 126, E.Wall)
  c.rect(159, 110, 162, 126, E.Wall)
  c.rect(62, 20, 238, 40, E.Wall)
  c.rect(62, 22, 238, 40, E.Empty)
  for (let y = 41; y < 108; y++) {
    const half = 88 - (y - 40) * 1.14
    c.rect(Math.round(150 - half) + 2, y, Math.round(150 + half) - 2, y, E.Acid)
  }
  // Layered targets: stone shelf, sand block, plant hedge, ice slab
  c.rect(90, 160, 210, 168, E.Stone)
  c.rect(110, 168, 190, 200, E.Sand)
  c.rect(60, 210, 240, 216, E.Stone)
  c.rect(70, 216, 230, 236, E.Plant)
  c.rect(40, 250, 260, 258, E.Ice)
  c.rect(120, 258, 180, 296, E.Stone)
  // Wall cradle so acid pools on the layers rather than escaping
  c.rect(58, 160, 60, 258, E.Wall)
  c.rect(240, 160, 242, 258, E.Wall)
  c.border()
  return c
}

function iceCave(): Canvas {
  const c = new Canvas(505)
  c.rect(0, 0, W - 1, H - 1, E.Stone)
  // Carve the cave
  c.ellipse(150, 170, 128, 100, E.Empty)
  c.ellipse(70, 110, 50, 40, E.Empty)
  c.ellipse(230, 100, 60, 36, E.Empty)
  c.ellipse(150, 60, 40, 30, E.Empty)
  // Pool at the bottom
  for (let y = 226; y < 270; y++) {
    for (let x = 22; x < 278; x++) {
      const nx = (x - 150) / 128
      const ny = (y - 170) / 100
      if (nx * nx + ny * ny <= 1) c.set(x, y, E.Water)
    }
  }
  // Ice: ceiling crust + stalactites + floes
  for (let x = 22; x < 278; x++) {
    const nx = (x - 150) / 128
    const top = 170 - Math.sqrt(Math.max(0, 1 - nx * nx)) * 100
    c.rect(x, Math.round(top), Math.round(top) + 5 + (c.rng.next() & 3), x, E.Ice)
  }
  for (let k = 0; k < 9; k++) {
    const x = 40 + k * 28 + c.rng.below(10)
    const nx = (x - 150) / 128
    const top = 170 - Math.sqrt(Math.max(0, 1 - nx * nx)) * 100
    const len = 14 + c.rng.below(30)
    c.line(x, Math.round(top) + 4, x, Math.round(top) + 4 + len, 2, E.Ice)
    c.set(x, Math.round(top) + 5 + len, E.Ice)
  }
  c.disc(90, 224, 9, E.Ice)
  c.disc(200, 226, 12, E.Ice)
  c.ellipse(150, 222, 20, 5, E.Ice)
  // Crystal sand drifts
  c.disc(50, 260, 16, E.Sand)
  c.disc(250, 262, 14, E.Sand)
  // Volcanic hot spot beneath the floor and a trapped gas pocket
  c.ellipse(150, 282, 30, 10, E.Lava)
  c.rect(143, 268, 157, 272, E.Stone)
  c.rect(146, 272, 154, 276, E.Empty)
  c.ellipse(228, 92, 30, 14, E.Gas)
  // Overgrowth on a ledge
  c.rect(24, 150, 60, 154, E.Stone)
  c.disc(42, 146, 5, E.Plant, 220)
  return c
}

const scenes = [
  {
    id: 'volcano',
    name: 'Volcano',
    blurb: 'A stone cone with a lava chamber. Lava spills, meets the lakes and hardens; the forest is doomed.',
    canvas: volcano(),
  },
  {
    id: 'rain-on-garden',
    name: 'Rain on Garden',
    blurb: 'Seedlings in sandy soil under a shower. Watch plants drink the rain and swallow the planters.',
    canvas: rainOnGarden(),
  },
  {
    id: 'oil-spill',
    name: 'Oil Spill',
    blurb: 'A tanker leaks over a sea already slicked with oil. One campfire is all it takes.',
    canvas: oilSpill(),
  },
  {
    id: 'acid-bath',
    name: 'Acid Bath',
    blurb: 'A hopper of acid drains onto stone, sand, plant and ice. See what survives.',
    canvas: acidBath(),
  },
  {
    id: 'ice-cave',
    name: 'Ice Cave',
    blurb: 'Frost and stalactites over a cold pool, with something hot stirring under the floor.',
    canvas: iceCave(),
  },
]

const lines: string[] = [
  '/* eslint-disable */',
  '// GENERATED by scripts/gen-presets.ts — do not edit by hand. Run `npm run gen:presets`.',
  '',
  'export interface PresetData {',
  '  readonly id: string',
  '  readonly name: string',
  '  readonly blurb: string',
  '  /** Species-only grid in Dustbox RLE text format (see src/sim/rle.ts). */',
  '  readonly rle: string',
  '}',
  '',
  'export const PRESET_DATA: readonly PresetData[] = [',
]
let total = 0
for (const s of scenes) {
  const rle = s.canvas.encode()
  total += rle.length
  lines.push('  {')
  lines.push(`    id: ${JSON.stringify(s.id)},`)
  lines.push(`    name: ${JSON.stringify(s.name)},`)
  lines.push(`    blurb: ${JSON.stringify(s.blurb)},`)
  lines.push(`    rle:\n      ${JSON.stringify(rle)},`)
  lines.push('  },')
  console.log(`${s.name.padEnd(16)} ${rle.length.toString().padStart(6)} chars`)
}
lines.push(']', '')

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../src/sim/presets.data.ts')
writeFileSync(out, lines.join('\n'))
console.log(`wrote ${out} (${total} chars total)`)
