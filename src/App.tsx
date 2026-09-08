import { useEffect, useMemo } from 'react'
import { Engine } from './app/engine'
import { useTools } from './app/store'
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
    const volcano = PRESETS.find((p) => p.id === 'volcano')
    if (volcano) loadPreset(e.world, volcano)
    return e
  }, [])

  useEffect(() => {
    engine.start()
    return () => engine.stop()
  }, [engine])

  // Mirror tool state into the engine without re-rendering the canvas.
  useEffect(() => {
    const sync = () => {
      const t = useTools.getState()
      engine.paused = t.paused
      engine.speed = t.speed
      engine.glow = t.glow
      engine.brush = { element: t.element, radius: t.brushSize >> 1, shape: t.shape }
    }
    sync()
    return useTools.subscribe(sync)
  }, [engine])

  // Grid size changes rebuild the world; SimCanvas remounts via its key.
  useEffect(() => {
    if (engine.size !== gridSize) {
      engine.resize(gridSize)
      const volcano = PRESETS.find((p) => p.id === 'volcano')
      if (volcano) loadPreset(engine.world, volcano)
    }
  }, [engine, gridSize])

  useKeyboard(engine)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col gap-3 pb-6">
      <TopBar engine={engine} />

      <main className="flex flex-col items-center gap-4 px-3 sm:flex-row sm:items-start sm:justify-center sm:px-5">
        <SimCanvas key={gridSize} engine={engine} size={gridSize} />
        <Hud engine={engine} />
      </main>

      <section aria-label="Tools" className="flex flex-col items-center gap-3 px-2 sm:px-5">
        <Dock />
        <Controls engine={engine} />
      </section>

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
