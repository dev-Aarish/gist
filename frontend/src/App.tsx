import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import {
  useDocuments,
  useHealth,
  useProgress,
  usePastPapers,
  usePastPaperAnalysis,
  usePriorityMatrix,
} from './hooks/useApiData'
import { useModels } from './hooks/useModels'
import { useTheme, type ThemePreference } from './hooks/useTheme'
import { useChatSessions } from './hooks/useChatSessions'
import { NAV_ITEMS, type ScreenId } from './lib/nav'
import { AskScreen } from './screens/AskScreen'
import { NotesScreen } from './screens/NotesScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { QuizScreen, type QuizIntent } from './screens/QuizScreen'
import { GrillScreen, type GrillIntent } from './screens/GrillScreen'
import { PastPaperScreen } from './screens/PastPaperScreen'
import { LandingScreen } from './screens/LandingScreen'

function getScreenFromLocation(): ScreenId {
  try {
    const pathname = window.location.pathname.replace(/\/+$/, '')
    const hash = window.location.hash.replace(/^#\/?/, '')

    // Check if on /ai route
    if (pathname === '/ai' || pathname.startsWith('/ai/')) {
      const subPath = pathname.replace(/^\/ai\/?/, '')
      if (
        subPath === 'quiz' ||
        subPath === 'grill' ||
        subPath === 'progress' ||
        subPath === 'notes' ||
        subPath === 'ask' ||
        subPath === 'papers'
      ) {
        return subPath as ScreenId
      }
      if (
        hash === 'quiz' ||
        hash === 'grill' ||
        hash === 'progress' ||
        hash === 'notes' ||
        hash === 'ask' ||
        hash === 'papers'
      ) {
        return hash as ScreenId
      }
      return 'ask'
    }

    // Check hash for legacy/direct links
    if (
      hash === 'ask' ||
      hash === 'quiz' ||
      hash === 'grill' ||
      hash === 'progress' ||
      hash === 'notes' ||
      hash === 'papers'
    ) {
      return hash as ScreenId
    }

    return 'landing'
  } catch {
    return 'landing'
  }
}


interface WorkspaceAppProps {
  screen: ScreenId
  navigate: (next: ScreenId) => void
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
  quizIntent: QuizIntent | null
  setQuizIntent: (intent: QuizIntent | null) => void
  grillIntent: GrillIntent | null
  setGrillIntent: (intent: GrillIntent | null) => void
}

function WorkspaceApp({
  screen,
  navigate,
  preference,
  setPreference,
  quizIntent,
  setQuizIntent,
  grillIntent,
  setGrillIntent,
}: WorkspaceAppProps) {
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
    models,
    active: activeModel,
    switching: switchingModel,
    error: modelsError,
    choose: chooseModel,
  } = useModels(refreshHealth)
  const {
    progress,
    loading: progressLoading,
    error: progressError,
    refresh: refreshProgress,
  } = useProgress()

  const {
    papers,
    loading: papersLoading,
    error: papersError,
    refresh: refreshPapers,
  } = usePastPapers()

  const {
    analysis: pastPaperAnalysis,
    loading: analysisLoading,
    error: analysisError,
    refresh: refreshAnalysis,
  } = usePastPaperAnalysis()

  const {
    matrix: priorityMatrix,
    loading: matrixLoading,
    error: matrixError,
    refresh: refreshMatrix,
  } = usePriorityMatrix()

  // Both calls run on load, so either failing means the backend is unreachable.
  const backendError = documentsError ?? progressError ?? papersError
  const offline = backendError !== null

  const retryBackend = useCallback(() => {
    void refreshDocuments()
    void refreshProgress()
    void refreshHealth()
    void refreshPapers()
    void refreshAnalysis()
    void refreshMatrix()
  }, [
    refreshDocuments,
    refreshProgress,
    refreshHealth,
    refreshPapers,
    refreshAnalysis,
    refreshMatrix,
  ])

  return (
    <AppShell
      screen={screen}
      onNavigate={navigate}
      preference={preference}
      onSelectTheme={setPreference}
      documents={documents}
      weakSpots={progress?.weak_spots_count ?? 0}
      papersCount={papers.length}
      highYieldCount={priorityMatrix?.critical_priority_count ?? 0}
      model={activeModel ?? health?.active_llm ?? null}
      models={models}
      switchingModel={switchingModel}
      modelsError={modelsError}
      onSelectModel={chooseModel}
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
          model={activeModel ?? health?.active_llm ?? null}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onNavigate={navigate}
          onDocumentsChanged={() => {
            void refreshDocuments()
            void refreshPapers()
            void refreshAnalysis()
            void refreshMatrix()
          }}
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
          onProgressChanged={() => {
            void refreshProgress()
            void refreshMatrix()
          }}
        />
      ) : null}

      {screen === 'grill' ? (
        <GrillScreen
          documents={documents}
          intent={grillIntent}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onIntentConsumed={() => setGrillIntent(null)}
          onProgressChanged={() => {
            void refreshProgress()
            void refreshMatrix()
          }}
          onAskQuestion={(prompt) => {
            createSession([{ id: `turn-${Date.now()}`, role: 'user', text: prompt }])
            navigate('ask')
          }}
          onStartQuiz={(topic) => {
            setQuizIntent({ useWeakSpots: false, topic })
            navigate('quiz')
          }}
        />
      ) : null}

      {screen === 'papers' ? (
        <PastPaperScreen
          analysis={pastPaperAnalysis}
          priorityMatrix={priorityMatrix}
          papers={papers}
          loading={papersLoading || analysisLoading || matrixLoading}
          error={papersError ?? analysisError ?? matrixError}
          offline={offline}
          offlineMessage={backendError}
          onRetry={retryBackend}
          onRefresh={() => {
            void refreshPapers()
            void refreshAnalysis()
            void refreshMatrix()
            void refreshProgress()
          }}
          onStartHighYieldQuiz={() => {
            setQuizIntent({ useHighYield: true })
            navigate('quiz')
          }}
          onStartTopicQuiz={(topic) => {
            setQuizIntent({ useWeakSpots: false, topic })
            navigate('quiz')
          }}
          onStartMockExam={(opts) => {
            setGrillIntent({
              subject: opts?.subject,
              useHighYield: opts?.useHighYield ?? true,
            })
            navigate('grill')
          }}
          onAskQuestion={(text) => {
            createSession([{ id: `turn-${Date.now()}`, role: 'user', text }])
            navigate('ask')
          }}
        />
      ) : null}

      {screen === 'progress' ? (
        <ProgressScreen
          progress={progress}
          priorityMatrix={priorityMatrix}
          loading={progressLoading}
          error={progressError}
          onRefresh={retryBackend}
          onStartWeakQuiz={() => {
            setQuizIntent({ useWeakSpots: true })
            navigate('quiz')
          }}
          onStartHighYieldQuiz={() => {
            setQuizIntent({ useHighYield: true })
            navigate('quiz')
          }}
          onStartTopicQuiz={(topic) => {
            setQuizIntent({ useWeakSpots: false, topic })
            navigate('quiz')
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
          onDocumentsChanged={() => {
            void refreshDocuments()
            void refreshPapers()
            void refreshAnalysis()
            void refreshMatrix()
          }}
        />
      ) : null}
    </AppShell>
  )
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(getScreenFromLocation)
  const [quizIntent, setQuizIntent] = useState<QuizIntent | null>(null)
  const [grillIntent, setGrillIntent] = useState<GrillIntent | null>(null)
  const { preference, setPreference } = useTheme()

  useEffect(() => {
    if (screen === 'landing') {
      document.title = 'Gist — Private, Offline Exam Study Companion'
      if (window.location.pathname === '/ai') {
        window.history.replaceState(null, '', '/')
      }
    } else {
      const item = NAV_ITEMS.find((entry) => entry.id === screen)
      document.title = item ? `${item.label} · Gist` : 'Gist'
      if (window.location.pathname !== '/ai') {
        window.history.replaceState(null, '', `/ai#${screen}`)
      } else if (window.location.hash.replace(/^#\/?/, '') !== screen) {
        window.location.hash = screen
      }
    }
  }, [screen])

  // Listen to popstate and hash changes for browser forward/backward navigation
  useEffect(() => {
    const handleUrlChange = () => {
      setScreen(getScreenFromLocation())
    }
    window.addEventListener('popstate', handleUrlChange)
    window.addEventListener('hashchange', handleUrlChange)
    return () => {
      window.removeEventListener('popstate', handleUrlChange)
      window.removeEventListener('hashchange', handleUrlChange)
    }
  }, [])

  function navigate(next: ScreenId) {
    // Any manual navigation clears a pending "quiz/grill" request.
    if (next !== 'quiz') setQuizIntent(null)
    if (next !== 'grill') setGrillIntent(null)
    setScreen(next)
    if (next === 'landing') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/')
      } else {
        window.location.hash = ''
      }
    } else {
      const targetUrl = `/ai#${next}`
      if (window.location.pathname !== '/ai' || window.location.hash !== `#${next}`) {
        window.history.pushState(null, '', targetUrl)
      }
    }
  }

  if (screen === 'landing') {
    return (
      <LandingScreen
        preference={preference}
        onSelectTheme={setPreference}
      />
    )
  }

  return (
    <WorkspaceApp
      screen={screen}
      navigate={navigate}
      preference={preference}
      setPreference={setPreference}
      quizIntent={quizIntent}
      setQuizIntent={setQuizIntent}
      grillIntent={grillIntent}
      setGrillIntent={setGrillIntent}
    />
  )
}


