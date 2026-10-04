export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded}%`
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`
}

/** Compact, sentence-case relative time for question logs and attempts. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'not yet attempted'

  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'not yet attempted'

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${pluralize(minutes, 'minute')} ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${pluralize(hours, 'hour')} ago`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days} ${pluralize(days, 'day')} ago`

  const weeks = Math.round(days / 7)
  if (days < 30) return `${weeks} ${pluralize(weeks, 'week')} ago`

  const months = Math.round(days / 30)
  if (months < 12) return `${months} ${pluralize(months, 'month')} ago`

  const years = Math.round(months / 12)
  return `${years} ${pluralize(years, 'year')} ago`
}

/** A stable key for a day cell in the activity grid, in local time. */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
