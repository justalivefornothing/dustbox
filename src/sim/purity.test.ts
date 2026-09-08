/**
 * Guards the "dependency-free, DOM-free core" promise: every module under
 * src/sim/ may only import other src/sim/ modules, and none may reference
 * browser globals. Also checks package.json for physics / CA libraries.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { World, ELEMENTS, PAINTABLE, elementForKey, E } from './index'

const here = dirname(fileURLToPath(import.meta.url))

const sources = readdirSync(here)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f, text: readFileSync(join(here, f), 'utf8') }))

describe('src/sim purity', () => {
  it('has source files to check', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  it('only imports relative modules from within src/sim', () => {
    const importRe = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm
    for (const { file, text } of sources) {
      for (const m of text.matchAll(importRe)) {
        const spec = m[1]
        expect(spec.startsWith('./'), `${file} imports ${spec}`).toBe(true)
        expect(spec.includes('..'), `${file} escapes src/sim via ${spec}`).toBe(false)
      }
    }
  })

  it('never touches DOM or browser globals', () => {
    const banned = /\b(document|window|navigator|localStorage|HTMLCanvasElement|ImageData|requestAnimationFrame|fetch)\b/
    for (const { file, text } of sources) {
      // Strip comments so prose mentioning "browsers" is not flagged.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(banned.test(code), `${file} references a browser global`).toBe(false)
    }
  })

  it('exports a World class that runs in Node', () => {
    const w = new World(8, 8, 1)
    w.set(3, 0, E.Sand)
    w.tick()
    expect(w.at(3, 1)).toBe(E.Sand)
  })

  it('package.json contains no physics or cellular-automaton libraries', () => {
    const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const suspicious = /(matter|box2d|planck|cannon|rapier|p2|ammo|automaton|cellular|sandspiel|falling|noita|physics)/i
    expect(names.filter((n) => suspicious.test(n))).toEqual([])
  })
})

describe('keyboard mapping', () => {
  it('maps 1-9 and 0 to the ten core elements', () => {
    expect(elementForKey('1')?.id).toBe(E.Sand)
    expect(elementForKey('2')?.id).toBe(E.Water)
    expect(elementForKey('3')?.id).toBe(E.Oil)
    expect(elementForKey('4')?.id).toBe(E.Fire)
    expect(elementForKey('5')?.id).toBe(E.Plant)
    expect(elementForKey('6')?.id).toBe(E.Acid)
    expect(elementForKey('7')?.id).toBe(E.Lava)
    expect(elementForKey('8')?.id).toBe(E.Stone)
    expect(elementForKey('9')?.id).toBe(E.Ice)
    expect(elementForKey('0')?.id).toBe(E.Gas)
    expect(elementForKey('w')?.id).toBe(E.Wall)
    expect(elementForKey('M')?.id).toBe(E.Smoke)
    expect(elementForKey('x')).toBeUndefined()
  })

  it('gives every paintable element a unique single-character key', () => {
    const keys = PAINTABLE.map((e) => e.key)
    expect(keys.every((k) => k.length === 1)).toBe(true)
    expect(new Set(keys).size).toBe(PAINTABLE.length)
    expect(ELEMENTS[E.Empty].key).toBe('')
  })
})
