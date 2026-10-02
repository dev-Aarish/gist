import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '../hooks/useTheme'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System theme', Icon: Monitor },
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
]

export function ThemeToggle({
  preference,
  onSelect,
}: {
  preference: ThemePreference
  onSelect: (next: ThemePreference) => void
}) {
  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className="seg__btn"
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => onSelect(value)}
        >
          <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
