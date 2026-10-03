import { BookOpen, PanelLeftClose, PanelLeftOpen, Trash2, Sparkles } from 'lucide-react'
import { NAV_ITEMS, type ScreenId } from '../lib/nav'
import { pluralize } from '../lib/format'
import type { DocumentInfo, ModelInfo } from '../lib/types'
import type { ThemePreference } from '../hooks/useTheme'
import type { ChatSession } from '../hooks/useChatSessions'
import { ModelPicker } from './ModelPicker'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar({
  screen,
  onNavigate,
  preference,
  onSelectTheme,
  documents,
  weakSpots,
  model,
  models,
  switchingModel,
  modelsError,
  onSelectModel,
  offline,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  collapsed = false,
  onToggleCollapse,
}: {
  screen: ScreenId
  onNavigate: (next: ScreenId) => void
  preference: ThemePreference
  onSelectTheme: (next: ThemePreference) => void
  documents: DocumentInfo[]
  weakSpots: number
  model: string | null
  models: ModelInfo[]
  switchingModel: boolean
  modelsError: string | null
  onSelectModel: (model: string) => void
  offline: boolean
  sessions?: ChatSession[]
  activeSessionId?: string | null
  onSelectSession?: (id: string) => void
  onNewSession?: () => void
  onDeleteSession?: (id: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const pages = documents.reduce((total, doc) => total + doc.page_count, 0)

  return (
    <aside className="shell__sidebar">
      <div className={`side ${collapsed ? 'side--collapsed' : ''}`}>
        <div className="side__brand">
          {!collapsed ? (
            <>
              <button
                type="button"
                className="side__brand-text"
                onClick={() => {
                  onNewSession?.()
                  onNavigate('ask')
                }}
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                title="New question"
              >
                <span className="side__wordmark">Gist</span>
                <span className="side__wordmark-note">your notes</span>
              </button>
              {onToggleCollapse ? (
                <button
                  type="button"
                  className="side__toggle-btn"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose size={17} strokeWidth={1.5} />
                </button>
              ) : null}
            </>
          ) : (
            <div className="side__brand-collapsed">
              {onToggleCollapse ? (
                <button
                  type="button"
                  className="side__toggle-btn"
                  onClick={onToggleCollapse}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen size={18} strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
          )}
        </div>

        <nav className="nav" aria-label="Sections">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav__item ${collapsed ? 'nav__item--collapsed' : ''}`}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => {
                if (id === 'ask') {
                  onNewSession?.()
                }
                onNavigate(id)
              }}
              title={collapsed ? label : undefined}
            >
              <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
              {!collapsed ? <span>{label}</span> : null}
              {!collapsed && id === 'notes' && documents.length > 0 ? (
                <span className="nav__count">{documents.length}</span>
              ) : null}
              {!collapsed && id === 'progress' && weakSpots > 0 ? (
                <span className="nav__count">{weakSpots}</span>
              ) : null}
              {collapsed &&
              ((id === 'notes' && documents.length > 0) ||
                (id === 'progress' && weakSpots > 0)) ? (
                <span className="nav__dot-badge" />
              ) : null}
            </button>
          ))}
        </nav>

        {sessions && sessions.length > 0 ? (
          <div className="side__section">
            {!collapsed ? (
              <div className="side__section-head">
                <span className="t-label">Recent</span>
              </div>
            ) : null}
            <div className="side__sessions">
              {sessions.slice(0, 8).map((session) => {
                const isActive = screen === 'ask' && activeSessionId === session.id
                return (
                  <div
                    key={session.id}
                    className={`side__session-item ${isActive ? 'side__session-item--active' : ''}`}
                  >
                    <button
                      type="button"
                      className="side__session-btn"
                      onClick={() => {
                        onSelectSession?.(session.id)
                        onNavigate('ask')
                      }}
                      title={session.title}
                    >
                      {!collapsed ? (
                        <span className="side__session-title">{session.title}</span>
                      ) : (
                        <span className="side__session-badge">
                          {(session.title.trim()[0] || 'C').toUpperCase()}
                        </span>
                      )}
                    </button>
                    {!collapsed && onDeleteSession ? (
                      <button
                        type="button"
                        className="side__session-del"
                        aria-label={`Delete ${session.title}`}
                        title="Delete session"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSession(session.id)
                        }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="side__section">
          {!collapsed ? (
            <>
              <span className="t-label">Your notes</span>
              <button
                type="button"
                className="side__notes"
                onClick={() => onNavigate('notes')}
              >
                {offline ? (
                  <>
                    <span className="t-small">Notes unavailable</span>
                    <span className="t-small t-faint">
                      Start the local backend to see them.
                    </span>
                  </>
                ) : documents.length === 0 ? (
                  <>
                    <span className="t-small">Nothing indexed yet</span>
                    <span className="t-small t-faint">
                      Add a PDF to start asking questions.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="side__notes-count">{documents.length}</span>
                    <span className="t-small t-muted">
                      {pluralize(documents.length, 'document')} · {pages}{' '}
                      {pluralize(pages, 'page')}
                    </span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="side__notes-collapsed"
              onClick={() => onNavigate('notes')}
              title={`${documents.length} ${pluralize(documents.length, 'document')}`}
            >
              <BookOpen size={16} strokeWidth={1.5} />
              <span className="side__notes-count-sm">{documents.length}</span>
            </button>
          )}
        </div>

        <div className="side__foot">
          <ThemeToggle preference={preference} onSelect={onSelectTheme} collapsed={collapsed} />
          {!collapsed ? (
            <>
              <button
                type="button"
                className="side__overview-link-btn"
                onClick={() => onNavigate('landing')}
                title="View Gist Landing Page & Overview"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-soft)',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                  marginBottom: '4px',
                  transition: 'background-color var(--dur-hover), color var(--dur-hover)',
                }}
              >
                <Sparkles size={13} strokeWidth={1.5} className="text-accent" />
                <span>Landing & Overview</span>
              </button>
              <span className="badge">
                <span className="badge__dot" aria-hidden="true" />
                Runs locally
              </span>
              <ModelPicker
                models={models}
                active={model}
                switching={switchingModel}
                error={modelsError}
                onSelect={onSelectModel}
                disabled={offline}
              />
            </>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

