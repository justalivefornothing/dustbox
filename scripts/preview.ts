/**
 * Render every preset to docs/presets/<id>.png after a number of ticks.
 *
 *   npx tsx scripts/preview.ts [ticks=240] [scale=1]
 *
 * Uses the same pixel writer as the browser, so what you see here is what the
 * canvas shows (minus the CRT overlay).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { World } from '../src/sim/index'
import { PRESETS, loadPreset } from '../src/sim/presets'
import { renderPixels, createRenderBuffers, upscaleRgba } from '../src/render/pixels'
import { encodePng } from './png'

const ticks = Number(process.argv[2] ?? 240)
const scale = Number(process.argv[3] ?? 1)
const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../docs/presets')
mkdirSync(outDir, { recursive: true })

for (const preset of PRESETS) {
  const world = new World(300, 300, 2024)
  loadPreset(world, preset)
  const t0 = performance.now()
  world.step(ticks)
  const simMs = performance.now() - t0
  const rgba = new Uint8ClampedArray(world.size * 4)
  const buffers = createRenderBuffers(world.width, world.height)
  const t1 = performance.now()
  renderPixels(world, rgba, buffers, { glow: true, frame: ticks })
  const renderMs = performance.now() - t1
  const png = encodePng(upscaleRgba(rgba, world.width, world.height, scale), world.width * scale, world.height * scale)
  const file = resolve(outDir, `${preset.id}.png`)
  writeFileSync(file, png)
  world.tally()
  console.log(
    `${preset.name.padEnd(15)} ${ticks} ticks in ${simMs.toFixed(0).padStart(5)} ms, render ${renderMs.toFixed(1)} ms, ${(world.size - world.counts[0]).toString().padStart(6)} cells -> ${file}`,
  )
}
