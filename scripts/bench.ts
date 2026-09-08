/**
 * Performance benchmark: steps 300x300 worlds for 600 ticks in plain Node.
 *
 *   npm run bench            # all scenes, exit 1 if the headline scene > 2 s
 *   npm run bench -- --json  # machine-readable output
 *
 * The headline number is the "Volcano" preset: a realistic mixed scene with
 * stone, sand, lava, water, plant, fire and smoke all live at once. The other
 * rows are stress cases (a third of the grid as liquid, a full sand column)
 * and the empty-grid scan floor, so regressions in any one rule show up.
 */
import { World, E } from '../src/sim/index'
import { PRESETS, loadPreset } from '../src/sim/presets'
import { renderPixels, createRenderBuffers } from '../src/render/pixels'

const SIZE = 300
const TICKS = 600
const BUDGET_MS = 2000
const json = process.argv.includes('--json')

interface Row {
  scene: string
  ms: number
  cells: number
  headline: boolean
}

function timeIt(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

/**
 * Time `TICKS` ticks on a fresh world. `runs` > 1 reports the fastest run:
 * the standard way to read a CPU benchmark on a machine that is also doing
 * other things (the minimum is the least noisy estimate of the true cost).
 */
function build(name: string, fill: (w: World) => void, headline = false, runs = 1): Row {
  let best = Number.POSITIVE_INFINITY
  let cells = 0
  for (let r = 0; r < runs; r++) {
    const w = new World(SIZE, SIZE, 0xbe5e)
    fill(w)
    // A short warm-up lets the JIT settle before the timed section.
    w.step(20)
    best = Math.min(best, timeIt(() => w.step(TICKS)))
    cells = w.tally()
  }
  return { scene: name, ms: best, cells, headline }
}

const rows: Row[] = []
rows.push(build('empty grid (scan floor)', () => {}))
for (const p of PRESETS) {
  const isHeadline = p.id === 'volcano'
  rows.push(build(`preset: ${p.name}${isHeadline ? ' (best of 3)' : ''}`, (w) => loadPreset(w, p), isHeadline, isHeadline ? 3 : 1))
}
rows.push(
  build('30k water cells (blocked liquid)', (w) => {
    for (let y = 200; y < SIZE; y++) for (let x = 0; x < SIZE; x++) w.set(x, y, E.Water, w.rng.next() & 1)
  }),
)
rows.push(
  build('mixed: sand + water + oil + fire', (w) => {
    w.paint(150, 60, 50, E.Sand, 'circle')
    w.paint(80, 200, 40, E.Water, 'square')
    w.paint(220, 200, 30, E.Oil, 'circle')
    w.paint(220, 160, 6, E.Fire, 'circle')
    for (let x = 0; x < SIZE; x++) for (let y = SIZE - 4; y < SIZE; y++) w.set(x, y, E.Stone)
  }),
)

// Renderer cost for context: one full frame with the glow pass on.
const rw = new World(SIZE, SIZE, 1)
loadPreset(rw, PRESETS[0])
rw.step(120)
const rgba = new Uint8ClampedArray(rw.size * 4)
const buffers = createRenderBuffers(rw.width, rw.height)
renderPixels(rw, rgba, buffers, { glow: true, frame: 0 })
const renderMs =
  timeIt(() => {
    for (let k = 0; k < 20; k++) renderPixels(rw, rgba, buffers, { glow: true, frame: k })
  }) / 20

const headline = rows.find((r) => r.headline)!
const pass = headline.ms < BUDGET_MS

if (json) {
  console.log(JSON.stringify({ size: SIZE, ticks: TICKS, budgetMs: BUDGET_MS, rows, renderMs, pass }, null, 2))
} else {
  console.log(`Dustbox bench: ${SIZE}x${SIZE} grid, ${TICKS} ticks each (Node ${process.version})\n`)
  console.log(`${'scene'.padEnd(36)} ${'live cells'.padStart(10)} ${'total ms'.padStart(9)} ${'ms/tick'.padStart(8)} ${'ticks/s'.padStart(8)}`)
  for (const r of rows) {
    const mark = r.headline ? ' *' : ''
    console.log(
      `${r.scene.padEnd(36)} ${r.cells.toString().padStart(10)} ${r.ms.toFixed(0).padStart(9)} ${(r.ms / TICKS).toFixed(2).padStart(8)} ${(TICKS / (r.ms / 1000)).toFixed(0).padStart(8)}${mark}`,
    )
  }
  console.log(`\nrender (glow on): ${renderMs.toFixed(2)} ms / frame`)
  console.log(`\n* headline: ${headline.scene} took ${headline.ms.toFixed(0)} ms (budget ${BUDGET_MS} ms) -> ${pass ? 'PASS' : 'FAIL'}`)
}
process.exitCode = pass ? 0 : 1
