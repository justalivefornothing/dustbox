// Interactive UI check: drives the built app in headless Edge and asserts the
// main behaviours (painting, hotkeys, pause/step, presets, slots, export).
// Usage: node scripts/interact.mjs --port 5403   (requires `npm run build` first)
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('C:/Users/Bhavy/portfolio-projects/.qa/package.json')
const { chromium } = require('playwright')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 5403)

function waitForPort(p, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.createConnection({ port: p, host: '127.0.0.1' })
      s.once('connect', () => { s.destroy(); resolve() })
      s.once('error', () => { s.destroy(); if (Date.now() - start > timeoutMs) reject(new Error('port never opened')); else setTimeout(tryOnce, 300) })
    }
    tryOnce()
  })
}

const server = spawn('npx.cmd', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: dir, stdio: 'ignore', shell: true })
const results = []
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`) }
let browser
try {
  await waitForPort(port)
  browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)

  const hud = async (label) => {
    const txt = await page.locator('aside[aria-label="Simulation stats"]').innerText()
    const m = txt.match(new RegExp(`${label}\\s+([\\d,]+)`, 'i'))
    return m ? Number(m[1].replace(/,/g, '')) : NaN
  }
  const counts = async () => {
    const txt = await page.locator('ul[aria-label="Cell count per element"]').innerText()
    const out = {}
    for (const m of txt.matchAll(/([A-Za-z]+)\s+([\d,]+)/g)) out[m[1]] = Number(m[2].replace(/,/g, ''))
    return out
  }

  // 1. Clear, then paint sand with the mouse; sand count rises.
  await page.click('button[title^="Clear the grid"]')
  await page.waitForTimeout(700)
  const c0 = await counts()
  check('clear empties the grid', c0.Sand === 0 && c0.Stone === 0, JSON.stringify(c0))
  const canvas = page.locator('canvas.sim-canvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const c1 = await counts()
  check('mouse drag paints sand', c1.Sand > 100, `sand=${c1.Sand}`)

  // 2. Hotkey 2 selects water, ] grows brush, space pauses.
  await page.keyboard.press('2')
  check('hotkey 2 selects Water', (await page.locator('button.swatch[aria-pressed="true"]').innerText()).includes('WATER'))
  const size0 = Number(await page.locator('input[aria-label="Brush size"]').inputValue())
  await page.keyboard.press(']')
  await page.keyboard.press(']')
  const size1 = Number(await page.locator('input[aria-label="Brush size"]').inputValue())
  check('] increases brush size', size1 === size0 + 2, `${size0} -> ${size1}`)
  await page.keyboard.press('Shift+[')
  check('shift+[ shrinks brush by 5', Number(await page.locator('input[aria-label="Brush size"]').inputValue()) === Math.max(1, size1 - 5))
  await page.keyboard.press('e')
  check('E selects eraser', (await page.locator('button.swatch[aria-pressed="true"]').innerText()).includes('ERASE'))
  await page.keyboard.press('1')

  await page.keyboard.press(' ')
  await page.waitForTimeout(1200)
  const tickA = await hud('Tick')
  await page.waitForTimeout(1200)
  const tickB = await hud('Tick')
  check('space pauses the simulation', tickA === tickB && (await page.locator('button[aria-pressed="true"]:has-text("Play")').count()) === 1, `${tickA}=${tickB}`)

  // 3. N steps exactly once (read generation via HUD after refresh interval).
  await page.keyboard.press('n')
  await page.keyboard.press('n')
  await page.keyboard.press('n')
  await page.waitForTimeout(1200)
  const tickC = await hud('Tick')
  check('N steps one tick each', tickC === tickB + 3, `${tickB} -> ${tickC}`)
  await page.keyboard.press(' ')

  // 4. Preset load.
  await page.selectOption('select[aria-label="Load a preset scene"]', 'ice-cave')
  await page.waitForTimeout(900)
  const c2 = await counts()
  check('preset Ice Cave loads', c2.Ice > 500 && c2.Stone > 10000, `ice=${c2.Ice} stone=${c2.Stone}`)

  // 5. Speed select changes ticks/s.
  await page.selectOption('select[aria-label="Simulation speed"]', '0.25')
  await page.waitForTimeout(1600)
  const tps = await hud('Ticks/s')
  check('0.25x speed runs ~15 ticks/s', tps >= 10 && tps <= 20, `tps=${tps}`)
  await page.selectOption('select[aria-label="Simulation speed"]', '1')

  // 6. Slots: save then load restores.
  await page.click('button:has-text("Slots")')
  await page.waitForTimeout(300)
  await page.fill('input[aria-label="Name for slot 1"]', 'Test cave')
  await page.click('dialog li:nth-child(1) button:has-text("Save")')
  await page.waitForTimeout(300)
  const slotMeta = await page.locator('dialog li:nth-child(1)').innerText()
  check('slot 1 saved with metadata', /300x300/.test(slotMeta) && /cells/.test(slotMeta), slotMeta.replace(/\s+/g, ' ').slice(0, 80))
  const stored = await page.evaluate(() => localStorage.getItem('dustbox:slot:0'))
  check('slot stored as RLE grid string', stored && JSON.parse(stored).grid.startsWith('DB1;300;300;'), `${stored?.length} bytes`)
  await page.keyboard.press('Escape')
  await page.click('button[title^="Clear the grid"]')
  await page.waitForTimeout(700)
  await page.click('button:has-text("Slots")')
  await page.waitForTimeout(300)
  await page.click('dialog li:nth-child(1) button:has-text("Load")')
  await page.waitForTimeout(900)
  const c3 = await counts()
  check('slot load restores the scene', c3.Stone > 10000, `stone=${c3.Stone}`)

  // 7. Export triggers a PNG download via toBlob.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.selectOption('select[aria-label="Export the canvas as a PNG"]', '2'),
  ])
  check('PNG export downloads', download.suggestedFilename() === 'dustbox-300x300-2x.png', download.suggestedFilename())

  // 8. Grid size switch rebuilds the canvas.
  await page.selectOption('select[aria-label="Grid size"]', '200')
  await page.waitForTimeout(1200)
  const attrs = await page.locator('canvas.sim-canvas').evaluate((c) => [c.width, c.height, getComputedStyle(c).imageRendering])
  check('grid 200 rebuilds canvas at 200x200 with pixelated rendering', attrs[0] === 200 && attrs[1] === 200 && attrs[2] === 'pixelated', JSON.stringify(attrs))
  const c4 = await counts()
  check('200 grid still simulates (volcano loaded)', c4.Lava > 500, `lava=${c4.Lava}`)

  // 9. CRT / glow toggles and touch painting.
  await page.keyboard.press('t')
  check('T toggles CRT', (await page.locator('button:has-text("CRT")').getAttribute('aria-pressed')) === 'false')
  await page.keyboard.press('g')
  check('G toggles glow', (await page.locator('button:has-text("Glow")').getAttribute('aria-pressed')) === 'false')

  // 10. Share puts the level in the hash; a fresh page with that hash loads it.
  await page.selectOption('select[aria-label="Load a preset scene"]', 'acid-bath')
  await page.waitForTimeout(400)
  await page.click('button:has-text("Share")')
  await page.waitForTimeout(300)
  const hash = await page.evaluate(() => location.hash)
  check('share writes level hash', hash.startsWith('#level=DB1'), `${hash.length} chars`)
  const page2 = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  page2.on('pageerror', (e) => errors.push(String(e)))
  await page2.goto(`http://127.0.0.1:${port}/${hash}`, { waitUntil: 'load' })
  await page2.waitForTimeout(1200)
  const txt2 = await page2.locator('ul[aria-label="Cell count per element"]').innerText()
  const acid = Number((txt2.match(/Acid\s+([\d,]+)/) || [])[1]?.replace(/,/g, '') ?? 0)
  check('shared link reloads the level', acid > 500, `acid=${acid}`)
  await page2.close()

  check('no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 200))
} catch (e) {
  console.log('ERROR', e)
  results.push({ name: 'script', ok: false })
} finally {
  await browser?.close()
  server.kill()
  spawn('taskkill', ['/F', '/T', '/PID', String(server.pid)], { shell: true, stdio: 'ignore' })
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
