import {
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleX,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { generateQuiz, submitQuiz } from '../lib/api'
import { formatPercent } from '../lib/format'
import type { DocumentInfo, Quiz, QuizResult } from '../lib/types'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'
import { QuizCard } from '../components/QuizCard'

export interface QuizIntent {
  useWeakSpots: boolean
  topic?: string | null
}

type Stage = 'setup' | 'generating' | 'answering' | 'grading' | 'done'

const STORAGE_KEY = 'gist_active_quiz_v1'

interface SavedQuizSession {
  quiz: Quiz
  index: number
  answers: Record<string, string>
}

export function QuizScreen({
  documents,
  intent,
  offline,
  offlineMessage,
  onRetry,
  onIntentConsumed,
  onProgressChanged,
}: {
  documents: DocumentInfo[]
  intent: QuizIntent | null
  offline: boolean
  offlineMessage: string | null
  onRetry: () => void
  onIntentConsumed: () => void
  onProgressChanged: () => void
}) {
  const [stage, setStage] = useState<Stage>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedQuizSession
        if (parsed.quiz && parsed.quiz.questions?.length) return 'answering'
      }
    } catch {
      // ignore
    }
    return 'setup'
  })
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(5)
  const [quiz, setQuiz] = useState<Quiz | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedQuizSession
        if (parsed.quiz && parsed.quiz.questions?.length) return parsed.quiz
      }
    } catch {
      // ignore
    }
    return null
  })
  const [index, setIndex] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedQuizSession
        if (typeof parsed.index === 'number') return parsed.index
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
        const parsed = JSON.parse(saved) as SavedQuizSession
        if (parsed.answers) return parsed.answers
      }
    } catch {
      // ignore
    }
    return {}
  })
  const [result, setResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)

  // Persist in-flight quiz session so user never loses their active state.
  useEffect(() => {
    if (stage === 'answering' && quiz) {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ quiz, index, answers })
      )
    } else if (stage === 'done' || stage === 'setup') {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [stage, quiz, index, answers])

  // Prevent accidental browser tab closure or refresh mid-quiz.
  useEffect(() => {
    if (stage !== 'answering') return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [stage])

  const topics = useMemo(() => {
    const found: string[] = []
    for (const doc of documents) {
      const value = doc.topic?.trim()
      if (value && !found.includes(value)) found.push(value)
    }
    return found
  }, [documents])

  async function start(options: {
    topic?: string | null
    numQuestions?: number
    useWeakSpots?: boolean
  }) {
    setStage('generating')
    setError(null)
    setResult(null)
    setAnswers({})
    setIndex(0)
    setConfirmExit(false)
    try {
      const generated = await generateQuiz({
        topic: options.topic ?? null,
        numQuestions: options.numQuestions ?? 5,
        useWeakSpots: options.useWeakSpots ?? false,
      })
      if (!generated.questions.length) {
        throw new Error('No questions came back. Try a different topic.')
      }
      setQuiz(generated)
      setStage('answering')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t build a quiz.')
      setStage('setup')
    }
  }

  // A request from the Progress screen: jump straight into an adaptive quiz.
  useEffect(() => {
    if (!intent) return
    onIntentConsumed()
    void start({ useWeakSpots: intent.useWeakSpots, topic: intent.topic ?? null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent])

  const current = quiz?.questions[index]
  const currentAnswer = current ? answers[current.id] ?? '' : ''
  const canAdvance = currentAnswer.trim().length > 0

  async function finish(finishedQuiz: Quiz, finalAnswers: Record<string, string>) {
    setStage('grading')
    try {
      const graded = await submitQuiz({
        quizId: finishedQuiz.quiz_id,
        topic: finishedQuiz.topic,
        answers: finalAnswers,
        questions: finishedQuiz.questions,
      })
      sessionStorage.removeItem(STORAGE_KEY)
      setResult(graded)
      setStage('done')
      onProgressChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t grade the quiz.')
      setStage('setup')
    }
  }

  function advance() {
    if (!quiz || !canAdvance) return
    if (index + 1 < quiz.questions.length) {
      setIndex(index + 1)
      return
    }
    void finish(quiz, answers)
  }

  function goPrevious() {
    if (index > 0) {
      setIndex(index - 1)
    }
  }

  // Number keys pick an option, Enter moves on. Keyboard-first, no animation.
  useEffect(() => {
    if (stage !== 'answering' || !current || current.type !== 'mcq') return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      const digit = Number(event.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= current!.options.length) {
        event.preventDefault()
        const option = current!.options[digit - 1]
        setAnswers((prev) => ({ ...prev, [current!.id]: option }))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        advance()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, current, index, answers])

  /* ------------------------------- Setup ------------------------------- */
  if (stage === 'setup') {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <h1 className="t-h1">Test yourself</h1>
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
            <EmptyState icon={CircleHelp} title="No notes to quiz yet">
              Upload a PDF and Gist will write questions from it.
            </EmptyState>
          </div>
        ) : (
          <div className="section">
            <p className="t-body t-muted prose">
              Questions are written from your notes on the topic you pick. Nothing is
              revealed until you finish.
            </p>

            <div className="toolbar">
              <div className="field toolbar__field">
                <label className="t-label" htmlFor="quiz-topic">
                  Topic
                </label>
                <div className="select-wrap">
                  <select
                    id="quiz-topic"
                    className="select"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  >
                    <option value="">All topics</option>
                    {topics.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="select-wrap__icon"
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <div className="field toolbar__count">
                <span className="t-label" id="count-label">
                  Questions
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '40px' }}>
                  <input
                    type="range"
                    min="5"
                    max="20"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    aria-labelledby="count-label"
                    style={{ width: '120px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span className="tabular" style={{ fontWeight: 500, fontSize: '15px', minWidth: '20px' }}>
                    {count}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn--primary"
                onClick={() =>
                  void start({ topic: topic || null, numQuestions: count })
                }
              >
                Start quiz
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ---------------------------- Generating ----------------------------- */
  if ((stage === 'generating' || stage === 'grading') && !result) {
    const label =
      stage === 'generating'
        ? 'Writing questions from your notes…'
        : 'Grading your answers…'
    return (
      <div className="screen">
        <div className="panel">
          <span className="t-label">{label}</span>
          <div className="section" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-3)' }}>
            <span className="skel skel--line skel--wide" />
            <span className="skel skel--line skel--mid" />
            <span className="skel skel--line skel--short" />
          </div>
          <div className="iline" style={{ marginTop: 'var(--space-5)' }}>
            <span className="iline__bar" />
          </div>
        </div>
      </div>
    )
  }

  /* ----------------------------- Answering ----------------------------- */
  if (stage === 'answering' && quiz && current) {
    const isLast = index + 1 >= quiz.questions.length
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <span className="eyebrow t-label">
              {quiz.is_adaptive ? 'Adaptive quiz' : 'Quiz'}
            </span>
            <h1 className="t-h1">{quiz.topic}</h1>
          </div>
        </header>

        {confirmExit ? (
          <div
            className="notice notice--warning"
            role="alert"
            style={{
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <p>Leave this quiz? Your in-progress answers will be cleared.</p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setConfirmExit(false)}
              >
                Keep quizzing
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  sessionStorage.removeItem(STORAGE_KEY)
                  setQuiz(null)
                  setAnswers({})
                  setIndex(0)
                  setConfirmExit(false)
                  setStage('setup')
                }}
              >
                Discard & leave
              </button>
            </div>
          </div>
        ) : null}

        <QuizCard
          question={current}
          index={index}
          total={quiz.questions.length}
          answer={currentAnswer}
          onAnswer={(value) =>
            setAnswers((prev) => ({ ...prev, [current.id]: value }))
          }
        />

        <div
          className="toolbar"
          style={{
            marginTop: 'var(--space-4)',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={index === 0}
              onClick={goPrevious}
              aria-label="Previous question"
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setConfirmExit(true)}
              style={{ color: 'var(--text-muted)' }}
            >
              Leave
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="t-label">
              {current.type === 'mcq'
                ? '1–4 to choose · Enter to advance'
                : 'Enter to advance'}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canAdvance}
              onClick={advance}
            >
              {isLast ? 'Finish quiz' : 'Next question'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------- Result ------------------------------ */
  if (stage === 'done' && result) {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <span className="eyebrow t-label">Result</span>
            <h1 className="t-h1">{result.topic}</h1>
          </div>
          <span className="t-label">{result.recorded_at.slice(0, 10)}</span>
        </header>

        <div className="panel regmark">
          <div className="score">
            <span className="score__value tabular">
              {formatPercent(result.score_percentage)}
            </span>
            <span className="t-body t-muted">
              {result.correct_count} of {result.total_questions} correct
            </span>
          </div>
        </div>

        <div className="section">
          {result.graded_questions.map((graded) => (
            <div className="review" key={graded.question_id}>
              <div className="review__head">
                {graded.is_correct ? (
                  <CheckCircle2
                    className="review__icon review__icon--ok"
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ) : (
                  <CircleX
                    className="review__icon review__icon--no"
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                )}
                <div className="section" style={{ gap: '2px' }}>
                  <h3 className="t-h3">{graded.question_text}</h3>
                  <span className="t-label">
                    {graded.is_correct ? 'Correct' : 'Incorrect'} · {graded.topic}
                  </span>
                </div>
              </div>

              <div className="answer-pair">
                <div className="answer-pair__row">
                  <span className="answer-pair__key">You</span>
                  <span>{graded.user_answer || 'No answer'}</span>
                </div>
                <div className="answer-pair__row">
                  <span className="answer-pair__key">Correct</span>
                  <span>{graded.correct_answer}</span>
                </div>
              </div>

              {graded.explanation ? (
                <p
                  className="t-small t-muted prose"
                  style={{ paddingLeft: 'calc(18px + var(--space-3))' }}
                >
                  {graded.explanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="toolbar" style={{ marginTop: 'var(--space-5)' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setQuiz(null)
              setResult(null)
              setStage('setup')
            }}
          >
            <RefreshCw size={15} strokeWidth={1.5} aria-hidden="true" />
            Start another quiz
          </button>
        </div>
      </div>
    )
  }

  // Defensive fallback: never leave the screen blank.
  return (
    <div className="screen">
      <div className="panel">
        <EmptyState icon={CircleHelp} title="That quiz didn’t load">
          Start again and Gist will write a fresh set of questions.
        </EmptyState>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setStage('setup')}
          >
            Back to setup
          </button>
        </div>
      </div>
    </div>
  )
}
