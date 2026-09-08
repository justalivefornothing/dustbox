import { useEffect, useRef, useState } from 'react'
import type { Engine } from '../app/engine'
import { SlotStore, applySnapshot, type SlotMeta } from '../app/storage'
import { flash, useTools } from '../app/store'
import { initialRegister } from '../sim/rules'

interface Props {
  engine: Engine
  open: boolean
  onClose: () => void
}

const store = new SlotStore(globalThis.localStorage)

function when(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function SlotsDialog({ engine, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [slots, setSlots] = useState<(SlotMeta | null)[]>(() => store.list())
  const [names, setNames] = useState<string[]>(() => store.list().map((s, i) => s?.name ?? `Slot ${i + 1}`))
  const setGridSize = useTools((s) => s.setGridSize)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setSlots(store.list())
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  const refresh = () => setSlots(store.list())

  const save = (i: number) => {
    try {
      const meta = store.save(i, names[i], engine.world)
      flash(`Saved "${meta.name}" (${meta.cells.toLocaleString()} cells)`)
      refresh()
    } catch (err) {
      flash(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const load = (i: number) => {
    const snap = store.load(i)
    if (!snap) return
    if (snap.width !== engine.world.width) {
      // Snapshot from a different grid size: resize the world to match if it is
      // one of ours, otherwise resample.
      if (snap.width === 200 || snap.width === 300 || snap.width === 400) {
        setGridSize(snap.width)
        engine.resize(snap.width)
      }
    }
    applySnapshot(engine.world, snap, (s) => initialRegister(s, engine.world.rng))
    engine.draw()
    flash(`Loaded "${snap.name}"`)
    onClose()
  }

  const remove = (i: number) => {
    store.remove(i)
    refresh()
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="pixel-border m-auto w-[min(92vw,560px)] bg-coal p-0 text-chalk backdrop:bg-ink/80"
      aria-labelledby="slots-title"
    >
      <div className="flex items-center justify-between border-b-2 border-line px-4 py-3">
        <h2 id="slots-title" className="text-[12px] uppercase tracking-widest text-neon">
          Save slots
        </h2>
        <button type="button" className="btn" onClick={onClose} aria-label="Close">
          Esc
        </button>
      </div>
      <p className="px-4 pt-3 text-[11px] text-dust">
        Six slots in this browser's localStorage. Grids are RLE-compressed so a full scene is a few kilobytes.
      </p>
      <ul className="flex flex-col gap-2 p-4">
        {slots.map((meta, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 border-2 border-line bg-ink p-2">
            <span className="w-5 text-center text-[11px] text-dust">{i + 1}</span>
            <input
              className="field min-w-0 flex-1"
              value={names[i]}
              maxLength={40}
              aria-label={`Name for slot ${i + 1}`}
              onChange={(e) => setNames((n) => n.map((v, k) => (k === i ? e.target.value : v)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(i)
              }}
            />
            <span className="w-full text-[10px] text-dust sm:w-auto sm:min-w-[130px]">
              {meta ? `${meta.width}x${meta.height} · ${meta.cells.toLocaleString()} cells · ${when(meta.savedAt)}` : 'empty'}
            </span>
            <div className="flex">
              <button type="button" className="btn" onClick={() => save(i)} title="Overwrite this slot with the current grid">
                Save
              </button>
              <button type="button" className="btn -ml-0.5" disabled={!meta} onClick={() => load(i)}>
                Load
              </button>
              <button type="button" className="btn btn-danger -ml-0.5" disabled={!meta} onClick={() => remove(i)} aria-label={`Delete slot ${i + 1}`}>
                Del
              </button>
            </div>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
