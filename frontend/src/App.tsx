import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { useDocuments, useHealth, useProgress } from './hooks/useApiData'
import { useTheme } from './hooks/useTheme'
import { useChatSessions } from './hooks/useChatSessions'
import { NAV_ITEMS, type ScreenId } from './lib/nav'
import { AskScreen } from './screens/AskScreen'
import { NotesScreen } from './screens/NotesScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { QuizScreen, type QuizIntent } from './screens/QuizScreen'

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('ask')
  const [quizIntent, setQuizIntent] = useState<QuizIntent | null>(null)

  const { preference, setPreference } = useTheme()
  const {
    sessions,
    activeId: activeSessionId,
    selectSession,
    startNewSession,
    updateTurns,
    deleteSession,
    createSession,
  } = useChatSessions()

  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    refresh: refreshDocuments,
  } = useDocuments()
  const { health, refresh: refreshHealth } = useHealth()
  const {
    progress,
    loading: progressLoading,
    error: progressError,
    refresh: refreshProgress,
  } = useProgress()

  // Both calls run on load, so either failing means the backend is unreachable.
  const backendError = documentsError ?? progressError
  const offline = backendError !== null

  const retryBackend = useCallback(() => {
    void refreshDocuments()
    void refreshProgress()
    void refreshHealth()
  }, [refreshDocuments, refreshProgress, refreshHealth])

  useEffect(() => {
    const item = NAV_ITEMS.find((entry) => entry.id === screen)
    document.title = item ? `${item.label} · Gist` : 'Gist'
  }, [screen])

  function navigate(next: ScreenId) {
    // Any manual navigation clears a pending "quiz my weak spots" request.
    if (next !== 'quiz') setQuizIntent(null)
    setScreen(next)
  }

  return (
    <AppShell
      screen={screen}
      onNavigate={navigate}
      preference={preference}
      onSelectTheme={setPreference}
      documents={documents}
      weakSpots={progress?.weak_spots_count ?? 0}
      model={health?.active_llm ?? null}
      offline={offline}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={selectSession}
      onNewSession={startNewSession}
      onDeleteSession={deleteSession}
    >
      {screen === 'ask' ? (
        <AskScreen
          documents={documents}
          model={health?.active_llm ?? null}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onNavigate={navigate}
          onDocumentsChanged={() => void refreshDocuments()}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onStartNewSession={startNewSession}
          onUpdateTurns={updateTurns}
          onCreateSession={createSession}
        />
      ) : null}

      {screen === 'quiz' ? (
        <QuizScreen
          documents={documents}
          intent={quizIntent}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onIntentConsumed={() => setQuizIntent(null)}
          onProgressChanged={() => void refreshProgress()}
        />
      ) : null}

      {screen === 'progress' ? (
        <ProgressScreen
          progress={progress}
          loading={progressLoading}
          error={progressError}
          onRefresh={retryBackend}
          onStartWeakQuiz={() => {
            setQuizIntent({ useWeakSpots: true })
            setScreen('quiz')
          }}
          onStartTopicQuiz={(topic) => {
            setQuizIntent({ useWeakSpots: false, topic })
            setScreen('quiz')
          }}
          onNavigate={navigate}
        />
      ) : null}

      {screen === 'notes' ? (
        <NotesScreen
          documents={documents}
          loading={documentsLoading}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onDocumentsChanged={() => void refreshDocuments()}
        />
      ) : null}
    </AppShell>
  )
}
