/**
 * UI/tool state. The simulation itself lives in the Engine (a plain class,
 * not React state) so painting and ticking never go through a re-render.
 */
import { create } from 'zustand'
import { E } from '../sim/species'
import type { BrushShape } from '../sim/world'

export type GridSize = 200 | 300 | 400
export const GRID_SIZES: readonly GridSize[] = [200, 300, 400]
export const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4]
export const MIN_BRUSH = 1
export const MAX_BRUSH = 40

export interface ToolState {
  /** Species id being painted; `E.Empty` is the eraser. */
  element: number
  brushSize: number
  shape: BrushShape
  paused: boolean
  speed: number
  gridSize: GridSize
  scanlines: boolean
  glow: boolean
  /** Toast/status line shown in the top bar for a moment. */
  status: string | null

  setElement(id: number): void
  setBrushSize(n: number): void
  nudgeBrush(delta: number): void
  setShape(shape: BrushShape): void
  toggleShape(): void
  setPaused(paused: boolean): void
  togglePaused(): void
  setSpeed(speed: number): void
  nudgeSpeed(dir: 1 | -1): void
  setGridSize(size: GridSize): void
  toggleScanlines(): void
  toggleGlow(): void
  setStatus(message: string | null): void
}

const clampBrush = (n: number): number => Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(n)))

const SETTINGS_KEY = 'dustbox:settings'

interface PersistedSettings {
  scanlines?: boolean
  glow?: boolean
  gridSize?: GridSize
}

function readSettings(): PersistedSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY)
    if (!raw) return {}
    const s = JSON.parse(raw) as PersistedSettings
    return {
      scanlines: typeof s.scanlines === 'boolean' ? s.scanlines : undefined,
      glow: typeof s.glow === 'boolean' ? s.glow : undefined,
      gridSize: GRID_SIZES.includes(s.gridSize as GridSize) ? s.gridSize : undefined,
    }
  } catch {
    return {}
  }
}

function writeSettings(s: PersistedSettings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage may be unavailable (private mode, quota); settings are a nicety.
  }
}

const initial = readSettings()

export const useTools = create<ToolState>((set, get) => ({
  element: E.Sand,
  brushSize: 6,
  shape: 'circle',
  paused: false,
  speed: 1,
  gridSize: initial.gridSize ?? 300,
  scanlines: initial.scanlines ?? true,
  glow: initial.glow ?? true,
  status: null,

  setElement: (element) => set({ element }),
  setBrushSize: (n) => set({ brushSize: clampBrush(n) }),
  nudgeBrush: (delta) => set({ brushSize: clampBrush(get().brushSize + delta) }),
  setShape: (shape) => set({ shape }),
  toggleShape: () => set({ shape: get().shape === 'circle' ? 'square' : 'circle' }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set({ paused: !get().paused }),
  setSpeed: (speed) => set({ speed }),
  nudgeSpeed: (dir) => {
    const i = SPEEDS.indexOf(get().speed)
    const j = Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))
    set({ speed: SPEEDS[j] })
  },
  setGridSize: (gridSize) => set({ gridSize }),
  toggleScanlines: () => set({ scanlines: !get().scanlines }),
  toggleGlow: () => set({ glow: !get().glow }),
  setStatus: (status) => set({ status }),
}))

useTools.subscribe((s, prev) => {
  if (s.scanlines !== prev.scanlines || s.glow !== prev.glow || s.gridSize !== prev.gridSize) {
    writeSettings({ scanlines: s.scanlines, glow: s.glow, gridSize: s.gridSize })
  }
})

/** Show a status message that clears itself. */
let statusTimer: ReturnType<typeof setTimeout> | undefined
export function flash(message: string, ms = 2200): void {
  useTools.getState().setStatus(message)
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => useTools.getState().setStatus(null), ms)
}
