import { NAV_ITEMS, type ScreenId } from '../lib/nav'

export function TabBar({
  screen,
  onNavigate,
  onNewSession,
}: {
  screen: ScreenId
  onNavigate: (next: ScreenId) => void
  onNewSession?: () => void
}) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {NAV_ITEMS.map(({ id, tabLabel, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="tabbar__item"
          aria-current={screen === id ? 'page' : undefined}
          onClick={() => {
            if (id === 'ask') {
              onNewSession?.()
            }
            onNavigate(id)
          }}
        >
          <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>{tabLabel}</span>
        </button>
      ))}
    </nav>
  )
}
