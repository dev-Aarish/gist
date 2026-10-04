import { ChartColumn, RefreshCw, Sparkles, GraduationCap } from 'lucide-react'
import { formatPercent, pluralize, relativeTime } from '../lib/format'
import type { ProgressSummary, TopicStat, PriorityMatrixResponse } from '../lib/types'
import type { ScreenId } from '../lib/nav'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'
import { MasteryBar } from '../components/MasteryBar'
import { TopicTile, type TileStatus } from '../components/TopicTile'

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

  const topics = weakestFirst(progress.topics)
  const attempted = topics.filter((stat) => stat.status !== 'Unattempted')
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

      {!hasHistory && topics.length === 0 ? (
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

      {topics.length > 0 ? (
        <section className="section">
          <div className="eyebrow">
            <span className="t-label">Topics</span>
          </div>
          <div className="tile-grid">
            {topics.map((stat, index) => (
              <TopicTile
                key={stat.topic}
                title={stat.topic}
                meta={tileMeta(stat)}
                accuracy={stat.accuracy}
                status={tileStatus(stat.status)}
                index={index}
                onClick={() => onStartTopicQuiz(stat.topic)}
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
            {topics.map((stat) => (
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
        {progress.recent_quizzes.length > 0 ? (
          <div className="history-list">
            {progress.recent_quizzes.map((quiz) => {
              const statusClass =
                quiz.score_percentage >= 80
                  ? 'history-item__badge--success'
                  : quiz.score_percentage >= 50
                    ? 'history-item__badge--warning'
                    : 'history-item__badge--danger'
              return (
                <div className="history-item" key={quiz.quiz_id}>
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
                  <div className="history-item__actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onStartTopicQuiz(quiz.topic)}
                    >
                      Retake
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
