import type { CSSProperties } from 'react'

const TILES = [
  'var(--tile-clay)',
  'var(--tile-fern)',
  'var(--tile-ochre)',
  'var(--tile-teal)',
  'var(--tile-rose)',
  'var(--tile-moss)',
] as const

export type TileStatus = 'mastered' | 'review' | 'weak' | 'unattempted'

const STATUS_LABEL: Record<TileStatus, string> = {
  mastered: 'Mastered',
  review: 'Needs review',
  weak: 'Weak spot',
  unattempted: 'Not attempted',
}

/** The same topic always lands on the same colour, by index. */
export function tileColor(index: number): string {
  return TILES[index % TILES.length]
}

export function TopicTile({
  title,
  meta,
  index,
  accuracy = 0,
  status = 'unattempted',
  onClick,
}: {
  title: string
  meta: string
  index: number
  accuracy?: number
  status?: TileStatus
  onClick?: () => void
}) {
  const unattempted = status === 'unattempted'
  const pct = unattempted ? 0 : Math.max(0, Math.min(100, Math.round(accuracy)))

  return (
    <button
      type="button"
      className="tile"
      onClick={onClick}
      style={{ '--tile': tileColor(index) } as CSSProperties}
      aria-label={
        onClick
          ? `${title}. ${meta}. ${
              unattempted ? 'No attempts yet.' : `${pct} percent correct.`
            } Start a quiz on this topic.`
          : `${title}. ${meta}.`
      }
    >
      <span className="tile__block" aria-hidden="true">
        <span className={`tile__gauge${unattempted ? ' tile__gauge--empty' : ''}`}>
          <svg viewBox="0 0 44 44" className="tile__gauge-ring">
            <circle className="tile__gauge-track" cx="22" cy="22" r="17" />
            {!unattempted ? (
              <circle
                className="tile__gauge-fill"
                cx="22"
                cy="22"
                r="17"
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={100 - pct}
              />
            ) : null}
          </svg>
          <span className="tile__gauge-num">{unattempted ? '—' : pct}</span>
        </span>

        {!unattempted ? (
          <span className={`tile__status tile__status--${status}`}>
            <span className="tile__status-dot" />
            {STATUS_LABEL[status]}
          </span>
        ) : null}
      </span>

      <span className="tile__body">
        <span className="t-label">{meta}</span>
        <span className="t-h3 tile__title">{title}</span>
      </span>
    </button>
  )
}
