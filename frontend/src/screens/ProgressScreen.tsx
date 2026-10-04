import {
  ChartColumn,
  RefreshCw,
  Sparkles,
  GraduationCap,
  CheckCircle2,
  CircleX,
  X,
  Eye,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getQuizAttemptDetails, getTopicHistory } from '../lib/api'
import { formatPercent, pluralize, relativeTime } from '../lib/format'
import type { ProgressSummary, TopicStat, PriorityMatrixResponse, QuizResult } from '../lib/types'
import type { ScreenId } from '../lib/nav'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'
import { MasteryBar } from '../components/MasteryBar'
import { TopicTile, type TileStatus } from '../components/TopicTile'

function lastAttemptedFirst(topics: TopicStat[]): TopicStat[] {
  return [...topics].sort((a, b) => {
    const aTime = a.last_attempted ? new Date(a.last_attempted).getTime() : 0
    const bTime = b.last_attempted ? new Date(b.last_attempted).getTime() : 0
    if (aTime !== bTime) {
      return bTime - aTime // most recently done first
    }
    if (a.total_questions !== b.total_questions) {
      return b.total_questions - a.total_questions
    }
    return a.topic.localeCompare(b.topic)
  })
}

function weakestFirst(topics: TopicStat[]): TopicStat[] {
  return [...topics].sort((a, b) => {
    const aUntried = a.status === 'Unattempted'
    const bUntried = b.status === 'Unattempted'
    if (aUntried !== bUntried) return aUntried ? 1 : -1
    return a.accuracy - b.accuracy
  })
}

function tileMeta(stat: TopicStat): string {
  if (stat.status === 'Unattempted' || stat.total_questions === 0) return 'No quiz yet'
  return `${stat.total_questions} ${pluralize(stat.total_questions, 'question')}`
}

function tileStatus(status: TopicStat['status']): TileStatus {
  if (status === 'Mastered') return 'mastered'
  if (status === 'Needs Review') return 'review'
  if (status === 'Weak Spot') return 'weak'
  return 'unattempted'
}

export function ProgressScreen({
  progress,
  priorityMatrix,
  loading,
  error,
  onRefresh,
  onStartWeakQuiz,
  onStartHighYieldQuiz,
  onStartTopicQuiz,
  onNavigate,
}: {
  progress: ProgressSummary | null
  priorityMatrix?: PriorityMatrixResponse | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onStartWeakQuiz: () => void
  onStartHighYieldQuiz?: () => void
  onStartTopicQuiz: (topic: string) => void
  onNavigate: (next: ScreenId) => void
}) {
  const [selectedAttempt, setSelectedAttempt] = useState<QuizResult | null>(null)
  const [loadingAttemptId, setLoadingAttemptId] = useState<string | null>(null)
  const [attemptError, setAttemptError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedAttempt) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAttempt(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAttempt])

  async function handleOpenAttempt(quizId: string) {
    setLoadingAttemptId(quizId)
    setAttemptError(null)
    try {
      const data = await getQuizAttemptDetails(quizId)
      setSelectedAttempt(data)
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : 'Could not load quiz results.')
    } finally {
      setLoadingAttemptId(null)
    }
  }

  async function handleTopicClick(topic: string, totalQuestions: number) {
    if (totalQuestions === 0) {
      onStartTopicQuiz(topic)
      return
    }
    setLoadingAttemptId(`topic_${topic}`)
    setAttemptError(null)
    try {
      const data = await getTopicHistory(topic)
      setSelectedAttempt(data)
    } catch (err) {
      // Fallback to quiz attempt if direct topic history had an issue
      const pastAttempt = progress?.recent_quizzes.find((q) =>
        q.topic.toLowerCase().includes(topic.toLowerCase())
      )
      if (pastAttempt) {
        handleOpenAttempt(pastAttempt.quiz_id)
      } else {
        onStartTopicQuiz(topic)
      }
    } finally {
      setLoadingAttemptId(null)
    }
  }

  if (selectedAttempt) {
    const isTopicHistory = selectedAttempt.quiz_id.startsWith('topic_')
    const isPass = selectedAttempt.score_percentage >= 50.0

    return (
      <div className="screen screen--wide">
        <header className="page-head">
          <div className="page-head__meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelectedAttempt(null)}
                style={{ padding: '0 var(--space-2)', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <ArrowLeft size={14} />
                <span>Where you stand</span>
              </button>
              <span className="t-muted">/</span>
              <span className="eyebrow t-label">
                {isTopicHistory ? 'Topic History & Remarks' : 'Quiz Results Review'}
              </span>
            </div>
            <h1 className="t-h1" style={{ marginTop: 'var(--space-2)' }}>
              {selectedAttempt.topic}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="t-label">
              {selectedAttempt.recorded_at ? selectedAttempt.recorded_at.slice(0, 10) : 'Recent attempt'}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              onClick={() => setSelectedAttempt(null)}
              aria-label="Back to overview"
              title="Back to overview"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Top-Line Scorecard */}
        <div
          className="panel regmark"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: 'var(--space-5) var(--space-6)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-5)',
              alignItems: 'center',
            }}
          >
            <div>
              <div className="t-label" style={{ marginBottom: 'var(--space-1)' }}>
                {isTopicHistory ? 'Overall Topic Accuracy' : 'Quiz Score'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <span
                  className="score__value tabular"
                  style={{ fontSize: '42px', fontWeight: 800, color: isPass ? 'var(--success)' : 'var(--danger)' }}
                >
                  {formatPercent(selectedAttempt.score_percentage)}
                </span>
                <span className="t-body t-muted" style={{ fontWeight: 600 }}>
                  {selectedAttempt.correct_count} of {selectedAttempt.total_questions} correct
                </span>
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 'var(--space-4)' }}>
              <div className="t-label" style={{ marginBottom: 'var(--space-1)' }}>Mastery Level</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '4px' }}>
                <span
                  className={`history-item__badge ${
                    selectedAttempt.score_percentage >= 80
                      ? 'history-item__badge--success'
                      : selectedAttempt.score_percentage >= 50
                        ? 'history-item__badge--warning'
                        : 'history-item__badge--danger'
                  }`}
                  style={{ fontSize: '13px', padding: '4px 10px' }}
                >
                  {selectedAttempt.score_percentage >= 80
                    ? 'Mastered'
                    : selectedAttempt.score_percentage >= 50
                      ? 'Needs Review'
                      : 'Weak Spot'}
                </span>
              </div>
              <div className="t-small t-muted" style={{ marginTop: '6px' }}>
                {selectedAttempt.score_percentage >= 80
                  ? 'Strong mastery across tested questions.'
                  : selectedAttempt.score_percentage >= 50
                    ? 'Adequate grasp with key areas needing practice.'
                    : 'Critical focus area. Recommend targeted review.'}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-soft)', paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const topicToRetake = selectedAttempt.topic
                  setSelectedAttempt(null)
                  onStartTopicQuiz(topicToRetake)
                }}
              >
                <RotateCcw size={14} style={{ marginRight: '6px' }} />
                {isTopicHistory ? 'Start New Quiz on this Topic' : 'Retake this Quiz'}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setSelectedAttempt(null)}
              >
                ← Back to Overview
              </button>
            </div>
          </div>
        </div>

        {/* Question-by-Question Graded Breakdown */}
        <div className="section" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 className="t-h2">Question Breakdown & Examiner Remarks</h2>
              <p className="t-body t-muted prose">
                Review your submitted answers alongside the model reference solutions and detailed remarks.
              </p>
            </div>
            <span className="t-label">
              {selectedAttempt.graded_questions.length} {pluralize(selectedAttempt.graded_questions.length, 'Question')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {selectedAttempt.graded_questions.map((graded, idx) => (
              <div
                key={graded.question_id || idx}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-soft)',
                  borderLeft: `4px solid ${graded.is_correct ? 'var(--success)' : 'var(--danger)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {graded.is_correct ? (
                      <CheckCircle2 size={18} strokeWidth={2} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    ) : (
                      <CircleX size={18} strokeWidth={2} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    )}
                    <h3 className="t-h3" style={{ fontSize: '15px', margin: 0 }}>
                      Question {idx + 1}
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: graded.is_correct ? 'var(--success-bg)' : 'var(--danger-bg)',
                        color: graded.is_correct ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {graded.is_correct ? 'Correct' : 'Incorrect'}
                    </span>
                    <span className="t-label" style={{ fontSize: '11px' }}>
                      {graded.topic}
                    </span>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--text)' }}>
                  {graded.question_text}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                  <div
                    style={{
                      background: 'var(--surface-2)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-soft)',
                    }}
                  >
                    <div className="t-label" style={{ fontSize: '11px', marginBottom: '4px', color: graded.is_correct ? 'var(--success)' : 'var(--danger)' }}>
                      Your Response
                    </div>
                    <div style={{ fontSize: '14px', lineHeight: 1.4, color: 'var(--text)' }}>
                      {graded.user_answer ? (
                        graded.user_answer
                      ) : (
                        <em style={{ color: 'var(--text-muted)' }}>Blank / No answer submitted</em>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'var(--surface-2)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-soft)',
                    }}
                  >
                    <div className="t-label" style={{ fontSize: '11px', marginBottom: '4px', color: 'var(--text-muted)' }}>
                      Reference Solution
                    </div>
                    <div style={{ fontSize: '14px', lineHeight: 1.4, color: 'var(--text)' }}>
                      {graded.correct_answer}
                    </div>
                  </div>
                </div>

                {graded.explanation ? (
                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'color-mix(in srgb, var(--surface-2) 60%, var(--surface))',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: '3px solid var(--accent)',
                      fontSize: '13px',
                      lineHeight: 1.5,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '2px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Examiner Remarks & Diagnostic Feedback
                    </strong>
                    {graded.explanation}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setSelectedAttempt(null)}
          >
            <ArrowLeft size={15} style={{ marginRight: '4px' }} />
            Back to Overview
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const topicToRetake = selectedAttempt.topic
              setSelectedAttempt(null)
              onStartTopicQuiz(topicToRetake)
            }}
          >
            <RotateCcw size={15} style={{ marginRight: '6px' }} />
            {isTopicHistory ? 'Start New Quiz on this Topic' : 'Retake this Quiz'}
          </button>
        </div>
      </div>
    )
  }

  if (loading && !progress) {
    return (
      <div className="screen">
        <div className="panel">
          <span className="t-label">Loading your progress…</span>
          <div className="section" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-3)' }}>
            <span className="skel skel--line skel--wide" />
            <span className="skel skel--line skel--mid" />
          </div>
        </div>
      </div>
    )
  }

  if (!progress) {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <h1 className="t-h1">Where you stand</h1>
          </div>
        </header>
        <BackendNotice message={error} onRetry={onRefresh} />
      </div>
    )
  }

  const recentTopics = lastAttemptedFirst(progress.topics)
  const weakestTopics = weakestFirst(progress.topics)
  const attempted = weakestTopics.filter((stat) => stat.status !== 'Unattempted')
  const hasHistory = progress.total_quizzes_taken > 0

  return (
    <div className="screen screen--wide">
      <header className="page-head">
        <div className="page-head__meta">
          <h1 className="t-h1">Where you stand</h1>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label="Refresh progress"
          title="Refresh progress"
          onClick={onRefresh}
        >
          <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="t-label">Overall accuracy</span>
          <span className="stat__value">{formatPercent(progress.overall_accuracy)}</span>
        </div>
        <div className="stat">
          <span className="t-label">Quizzes taken</span>
          <span className="stat__value">{progress.total_quizzes_taken}</span>
        </div>
        <div className="stat">
          <span className="t-label">Questions answered</span>
          <span className="stat__value">{progress.total_questions_answered}</span>
        </div>
        <div className="stat">
          <span className="t-label">Weak spots</span>
          <span className="stat__value">{progress.weak_spots_count}</span>
        </div>
      </div>

      {!hasHistory && recentTopics.length === 0 ? (
        <div className="section">
          <div className="panel regmark">
            <EmptyState
              icon={ChartColumn}
              title="No quiz history yet"
              action={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => onNavigate('quiz')}
                >
                  Take your first quiz
                </button>
              }
            >
              Finish one quiz and Gist starts tracking which topics need another pass.
            </EmptyState>
          </div>
        </div>
      ) : null}

      {recentTopics.length > 0 ? (
        <section className="section">
          <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-label">Topics</span>
            <span className="t-small t-muted" style={{ fontSize: '11px' }}>
              Click a completed topic to review its last result
            </span>
          </div>
          <div className="tile-grid">
            {recentTopics.map((stat, index) => (
              <TopicTile
                key={stat.topic}
                title={stat.topic}
                meta={tileMeta(stat)}
                accuracy={stat.accuracy}
                status={tileStatus(stat.status)}
                index={index}
                onClick={() => handleTopicClick(stat.topic, stat.total_questions)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {attempted.length > 0 ? (
        <section className="section">
          <div className="eyebrow">
            <span className="t-label">Weak spots · weakest first</span>
          </div>
          <div className="mrows">
            {weakestTopics.map((stat) => (
              <MasteryBar key={stat.topic} stat={stat} />
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onStartWeakQuiz}
            >
              Quiz me on weak spots
            </button>
            {priorityMatrix && priorityMatrix.critical_priority_count > 0 && onStartHighYieldQuiz ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onStartHighYieldQuiz}
              >
                <Sparkles size={14} style={{ marginRight: '6px' }} />
                Practice High-Yield Exam Weak Spots
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {priorityMatrix && priorityMatrix.prioritized_topics.length > 0 ? (
        <section className="section">
          <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-label">Exam Importance vs Mastery (Past-Paper Priority)</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onNavigate('papers')}
              style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <GraduationCap size={13} />
              <span>Open Analyzer →</span>
            </button>
          </div>
          <div className="panel" style={{ padding: 'var(--space-4)' }}>
            <p style={{ margin: '0 0 var(--space-3)', fontSize: '13px', color: 'var(--text-muted)' }}>
              {priorityMatrix.summary_insight}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {priorityMatrix.prioritized_topics.slice(0, 3).map((item) => (
                <div
                  key={item.topic}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.topic}</span>
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      ~{formatPercent(item.exam_marks_pct)} of exam · {item.quiz_attempts > 0 ? `${formatPercent(item.quiz_accuracy)} quiz accuracy` : 'Unattempted'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => onStartTopicQuiz(item.topic)}
                  >
                    Quiz
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="eyebrow">
          <span className="t-label">
            Quiz history {progress.recent_quizzes.length > 0 ? `(${progress.recent_quizzes.length})` : ''}
          </span>
        </div>
        {attemptError ? (
          <div className="panel" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-3)', borderColor: 'var(--danger)' }}>
            <p className="t-small" style={{ color: 'var(--danger)', margin: 0 }}>
              {attemptError}
            </p>
          </div>
        ) : null}
        {progress.recent_quizzes.length > 0 ? (
          <div className="history-list">
            {progress.recent_quizzes.map((quiz) => {
              const statusClass =
                quiz.score_percentage >= 80
                  ? 'history-item__badge--success'
                  : quiz.score_percentage >= 50
                    ? 'history-item__badge--warning'
                    : 'history-item__badge--danger'
              const isLoading = loadingAttemptId === quiz.quiz_id
              return (
                <div
                  className="history-item history-item--clickable"
                  key={quiz.quiz_id}
                  onClick={() => handleOpenAttempt(quiz.quiz_id)}
                  title="Click to review full quiz results"
                >
                  <div className="history-item__main">
                    <div className="history-item__header">
                      <span className="history-item__topic">{quiz.topic}</span>
                      <span className={`history-item__badge ${statusClass}`}>
                        {formatPercent(quiz.score_percentage)}
                      </span>
                    </div>
                    <div className="history-item__meta">
                      <span className="history-item__score-detail">
                        {quiz.correct_count} of {quiz.total_questions} correct
                      </span>
                      <span className="history-item__dot">·</span>
                      <span className="history-item__time">
                        {relativeTime(quiz.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="history-item__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handleOpenAttempt(quiz.quiz_id)}
                      disabled={isLoading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Eye size={13} />
                      <span>{isLoading ? 'Loading…' : 'Review'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onStartTopicQuiz(quiz.topic)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RotateCcw size={13} />
                      <span>Retake</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="panel panel--quiet">
            <p className="t-small t-muted">
              No quiz attempts recorded yet. Finish a quiz to start tracking your performance over time.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

