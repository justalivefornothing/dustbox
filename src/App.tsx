import { useEffect, useMemo } from 'react'
import { Engine } from './app/engine'
import { flash, useTools } from './app/store'
import { levelFromHash } from './app/share'
import { applySnapshot } from './app/storage'
import { initialRegister } from './sim/rules'
import { PRESETS, loadPreset } from './sim/presets'
import { Controls } from './ui/Controls'
import { Dock } from './ui/Dock'
import { Hud } from './ui/Hud'
import { SimCanvas } from './ui/SimCanvas'
import { TopBar } from './ui/TopBar'
import { HOTKEYS, useKeyboard } from './ui/useKeyboard'

export default function App() {
  const gridSize = useTools((s) => s.gridSize)

  // One engine for the app's lifetime; the world inside it is swapped on resize.
  const engine = useMemo(() => {
    const e = new Engine(useTools.getState().gridSize)
    // A shared level in the URL hash wins over the default scene.
    const shared = typeof location !== 'undefined' ? levelFromHash(location.hash) : null
    if (shared) {
      applySnapshot(e.world, shared, (s) => initialRegister(s, e.world.rng))
      queueMicrotask(() => flash(`Loaded a shared ${shared.width}x${shared.height} level from the link`, 4000))
    } else {
      const volcano = PRESETS.find((p) => p.id === 'volcano')
      if (volcano) loadPreset(e.world, volcano)
    }
    return e
  }, [])

  useEffect(() => {
    engine.start()
    return () => engine.stop()
  }, [engine])

  // Mirror tool state into the engine without re-rendering the canvas. Grid
  // size changes rebuild the world synchronously here, before React remounts
  // SimCanvas (keyed by size), so the new canvas attaches to the new world.
  useEffect(() => {
    const sync = () => {
      const t = useTools.getState()
      engine.configure({
        paused: t.paused,
        speed: t.speed,
        glow: t.glow,
        brush: { element: t.element, radius: t.brushSize >> 1, shape: t.shape },
      })
    }
    sync()
    return useTools.subscribe((s, prev) => {
      if (s.gridSize !== prev.gridSize && engine.size !== s.gridSize) {
        engine.resize(s.gridSize)
        const volcano = PRESETS.find((p) => p.id === 'volcano')
        if (volcano) loadPreset(engine.world, volcano)
      }
      sync()
    })
  }, [engine])

  useKeyboard(engine)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col gap-3 pb-6">
      <TopBar engine={engine} />

      {/* Mobile: canvas, tools, then stats. Desktop: canvas + stats side by side, tools underneath. */}
      <main className="flex flex-col items-center gap-4 px-3 sm:grid sm:grid-cols-[minmax(0,1fr)_15rem] sm:grid-rows-[auto_auto] sm:items-start sm:gap-x-4 sm:px-5">
        <div className="order-1 flex w-full justify-center sm:col-start-1 sm:row-start-1">
          <SimCanvas key={gridSize} engine={engine} size={gridSize} />
        </div>
        <div className="order-3 w-full sm:col-start-2 sm:row-start-1">
          <Hud engine={engine} />
        </div>
        <section aria-label="Tools" className="order-2 flex w-full flex-col items-center gap-3 sm:col-span-2 sm:row-start-2">
          <Dock />
          <Controls engine={engine} />
        </section>
      </main>

      <footer className="mx-auto mt-2 flex w-full max-w-[900px] flex-wrap justify-center gap-x-4 gap-y-1 px-4 text-[10px] text-dust">
        {HOTKEYS.map((h) => (
          <span key={h.keys} className="whitespace-nowrap">
            <span className="kbd">{h.keys}</span> {h.action}
          </span>
        ))}
        <span className="w-full text-center text-dust/70">
          Right-click erases · drop a PNG on the canvas to import it · inspired by Sandspiel, built from scratch
        </span>
      </footer>
    </div>
  )
}
