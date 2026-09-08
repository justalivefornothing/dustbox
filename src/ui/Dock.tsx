import { PAINTABLE } from '../sim/elements'
import { E } from '../sim/species'
import { useTools } from '../app/store'
import { PixelIcon } from './PixelIcon'

const ERASER_COLOR: readonly [number, number, number] = [236, 120, 150]

export function Dock() {
  const element = useTools((s) => s.element)
  const setElement = useTools((s) => s.setElement)

  return (
    <nav aria-label="Element palette" className="w-full">
      <div className="strip flex gap-2 overflow-x-auto px-1 pb-2 pt-3 sm:flex-wrap sm:justify-center sm:overflow-visible">
        {PAINTABLE.map((el) => (
          <button
            key={el.id}
            type="button"
            className="swatch"
            aria-pressed={element === el.id}
            aria-label={`${el.name}${el.key ? ` (key ${el.key.toUpperCase()})` : ''}`}
            title={`${el.name}: ${el.blurb}`}
            onClick={() => setElement(el.id)}
          >
            {el.key && <span className="key">{el.key.toUpperCase()}</span>}
            <PixelIcon species={el.id} color={el.color} size={28} />
            <span>{el.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="swatch"
          aria-pressed={element === E.Empty}
          aria-label="Eraser (key E)"
          title="Eraser: removes anything, including walls. Right-click also erases."
          onClick={() => setElement(E.Empty)}
        >
          <span className="key">E</span>
          <PixelIcon species={E.Empty} color={ERASER_COLOR} size={28} />
          <span>Erase</span>
        </button>
      </div>
    </nav>
  )
}
