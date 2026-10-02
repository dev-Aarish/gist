import type { CSSProperties } from 'react'
import { formatPercent } from '../lib/format'
import type { MasteryStatus, TopicStat } from '../lib/types'

const STATUS_LABEL: Record<MasteryStatus, string> = {
  Unattempted: 'Not attempted',
  'Weak Spot': 'Weak — needs practice',
  'Needs Review': 'Needs review',
  Mastered: 'Mastered',
}

function fillLevel(stat: TopicStat): string {
  if (stat.status === 'Unattempted') return 'unattempted'
  if (stat.accuracy < 50) return 'danger'
  if (stat.accuracy <= 75) return 'warning'
  return 'success'
}

export function MasteryBar({ stat }: { stat: TopicStat }) {
  const unattempted = stat.status === 'Unattempted'
  const level = fillLevel(stat)
  const percent = Math.max(0, Math.min(100, stat.accuracy))

  return (
    <div className="mrow">
      <span className="mrow__name">
        {stat.topic}
        <span className="mrow__status"> {STATUS_LABEL[stat.status]}</span>
      </span>
      <span className="mrow__pct tabular">
        {unattempted ? '—' : formatPercent(percent)}
      </span>
      <span
        className="mrow__track"
        role="img"
        aria-label={
          unattempted
            ? `${stat.topic}: not attempted yet`
            : `${stat.topic}: ${formatPercent(percent)} correct, ${
                STATUS_LABEL[stat.status]
              }`
        }
      >
        <span
          className={`mrow__fill mrow__fill--${level}`}
          style={
            {
              '--pct': unattempted ? 1 : percent / 100,
            } as CSSProperties
          }
        />
      </span>
    </div>
  )
}
