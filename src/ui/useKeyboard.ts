import { useEffect } from 'react'
import type { Engine } from '../app/engine'
import { useTools } from '../app/store'
import { elementForKey } from '../sim/elements'
import { E } from '../sim/species'

/** Keys that select an element: 1-9 and 0 (plus W/M for Wall/Smoke), E for eraser. */
export const HOTKEYS: readonly { keys: string; action: string }[] = [
  { keys: '1-9 0', action: 'pick element' },
  { keys: 'W / M', action: 'wall / smoke' },
  { keys: 'E', action: 'eraser' },
  { keys: '[ ]', action: 'brush size (shift: x5)' },
  { keys: 'B', action: 'brush shape' },
  { keys: 'Space', action: 'pause' },
  { keys: 'N', action: 'step one tick' },
  { keys: '- +', action: 'speed' },
  { keys: 'Del', action: 'clear' },
  { keys: 'G / T', action: 'glow / scanlines' },
]

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useKeyboard(engine: Engine): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTyping(e.target)) return
      // Inside an open <dialog>, leave keys alone except Escape (native).
      if (document.querySelector('dialog[open]')) return
      const t = useTools.getState()
      const el = elementForKey(e.key)
      if (el && e.key.length === 1) {
        t.setElement(el.id)
        e.preventDefault()
        return
      }
      switch (e.key) {
        case 'e':
        case 'E':
          t.setElement(E.Empty)
          break
        case '[':
          t.nudgeBrush(e.shiftKey ? -5 : -1)
          break
        case ']':
          t.nudgeBrush(e.shiftKey ? 5 : 1)
          break
        case 'b':
        case 'B':
          t.toggleShape()
          break
        case ' ':
          t.togglePaused()
          break
        case 'n':
        case 'N':
          if (!t.paused) t.setPaused(true)
          engine.stepOnce()
          break
        case '-':
        case '_':
          t.nudgeSpeed(-1)
          break
        case '=':
        case '+':
          t.nudgeSpeed(1)
          break
        case 'Delete':
        case 'Backspace':
          engine.clear()
          break
        case 'g':
        case 'G':
          t.toggleGlow()
          break
        case 't':
        case 'T':
          t.toggleScanlines()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])
}
