import { useState, useEffect, type ReactNode } from 'react'
import type { ThemePreference } from '../hooks/useTheme'
import type { DocumentInfo, ModelInfo } from '../lib/types'
import type { ScreenId } from '../lib/nav'
import type { ChatSession } from '../hooks/useChatSessions'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'

const SIDEBAR_COLLAPSED_KEY = 'gist_sidebar_collapsed_v1'

export function AppShell({
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
  children,
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
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  const toggleCollapse = () => setCollapsed((prev) => !prev)

  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      <Sidebar
        screen={screen}
        onNavigate={onNavigate}
        preference={preference}
        onSelectTheme={onSelectTheme}
        documents={documents}
        weakSpots={weakSpots}
        model={model}
        models={models}
        switchingModel={switchingModel}
        modelsError={modelsError}
        onSelectModel={onSelectModel}
        offline={offline}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onNewSession={onNewSession}
        onDeleteSession={onDeleteSession}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />
      <main className="shell__main">{children}</main>
      <TabBar screen={screen} onNavigate={onNavigate} onNewSession={onNewSession} />
    </div>
  )
}
