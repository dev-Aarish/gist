import type { CSSProperties } from 'react'

const TILES = [
  'var(--tile-clay)',
  'var(--tile-sage)',
  'var(--tile-sand)',
  'var(--tile-slate)',
  'var(--tile-rose)',
  'var(--tile-teal)',
] as const

const MARKS = ['circle', 'bars', 'arc'] as const

/** The same topic always lands on the same colour, by index. */
export function tileColor(index: number): string {
  return TILES[index % TILES.length]
}

export function TopicTile({
  title,
  meta,
  index,
  onClick,
}: {
  title: string
  meta: string
  index: number
  onClick?: () => void
}) {
  const mark = MARKS[index % MARKS.length]

  return (
    <button
      type="button"
      className="tile"
      onClick={onClick}
      aria-label={
        onClick ? `${title}. ${meta}. Start a quiz on this topic.` : `${title}. ${meta}`
      }
    >
      <span
        className="tile__block"
        style={{ '--tile': tileColor(index) } as CSSProperties}
        aria-hidden="true"
      >
        <span className={`tile__mark tile__mark--${mark}`} />
      </span>
      <span className="tile__body">
        <span className="t-label">{meta}</span>
        <span className="t-h3">{title}</span>
      </span>
    </button>
  )
}
