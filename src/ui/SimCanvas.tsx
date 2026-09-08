import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import type { Engine } from '../app/engine'
import { importPng } from '../app/pngio'
import { useTools, flash } from '../app/store'
import { E } from '../sim/species'

interface Props {
  engine: Engine
  size: number
}

/** Reserve room for the header and dock when choosing the integer scale. */
const RESERVED_HEIGHT = 300

export function SimCanvas({ engine, size }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cssSize, setCssSize] = useState(size)
  const [dragging, setDragging] = useState(false)
  const scanlines = useTools((s) => s.scanlines)
  const element = useTools((s) => s.element)
  const paused = useTools((s) => s.paused)

  // Attach the engine to this canvas element for its lifetime.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Safety net: the world should already match (App resizes it before this
    // component remounts), but never attach a canvas of the wrong size.
    if (engine.size !== size) engine.resize(size)
    engine.attach(canvas)
    return () => engine.detach()
  }, [engine, size])

  // Pick the largest integer scale that fits; fall back to fluid width on
  // narrow screens where even 1x would overflow.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const fit = () => {
      const width = wrap.clientWidth
      const height = Math.max(160, window.innerHeight - RESERVED_HEIGHT)
      const avail = Math.min(width, height)
      const scale = Math.floor(avail / size)
      setCssSize(scale >= 1 ? scale * size : Math.max(1, Math.floor(width)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [size])

  const toGrid = useCallback(
    (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * size)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * size)
      return [Math.min(size - 1, Math.max(0, x)), Math.min(size - 1, Math.max(0, y))]
    },
    [size],
  )

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 2) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus({ preventScroll: true })
    const [x, y] = toGrid(e)
    // Right button erases for the duration of the stroke.
    engine.pointerBegin(x, y, e.button === 2)
  }
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0) return
    const [x, y] = toGrid(e)
    engine.pointerMove(x, y)
  }
  const endStroke = () => engine.pointerEnd()

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      flash('Drop a PNG or other image file')
      return
    }
    try {
      await importPng(engine.world, file)
      engine.draw()
      flash(`Imported ${file.name} as a level`)
    } catch (err) {
      flash(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div ref={wrapRef} className="flex w-full items-center justify-center">
      <div
        className={`relative pixel-border bg-ink ${scanlines ? 'crt' : ''} ${dragging ? 'outline-2 outline-dashed outline-neon' : ''}`}
        style={{ width: cssSize, height: cssSize }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          className="sim-canvas focus-neon"
          style={{ width: cssSize, height: cssSize }}
          width={size}
          height={size}
          tabIndex={0}
          role="img"
          aria-label={`Falling sand simulation, ${size} by ${size} cells. Painting ${element === E.Empty ? 'eraser' : 'element ' + element}. Click or touch and drag to paint.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
          onContextMenu={(e) => e.preventDefault()}
        />
        {paused && (
          <div className="pointer-events-none absolute left-2 top-2 border-2 border-ember bg-ink/80 px-2 py-1 text-[11px] uppercase tracking-widest text-ember">
            <span className="blink">&#9646;&#9646;</span> paused
          </div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/70 text-center text-[12px] uppercase tracking-widest text-neon">
            drop image to import as level
          </div>
        )}
      </div>
    </div>
  )
}
