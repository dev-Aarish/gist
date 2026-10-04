import {
  Award,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleX,
  Clock,
  Flame,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Send,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'
import { generateMockExam, submitMockExam } from '../lib/api'
import { formatPercent } from '../lib/format'
import type {
  DocumentInfo,
  ExamPreset,
  MockExam,
  MockExamQuestion,
  MockExamResult,
} from '../lib/types'


export interface GrillIntent {
  subject?: string | null
  topic?: string | null
  useWeakSpots?: boolean
  useHighYield?: boolean
  durationMinutes?: number
  totalMarks?: number
  numQuestions?: number
  fastMode?: boolean
}

type ExamStage = 'setup' | 'generating' | 'active' | 'grading' | 'done'

const STORAGE_KEY = 'gist_active_mock_exam_v1'

interface SavedExamState {
  exam: MockExam
  currentIndex: number
  answers: Record<string, string>
  flagged: Record<string, boolean>
  timeRemainingSeconds: number
  startTime: number
}

const DEFAULT_PRESETS: ExamPreset[] = [
  {
    id: 'sprint',
    name: 'Quick Grill',
    tagline: 'Rapid precision check',
    duration_minutes: 15,
    total_marks: 25,
    num_questions: 5,
    description: '5 focused questions on core definitions, formulas, and concepts.',
  },
  {
    id: 'standard',
    name: 'Standard Mock',
    tagline: 'Midterm balanced exam',
    duration_minutes: 30,
    total_marks: 50,
    num_questions: 8,
    description: '8 multi-mark questions spanning theory, problem-solving, and analysis.',
  },
  {
    id: 'fast',
    name: 'Instant Past Paper',
    tagline: 'Instant 0.05s generation',
    duration_minutes: 30,
    total_marks: 50,
    num_questions: 8,
    description: 'Zero wait time. Directly drawn from real previous years’ marked question archives.',
  },
  {
    id: 'comprehensive',
    name: 'Finals Marathon',
    tagline: 'Full high-stakes simulation',
    duration_minutes: 60,
    total_marks: 100,
    num_questions: 15,
    description: '15 rigorous questions weighted across high-yield past paper topics.',
  },
]


export function GrillScreen({
  documents,
  intent,
  offline,
  offlineMessage,
  onRetry,
  onIntentConsumed,
  onProgressChanged,
  onAskQuestion,
  onStartQuiz,
}: {
  documents: DocumentInfo[]
  intent: GrillIntent | null
  offline: boolean
  offlineMessage: string | null
  onRetry: () => void
  onIntentConsumed: () => void
  onProgressChanged: () => void
  onAskQuestion?: (prompt: string) => void
  onStartQuiz?: (topic: string) => void
}) {
  // Load saved in-flight exam if any exists in sessionStorage
  const [stage, setStage] = useState<ExamStage>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (parsed.exam && parsed.exam.questions?.length > 0) return 'active'
      }
    } catch {
      // ignore
    }
    return 'setup'
  })

  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard')
  const [subjectFilter] = useState<string>('')
  const [topicFilter, setTopicFilter] = useState<string>('')
  const [focusMode, setFocusMode] = useState<'balanced' | 'high_yield' | 'weak_spots'>('balanced')


  // Custom parameters
  const [customDuration, setCustomDuration] = useState<number>(30)
  const [customMarks, setCustomMarks] = useState<number>(50)
  const [customQuestions, setCustomQuestions] = useState<number>(8)

  const [exam, setExam] = useState<MockExam | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (parsed.exam && parsed.exam.questions?.length > 0) return parsed.exam
      }
    } catch {
      // ignore
    }
    return null
  })

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (typeof parsed.currentIndex === 'number') return parsed.currentIndex
      }
    } catch {
      // ignore
    }
    return 0
  })

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (parsed.answers) return parsed.answers
      }
    } catch {
      // ignore
    }
    return {}
  })

  const [flagged, setFlagged] = useState<Record<string, boolean>>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (parsed.flagged) return parsed.flagged
      }
    } catch {
      // ignore
    }
    return {}
  })

  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedExamState
        if (typeof parsed.timeRemainingSeconds === 'number') return parsed.timeRemainingSeconds
      }
    } catch {
      // ignore
    }
    return 30 * 60
  })

  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [showPalette, setShowPalette] = useState<boolean>(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false)
  const [result, setResult] = useState<MockExamResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeFilterTopic, setActiveFilterTopic] = useState<string | null>(null)

  const timerRef = useRef<number | null>(null)
  const initialTimeRef = useRef<number>(30 * 60)

  // Extract unique topics from documents
  const availableTopics = useMemo(() => {
    const list: string[] = []
    for (const doc of documents) {
      const t = doc.topic?.trim()
      if (t && !list.includes(t)) list.push(t)
    }
    return list
  }, [documents])

  // Sync state to sessionStorage whenever active exam is updated
  useEffect(() => {
    if (stage === 'active' && exam) {
      const stateToSave: SavedExamState = {
        exam,
        currentIndex,
        answers,
        flagged,
        timeRemainingSeconds,
        startTime: Date.now(),
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } else if (stage === 'done' || stage === 'setup') {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [stage, exam, currentIndex, answers, flagged, timeRemainingSeconds])

  // Prevent accidental page close while exam is in progress
  useEffect(() => {
    if (stage !== 'active') return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [stage])

  // Handle Intent triggers from other screens (e.g. Past Papers / Progress)
  useEffect(() => {
    if (!intent) return
    onIntentConsumed()
    void startExam({
      subject: intent.subject ?? null,
      topic: intent.topic ?? null,
      durationMinutes: intent.durationMinutes ?? 30,
      totalMarks: intent.totalMarks ?? 50,
      numQuestions: intent.numQuestions ?? 8,
      useWeakSpots: intent.useWeakSpots ?? false,
      useHighYield: intent.useHighYield ?? false,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  // Start exam generator
  async function startExam(options?: {
    subject?: string | null
    topic?: string | null
    durationMinutes?: number
    totalMarks?: number
    numQuestions?: number
    useWeakSpots?: boolean
    useHighYield?: boolean
    fastMode?: boolean
  }) {
    let duration = options?.durationMinutes
    let marks = options?.totalMarks
    let count = options?.numQuestions
    let weak = options?.useWeakSpots ?? (focusMode === 'weak_spots')
    let highYield = options?.useHighYield ?? (focusMode === 'high_yield')
    let isFast = options?.fastMode ?? (selectedPresetId === 'fast')

    if (!duration || !marks || !count) {
      if (selectedPresetId === 'custom') {
        duration = customDuration
        marks = customMarks
        count = customQuestions
      } else {
        const p = DEFAULT_PRESETS.find((preset) => preset.id === selectedPresetId) ?? DEFAULT_PRESETS[1]
        duration = p.duration_minutes
        marks = p.total_marks
        count = p.num_questions
      }
    }

    const sub = options?.subject ?? (subjectFilter || null)
    const top = options?.topic ?? (topicFilter || null)

    setStage('generating')
    setError(null)
    setResult(null)
    setAnswers({})
    setFlagged({})
    setCurrentIndex(0)
    setIsPaused(false)
    setShowPalette(false)
    setShowSubmitConfirm(false)

    try {
      const generated = await generateMockExam({
        subject: sub,
        topic: top,
        durationMinutes: duration,
        totalMarks: marks,
        numQuestions: count,
        useWeakSpots: weak,
        useHighYield: highYield,
        fastMode: isFast,
      })

      if (!generated.questions || generated.questions.length === 0) {
        throw new Error('No exam questions could be generated. Try selecting a different topic or uploading notes.')
      }

      const totalSecs = (generated.duration_minutes || duration) * 60
      initialTimeRef.current = totalSecs

      setTimeRemainingSeconds(totalSecs)
      setExam(generated)
      setStage('active')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate mock exam.')
      setStage('setup')
    }
  }

  // Live Timer Countdown Effect
  useEffect(() => {
    if (stage !== 'active' || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    timerRef.current = window.setInterval(() => {
      setTimeRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          // Auto-submit when time expires!
          void autoSubmitExam()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, isPaused, exam, answers])

  // Submit Exam grading logic
  const handleFinalSubmit = useCallback(async () => {
    if (!exam) return
    setStage('grading')
    setShowSubmitConfirm(false)

    const totalSecondsSpent = Math.max(1, initialTimeRef.current - timeRemainingSeconds)

    try {
      const graded = await submitMockExam({
        examId: exam.exam_id,
        subject: exam.subject,
        durationMinutes: exam.duration_minutes,
        timeTakenSeconds: totalSecondsSpent,
        answers,
        questions: exam.questions,
      })

      sessionStorage.removeItem(STORAGE_KEY)
      setResult(graded)
      setStage('done')
      onProgressChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error grading exam.')
      setStage('setup')
    }
  }, [exam, timeRemainingSeconds, answers, onProgressChanged])

  const autoSubmitExam = useCallback(async () => {
    await handleFinalSubmit()
  }, [handleFinalSubmit])

  // Helper to format countdown timer mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Helper to format duration in natural language (e.g. 18m 42s)
  const formatTimeSpent = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    if (secs === 0) return `${mins}m`
    return `${mins}m ${secs}s`
  }

  // Active question getters
  const currentQuestion: MockExamQuestion | undefined = exam?.questions[currentIndex]
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? '' : ''
  const isFlagged = currentQuestion ? !!flagged[currentQuestion.id] : false

  const totalAnswered = useMemo(() => {
    if (!exam) return 0
    return exam.questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length
  }, [exam, answers])

  const totalFlagged = useMemo(() => {
    if (!exam) return 0
    return exam.questions.filter((q) => !!flagged[q.id]).length
  }, [exam, flagged])

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (stage !== 'active' || !currentQuestion || isPaused) return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isInput = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      // MCQ Number Shortcuts (1-4) when not typing in textarea
      if (!isInput && currentQuestion?.type === 'mcq') {
        const digit = Number(event.key)
        if (Number.isInteger(digit) && digit >= 1 && digit <= currentQuestion.options.length) {
          event.preventDefault()
          const opt = currentQuestion.options[digit - 1]
          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }))
          return
        }
      }

      // Cmd+Enter or Ctrl+Enter to advance
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (exam && currentIndex + 1 < exam.questions.length) {
          setCurrentIndex(currentIndex + 1)
        } else {
          setShowSubmitConfirm(true)
        }
        return
      }

      // F key when not in textarea to toggle Flag
      if (!isInput && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault()
        setFlagged((prev) => ({ ...prev, [currentQuestion!.id]: !prev[currentQuestion!.id] }))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stage, currentQuestion, isPaused, currentIndex, exam])

  /* =========================================================================
     STAGE 1: SETUP SCREEN
     ========================================================================= */
  if (stage === 'setup') {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Flame size={20} strokeWidth={2} style={{ color: 'var(--accent)' }} />
              <span className="eyebrow t-label">Exam Simulator</span>
            </div>
            <h1 className="t-h1">Grill Me</h1>
          </div>
        </header>

        {error && !offline ? (
          <div className="notice notice--danger" role="alert" style={{ marginBottom: 'var(--space-5)' }}>
            <CircleX className="notice__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}

        {offline ? (
          <BackendNotice message={offlineMessage} onRetry={onRetry} />
        ) : documents.length === 0 ? (
          <div className="panel regmark">
            <EmptyState icon={Flame} title="No Study Notes or Question Papers Found">
              Upload course PDF notes or previous years' exam papers to start a timed mock exam.
            </EmptyState>
          </div>
        ) : (
          <div className="section" style={{ gap: 'var(--space-6)' }}>
            <div className="panel" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div style={{ maxWidth: '640px' }}>
                  <h2 className="t-h2" style={{ marginBottom: 'var(--space-2)' }}>
                    High-Stakes Timed Mock Examination
                  </h2>
                  <p className="t-body t-muted prose">
                    Simulate real exam pressure under strict countdown timer with marks allocated per question.
                    Upon completion, you will receive an in-depth score analysis and performance breakdown by topic.
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    background: 'var(--surface-2)',
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-soft)',
                  }}
                >
                  <Clock size={18} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
                  <div>
                    <div className="t-label" style={{ fontSize: '11px' }}>Standard Format</div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>Timed & Marked</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Presets Selection */}
            <div>
              <div className="t-label" style={{ marginBottom: 'var(--space-3)' }}>
                Choose Exam Tier
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                {DEFAULT_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPresetId(preset.id)}
                      style={{
                        textAlign: 'left',
                        padding: 'var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
                        background: isSelected ? 'var(--surface)' : 'var(--surface-2)',
                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                        <h3 className="t-h3" style={{ color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                          {preset.name}
                        </h3>
                        <span
                          className="t-label"
                          style={{
                            background: isSelected ? 'var(--accent)' : 'var(--surface)',
                            color: isSelected ? 'var(--on-accent)' : 'var(--text-muted)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            fontSize: '11px',
                          }}
                        >
                          {preset.duration_minutes} Mins
                        </span>
                      </div>
                      <div className="t-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
                        {preset.total_marks} Marks · {preset.num_questions} Questions
                      </div>
                      <p className="t-small t-muted" style={{ margin: 0, lineHeight: 1.4 }}>
                        {preset.description}
                      </p>
                    </button>
                  )
                })}

                {/* Custom Preset Card */}
                <button
                  type="button"
                  onClick={() => setSelectedPresetId('custom')}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: selectedPresetId === 'custom' ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
                    background: selectedPresetId === 'custom' ? 'var(--surface)' : 'var(--surface-2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <h3 className="t-h3" style={{ color: selectedPresetId === 'custom' ? 'var(--accent)' : 'var(--text)' }}>
                      Custom Exam
                    </h3>
                    <span
                      className="t-label"
                      style={{
                        background: selectedPresetId === 'custom' ? 'var(--accent)' : 'var(--surface)',
                        color: selectedPresetId === 'custom' ? 'var(--on-accent)' : 'var(--text-muted)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: '11px',
                      }}
                    >
                      Configurable
                    </span>
                  </div>
                  <div className="t-label" style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
                    {customMarks} Marks · {customDuration} Mins
                  </div>
                  <p className="t-small t-muted" style={{ margin: 0, lineHeight: 1.4 }}>
                    Customize exact duration, total marks target, and question count.
                  </p>
                </button>
              </div>
            </div>

            {/* Custom Configuration Controls */}
            {selectedPresetId === 'custom' && (
              <div
                className="panel"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-soft)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                <div className="field">
                  <span className="t-label">Duration: {customDuration} Minutes</span>
                  <input
                    type="range"
                    min="5"
                    max="90"
                    step="5"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </div>

                <div className="field">
                  <span className="t-label">Total Marks: {customMarks} Marks</span>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    step="5"
                    value={customMarks}
                    onChange={(e) => setCustomMarks(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </div>

                <div className="field">
                  <span className="t-label">Question Count: {customQuestions} Questions</span>
                  <input
                    type="range"
                    min="3"
                    max="20"
                    step="1"
                    value={customQuestions}
                    onChange={(e) => setCustomQuestions(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}

            {/* Topic Filter & Strategy Settings */}
            <div className="panel" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="field">
                  <label className="t-label" htmlFor="grill-topic">
                    Topic Focus
                  </label>
                  <div className="select-wrap">
                    <select
                      id="grill-topic"
                      className="select"
                      value={topicFilter}
                      onChange={(e) => setTopicFilter(e.target.value)}
                    >
                      <option value="">All Topics (Comprehensive Mix)</option>
                      {availableTopics.map((top) => (
                        <option key={top} value={top}>
                          {top}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="select-wrap__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                </div>

                <div className="field">
                  <label className="t-label" htmlFor="grill-strategy">
                    Focus Strategy
                  </label>
                  <div className="select-wrap">
                    <select
                      id="grill-strategy"
                      className="select"
                      value={focusMode}
                      onChange={(e) => setFocusMode(e.target.value as any)}
                    >
                      <option value="balanced">Balanced Curriculum Mix</option>
                      <option value="high_yield">High-Yield Past Paper Focus</option>
                      <option value="weak_spots">Weak-Spot Intensive</option>
                    </select>
                    <ChevronDown className="select-wrap__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-5)', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void startExam()}
                  style={{
                    padding: 'var(--space-3) var(--space-6)',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <Flame size={18} strokeWidth={2} />
                  <span>Start Mock Exam</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* =========================================================================
     STAGE 2: GENERATING SCREEN
     ========================================================================= */
  if (stage === 'generating') {
    return (
      <div className="screen">
        <div className="panel" style={{ padding: 'var(--space-7) var(--space-5)', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-pill)', marginBottom: 'var(--space-4)' }}>
            <Flame size={32} strokeWidth={1.8} style={{ color: 'var(--accent)' }} className="pulse-slow" />
          </div>
          <h2 className="t-h2" style={{ marginBottom: 'var(--space-2)' }}>
            Preparing Your Mock Examination Paper
          </h2>
          <p className="t-body t-muted prose" style={{ maxWidth: '520px', margin: '0 auto var(--space-5)' }}>
            Selecting multi-topic questions, weighting marks (2M, 5M, 10M), and configuring strict time parameters...
          </p>

          <div className="section" style={{ maxWidth: '400px', margin: '0 auto', gap: 'var(--space-3)' }}>
            <span className="skel skel--line skel--wide" />
            <span className="skel skel--line skel--mid" />
            <span className="skel skel--line skel--short" />
          </div>

          <div className="iline" style={{ maxWidth: '400px', margin: 'var(--space-5) auto 0' }}>
            <span className="iline__bar" />
          </div>
        </div>
      </div>
    )
  }

  /* =========================================================================
     STAGE 3: GRADING IN PROGRESS SCREEN
     ========================================================================= */
  if (stage === 'grading') {
    return (
      <div className="screen">
        <div className="panel" style={{ padding: 'var(--space-7) var(--space-5)', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: '16px', background: 'var(--surface-2)', borderRadius: 'var(--radius-pill)', marginBottom: 'var(--space-4)' }}>
            <Award size={32} strokeWidth={1.8} style={{ color: 'var(--accent)' }} className="pulse-slow" />
          </div>
          <h2 className="t-h2" style={{ marginBottom: 'var(--space-2)' }}>
            Grading Mock Exam & Computing Topic Breakdown
          </h2>
          <p className="t-body t-muted prose" style={{ maxWidth: '520px', margin: '0 auto var(--space-5)' }}>
            Evaluating conceptual answers against marking criteria and aggregating topic mastery statistics...
          </p>

          <div className="iline" style={{ maxWidth: '400px', margin: 'var(--space-5) auto 0' }}>
            <span className="iline__bar" />
          </div>
        </div>
      </div>
    )
  }

  /* =========================================================================
     STAGE 4: ACTIVE EXAM ARENA
     ========================================================================= */
  if (stage === 'active' && exam && currentQuestion) {
    const isLast = currentIndex + 1 >= exam.questions.length
    const isUrgent = timeRemainingSeconds < 60
    const isWarning = timeRemainingSeconds < 300 && !isUrgent

    return (
      <div className="screen">
        {/* Sticky Timed Examination Top Bar */}
        <div
          className="panel"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background: isUrgent
                    ? 'var(--danger-bg)'
                    : isWarning
                    ? 'var(--warning-bg)'
                    : 'var(--surface-2)',
                  color: isUrgent
                    ? 'var(--danger)'
                    : isWarning
                    ? 'var(--warning)'
                    : 'var(--accent)',
                  fontWeight: 700,
                  fontSize: '15px',
                  fontFamily: 'var(--font-mono)',
                  border: `1px solid ${isUrgent ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--border-soft)'}`,
                }}
              >
                <Clock size={16} strokeWidth={2} className={isUrgent ? 'pulse-fast' : ''} />
                <span>{formatTimer(timeRemainingSeconds)}</span>
              </div>

              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setIsPaused((prev) => !prev)}
                style={{ padding: '4px 8px', height: '32px' }}
                title={isPaused ? 'Resume exam clock' : 'Pause exam clock'}
              >
                {isPaused ? <Play size={15} /> : <Pause size={15} />}
                <span className="t-small" style={{ marginLeft: '4px' }}>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowPalette((prev) => !prev)}
                style={{ height: '34px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Layers size={14} />
                <span>Question Palette ({totalAnswered}/{exam.questions.length})</span>
              </button>

              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setShowSubmitConfirm(true)}
                style={{ height: '34px', fontSize: '13px' }}
              >
                Submit Paper
              </button>
            </div>
          </div>
        </div>

        {/* Paused Overlay */}
        {isPaused && (
          <div
            className="panel"
            style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              background: 'var(--surface)',
              border: '2px dashed var(--warning)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <h3 className="t-h3" style={{ marginBottom: 'var(--space-2)', color: 'var(--warning)' }}>
              Exam Timer Paused
            </h3>
            <p className="t-body t-muted" style={{ marginBottom: 'var(--space-4)' }}>
              Question contents are concealed while paused to preserve testing integrity.
            </p>
            <button type="button" className="btn btn--primary" onClick={() => setIsPaused(false)}>
              Resume Exam
            </button>
          </div>
        )}

        {/* Question Palette Drawer */}
        {showPalette && (
          <div
            className="panel"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <span className="t-label">Question Palette Navigation</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowPalette(false)}
                style={{ padding: '2px 6px', fontSize: '12px' }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                gap: 'var(--space-2)',
              }}
            >
              {exam.questions.map((q, idx) => {
                const hasAnswer = (answers[q.id] ?? '').trim().length > 0
                const isFlag = !!flagged[q.id]
                const isCurrent = idx === currentIndex

                let bg = 'var(--surface)'
                let borderColor = 'var(--border-soft)'
                let textColor = 'var(--text)'

                if (isCurrent) {
                  borderColor = 'var(--accent)'
                }
                if (hasAnswer) {
                  bg = 'var(--success-bg)'
                  borderColor = 'var(--success)'
                  textColor = 'var(--success)'
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx)
                      setShowPalette(false)
                    }}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 'var(--radius-sm)',
                      background: bg,
                      border: `2px solid ${borderColor}`,
                      color: textColor,
                      fontWeight: isCurrent ? 700 : 500,
                      fontSize: '13px',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <span>{q.question_number || `Q${idx + 1}`}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{q.marks}M</span>
                    {isFlag && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '3px',
                          right: '3px',
                          background: 'var(--warning)',
                          borderRadius: 'var(--radius-pill)',
                          width: '6px',
                          height: '6px',
                        }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Submit Confirmation Modal */}
        {showSubmitConfirm && (
          <div
            className="notice notice--warning"
            role="alert"
            style={{
              marginBottom: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <h3 className="t-h3" style={{ marginBottom: '4px' }}>Ready to submit your exam paper?</h3>
              <p className="t-body">
                You have answered <strong>{totalAnswered} of {exam.questions.length}</strong> questions.
                {totalFlagged > 0 && ` (${totalFlagged} flagged for review)`}
                {timeRemainingSeconds > 0 && ` You still have ${formatTimer(timeRemainingSeconds)} remaining.`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Return to Exam
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleFinalSubmit()}
              >
                Confirm & Grade Paper
              </button>
            </div>
          </div>
        )}

        {!isPaused && (
          <div className="section" style={{ gap: 'var(--space-5)' }}>
            {/* Question Card */}
            <div
              className="panel"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                padding: 'var(--space-5)',
              }}
            >
              {/* Question Header & Weight */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-4)',
                  paddingBottom: 'var(--space-3)',
                  borderBottom: '1px solid var(--border-soft)',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span
                    style={{
                      background: 'var(--surface-2)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {currentQuestion.question_number || `Q${currentIndex + 1}`}
                  </span>
                  <span
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--on-accent)',
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-pill)',
                      fontWeight: 600,
                      fontSize: '12px',
                    }}
                  >
                    {currentQuestion.marks} Marks
                  </span>
                  <span className="t-label" style={{ color: 'var(--text-muted)' }}>
                    Topic: {currentQuestion.topic}
                    {currentQuestion.subtopic ? ` · ${currentQuestion.subtopic}` : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setFlagged((prev) => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    color: isFlagged ? 'var(--warning)' : 'var(--text-muted)',
                    fontWeight: isFlagged ? 600 : 400,
                    fontSize: '13px',
                  }}
                  title="Bookmark / flag question for review before final submission"
                >
                  {isFlagged ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  <span>{isFlagged ? 'Flagged for Review' : 'Flag for Review (F)'}</span>
                </button>
              </div>

              {/* Question Body */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <p
                  className="t-body"
                  style={{
                    fontSize: '16px',
                    lineHeight: 1.6,
                    fontWeight: 500,
                    color: 'var(--text)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {currentQuestion.question}
                </p>
              </div>

              {/* Input Area: MCQ Options or Free-form Essay/Problem Textarea */}
              {currentQuestion.type === 'mcq' && currentQuestion.options && currentQuestion.options.length > 0 ? (
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {currentQuestion.options.map((optionText, optIdx) => {
                    const isSelected = currentAnswer === optionText
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionText }))}
                        style={{
                          textAlign: 'left',
                          padding: 'var(--space-3) var(--space-4)',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
                          background: isSelected ? 'var(--surface-2)' : 'var(--surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: 'var(--radius-pill)',
                            border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--text-faint)'}`,
                            background: isSelected ? 'var(--accent)' : 'transparent',
                            color: isSelected ? 'var(--on-accent)' : 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {optIdx + 1}
                        </span>
                        <span className="t-body" style={{ color: 'var(--text)', flex: 1 }}>
                          {optionText}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <label className="t-label" htmlFor="exam-answer-text">
                      Your Response & Working
                    </label>
                    <span className="t-small t-muted">
                      {currentAnswer.trim() ? `${currentAnswer.trim().split(/\s+/).length} words` : '0 words'}
                    </span>
                  </div>
                  <textarea
                    id="exam-answer-text"
                    className="textarea"
                    rows={currentQuestion.marks >= 8 ? 10 : 6}
                    value={currentAnswer}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))}
                    placeholder="Type your structured solution, steps, code, or explanation here..."
                    style={{
                      fontFamily: currentQuestion.type === 'long_answer' ? 'inherit' : 'var(--font-ui)',
                      fontSize: '15px',
                      lineHeight: 1.5,
                      padding: 'var(--space-3)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Bottom Question Step Toolbar */}
            <div
              className="toolbar"
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
              }}
            >
              <button
                type="button"
                className="btn btn--secondary"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <div className="t-label" style={{ color: 'var(--text-muted)' }}>
                Question {currentIndex + 1} of {exam.questions.length}
              </div>

              {isLast ? (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setShowSubmitConfirm(true)}
                >
                  <span>Review & Submit</span>
                  <Send size={15} style={{ marginLeft: '4px' }} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setCurrentIndex((prev) => Math.min(exam.questions.length - 1, prev + 1))}
                >
                  <span>Next Question</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* =========================================================================
     STAGE 5: DONE / DETAILED SCORE & TOPIC BREAKDOWN
     ========================================================================= */
  if (stage === 'done' && result) {
    const isPass = result.score_percentage >= 50.0

    // Filter questions by selected topic if clicked
    const displayedQuestions = activeFilterTopic
      ? result.graded_questions.filter((g) => g.topic === activeFilterTopic)
      : result.graded_questions

    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Flame size={20} strokeWidth={2} style={{ color: 'var(--accent)' }} />
              <span className="eyebrow t-label">Exam Evaluation & Topic Breakdown</span>
            </div>
            <h1 className="t-h1">{result.title || `${result.subject} Mock Exam`}</h1>
          </div>
          <span className="t-label">{result.recorded_at.slice(0, 10)}</span>
        </header>

        {/* Top-Line Scorecard */}
        <div
          className="panel regmark"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-5)', alignItems: 'center' }}>
            <div>
              <div className="t-label" style={{ marginBottom: 'var(--space-1)' }}>Overall Exam Score</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <span className="score__value tabular" style={{ fontSize: '42px', fontWeight: 800, color: isPass ? 'var(--success)' : 'var(--danger)' }}>
                  {formatPercent(result.score_percentage)}
                </span>
                <span className="t-body t-muted" style={{ fontWeight: 600 }}>
                  {result.total_marks_awarded} / {result.total_marks_possible} Marks
                </span>
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 'var(--space-4)' }}>
              <div className="t-label" style={{ marginBottom: 'var(--space-1)' }}>Performance Tier</div>
              <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text)', marginBottom: '4px' }}>
                {result.performance_tier}
              </div>
              <div className="t-small t-muted">
                Completed in {formatTimeSpent(result.time_taken_seconds)} of {result.duration_minutes}m
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 'var(--space-4)' }}>
              <div className="t-label" style={{ marginBottom: 'var(--space-1)' }}>Diagnostic Insights</div>
              {result.strongest_topic && (
                <div className="t-small" style={{ color: 'var(--success)', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>Strongest:</span> {result.strongest_topic}
                </div>
              )}
              {result.weakest_topic && (
                <div className="t-small" style={{ color: 'var(--danger)' }}>
                  <span style={{ fontWeight: 600 }}>Priority Gap:</span> {result.weakest_topic}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TOPIC PERFORMANCE BREAKDOWN SECTION (Core Feature) */}
        <div className="section" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <div>
              <h2 className="t-h2">Score Breakdown by Topic</h2>
              <p className="t-body t-muted prose">
                Weighted performance across each evaluated curriculum topic.
              </p>
            </div>
            {activeFilterTopic && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setActiveFilterTopic(null)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Clear Filter (Showing {activeFilterTopic})
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {result.topic_breakdown.map((item) => {
              const isSelected = activeFilterTopic === item.topic
              let barColor = 'var(--success)'
              let badgeBg = 'var(--success-bg)'
              let badgeColor = 'var(--success)'

              if (item.status === 'Needs Review') {
                barColor = 'var(--warning)'
                badgeBg = 'var(--warning-bg)'
                badgeColor = 'var(--warning)'
              } else if (item.status === 'Weak Spot') {
                barColor = 'var(--danger)'
                badgeBg = 'var(--danger-bg)'
                badgeColor = 'var(--danger)'
              }

              return (
                <div
                  key={item.topic}
                  style={{
                    background: isSelected ? 'var(--surface)' : 'var(--surface-2)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setActiveFilterTopic(isSelected ? null : item.topic)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                      <h3 className="t-h3" style={{ fontSize: '15px', color: 'var(--text)' }}>
                        {item.topic}
                      </h3>
                      <span
                        style={{
                          background: badgeBg,
                          color: badgeColor,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-2)' }}>
                      <span className="t-small t-muted">
                        {item.question_count} {item.question_count === 1 ? 'Question' : 'Questions'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '14px', fontFamily: 'var(--font-mono)' }}>
                        {item.marks_awarded} / {item.marks_possible} M ({formatPercent(item.score_percentage)})
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: '6px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, item.score_percentage))}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 'var(--radius-pill)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                    {onAskQuestion && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAskQuestion(`Explain the key concepts of ${item.topic} and where students typically lose marks.`)
                        }}
                        style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
                      >
                        Ask AI
                      </button>
                    )}
                    {onStartQuiz && (
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onStartQuiz(item.topic)
                        }}
                        style={{ fontSize: '11px', padding: '2px 8px', height: '26px' }}
                      >
                        Practice Topic
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detailed Question Graded Review */}
        <div className="section" style={{ gap: 'var(--space-4)' }}>
          <h2 className="t-h2">
            Detailed Marking & Solution Rubric {activeFilterTopic ? `(${activeFilterTopic})` : ''}
          </h2>

          <div className="section" style={{ gap: 'var(--space-4)' }}>
            {displayedQuestions.map((graded) => {
              const isFull = graded.marks_awarded === graded.marks_possible
              const isZero = graded.marks_awarded === 0

              return (
                <div
                  className="panel"
                  key={graded.question_id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-soft)',
                    padding: 'var(--space-5)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      {graded.is_correct ? (
                        <CheckCircle2 size={20} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      ) : (
                        <CircleX size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                      )}
                      <div>
                        <span className="t-label" style={{ fontFamily: 'var(--font-mono)' }}>
                          {graded.question_number} · {graded.topic}
                        </span>
                        <h3 className="t-h3" style={{ marginTop: '2px' }}>
                          {graded.question_text}
                        </h3>
                      </div>
                    </div>

                    <div
                      style={{
                        background: isFull
                          ? 'var(--success-bg)'
                          : isZero
                          ? 'var(--danger-bg)'
                          : 'var(--warning-bg)',
                        color: isFull
                          ? 'var(--success)'
                          : isZero
                          ? 'var(--danger)'
                          : 'var(--warning)',
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-pill)',
                        fontWeight: 700,
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {graded.marks_awarded} / {graded.marks_possible} Marks
                    </div>
                  </div>

                  <div className="answer-pair" style={{ marginTop: 'var(--space-3)' }}>
                    <div className="answer-pair__row">
                      <span className="answer-pair__key">Your Answer</span>
                      <span style={{ whiteSpace: 'pre-wrap' }}>{graded.user_answer || '(No answer provided)'}</span>
                    </div>
                    <div className="answer-pair__row">
                      <span className="answer-pair__key">Reference Solution</span>
                      <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{graded.correct_answer}</span>
                    </div>
                  </div>

                  {graded.feedback && (
                    <div
                      style={{
                        marginTop: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: `3px solid ${graded.is_correct ? 'var(--success)' : 'var(--warning)'}`,
                      }}
                    >
                      <div className="t-label" style={{ fontSize: '11px', marginBottom: '2px' }}>
                        Examiner Feedback & Rubric Rationale
                      </div>
                      <p className="t-small" style={{ margin: 0, lineHeight: 1.5 }}>
                        {graded.feedback}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="toolbar" style={{ marginTop: 'var(--space-6)', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setExam(null)
              setResult(null)
              setStage('setup')
            }}
          >
            <RefreshCw size={15} />
            <span>Configure Another Exam</span>
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void startExam()}
          >
            <Flame size={15} />
            <span>Grill Me Again</span>
          </button>
        </div>
      </div>
    )
  }

  // Defensive fallback
  return (
    <div className="screen">
      <div className="panel">
        <EmptyState icon={CircleHelp} title="Mock Exam Session Concluded">
          Start a new timed mock exam to test your exam readiness.
        </EmptyState>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
          <button type="button" className="btn btn--primary" onClick={() => setStage('setup')}>
            Return to Setup
          </button>
        </div>
      </div>
    </div>
  )
}
