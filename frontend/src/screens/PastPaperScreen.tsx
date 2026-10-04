import { useState, useEffect, useCallback, useId, type ChangeEvent } from 'react'
import {
  GraduationCap,
  Upload,
  Sparkles,
  AlertTriangle,
  Search,
  Trash2,
  BarChart3,
  HelpCircle,
  RefreshCw,
  BookOpen,
  Layers,
} from 'lucide-react'
import { formatPercent, pluralize, relativeTime } from '../lib/format'
import {
  deletePastPaper,
  uploadPastPapers,
  getPastPaperQuestions,
  reanalyzePastPapers,
  getPastPaperSubjects,
  getPastPaperAnalysis,
  getPriorityMatrix,
  getPastPapers,
} from '../lib/api'
import type {
  PastPaperAnalysis,
  PriorityMatrixResponse,
  PastPaper,
  PastPaperQuestion,
  PastPaperSubject,
} from '../lib/types'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'

export function PastPaperScreen({
  analysis,
  priorityMatrix,
  papers,
  loading,
  error,
  offline,
  offlineMessage,
  onRetry,
  onRefresh,
  onStartHighYieldQuiz,
  onStartTopicQuiz,
  onAskQuestion,
}: {
  analysis: PastPaperAnalysis | null
  priorityMatrix: PriorityMatrixResponse | null
  papers: PastPaper[]
  loading: boolean
  error: string | null
  offline: boolean
  offlineMessage: string | null
  onRetry: () => void
  onRefresh: () => void
  onStartHighYieldQuiz: () => void
  onStartTopicQuiz: (topic: string) => void
  onAskQuestion: (text: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'matrix' | 'topics' | 'questions' | 'papers'>('matrix')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [subjectInput, setSubjectInput] = useState('')
  const [yearInput, setYearInput] = useState('')

  // Subject segregation state
  const [selectedSubject, setSelectedSubject] = useState<string>('All')
  const [subjects, setSubjects] = useState<PastPaperSubject[]>([])
  const [currentAnalysis, setCurrentAnalysis] = useState<PastPaperAnalysis | null>(analysis)
  const [currentMatrix, setCurrentMatrix] = useState<PriorityMatrixResponse | null>(priorityMatrix)
  const [currentPapers, setCurrentPapers] = useState<PastPaper[]>(papers)
  const [, setFilteringSubject] = useState(false)

  // Questions explorer filters
  const [questionTopicFilter, setQuestionTopicFilter] = useState('All')
  const [questionSearch, setQuestionSearch] = useState('')
  const [explorerQuestions, setExplorerQuestions] = useState<PastPaperQuestion[]>([])
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)

  const fileInputId = useId()

  const fetchSubjects = useCallback(async () => {
    try {
      const res = await getPastPaperSubjects()
      setSubjects(res.subjects)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void fetchSubjects()
  }, [fetchSubjects])

  // Sync props when in 'All' view and props change
  useEffect(() => {
    if (selectedSubject === 'All') {
      setCurrentAnalysis(analysis)
      setCurrentMatrix(priorityMatrix)
      setCurrentPapers(papers)
    }
  }, [analysis, priorityMatrix, papers, selectedSubject])

  const loadSubjectData = useCallback(async (subj: string) => {
    setFilteringSubject(true)
    const subjectParam = subj === 'All' ? undefined : subj
    try {
      const [ana, mat, paps] = await Promise.all([
        getPastPaperAnalysis(subjectParam),
        getPriorityMatrix(subjectParam),
        getPastPapers(subjectParam),
      ])
      setCurrentAnalysis(ana)
      setCurrentMatrix(mat)
      setCurrentPapers(paps.papers)
    } catch {
      // silent
    } finally {
      setFilteringSubject(false)
    }
  }, [])

  const loadQuestions = useCallback(async (topic?: string, search?: string, subject?: string) => {
    setExplorerLoading(true)
    const activeSubj = subject !== undefined ? subject : selectedSubject
    try {
      const res = await getPastPaperQuestions({
        topic: (topic && topic !== 'All') ? topic : undefined,
        search: search !== undefined ? search : questionSearch,
        subject: activeSubj !== 'All' ? activeSubj : undefined,
        limit: 100,
      })
      setExplorerQuestions(res.questions)
    } catch {
      // silent
    } finally {
      setExplorerLoading(false)
    }
  }, [questionSearch, selectedSubject])

  const handleSubjectChange = (subj: string) => {
    setSelectedSubject(subj)
    setQuestionTopicFilter('All')
    void loadSubjectData(subj)
    void loadQuestions(undefined, undefined, subj)
  }

  const handleReanalyzeAll = async () => {
    setReanalyzing(true)
    try {
      await reanalyzePastPapers()
      onRefresh()
      void fetchSubjects()
      void loadSubjectData(selectedSubject)
      void loadQuestions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not re-analyze papers.')
    } finally {
      setReanalyzing(false)
    }
  }

  const handleTabChange = (tab: 'matrix' | 'topics' | 'questions' | 'papers') => {
    setActiveTab(tab)
    if (tab === 'questions' && explorerQuestions.length === 0) {
      void loadQuestions()
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const res = await uploadPastPapers(fileArray, subjectInput || undefined, yearInput || undefined)
      const successCount = res.results.filter((r) => r.status === 'success').length
      if (successCount > 0) {
        setUploadSuccess(
          `Successfully extracted and analyzed ${successCount} ${pluralize(successCount, 'past paper')}!`
        )
        setSubjectInput('')
        setYearInput('')
        onRefresh()
        void fetchSubjects()
        void loadSubjectData(selectedSubject)
        void loadQuestions()
      } else {
        setUploadError(res.results[0]?.message || 'Failed to extract questions from uploaded file.')
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeletePaper = async (paperId: number, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return
    try {
      await deletePastPaper(paperId)
      onRefresh()
      void fetchSubjects()
      void loadSubjectData(selectedSubject)
      void loadQuestions()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete paper.')
    }
  }

  if (offline) {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <h1 className="t-h1">Past-Paper Analyzer</h1>
          </div>
        </header>
        <BackendNotice message={offlineMessage} onRetry={onRetry} />
      </div>
    )
  }

  if (loading && !analysis && papers.length === 0) {
    return (
      <div className="screen">
        <div className="panel">
          <span className="t-label">Analyzing past papers…</span>
          <div className="section" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-3)' }}>
            <span className="skel skel--line skel--wide" />
            <span className="skel skel--line skel--mid" />
          </div>
        </div>
      </div>
    )
  }

  if (!analysis && error && papers.length === 0) {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <h1 className="t-h1">Past-Paper Analyzer</h1>
          </div>
        </header>
        <BackendNotice message={error} onRetry={onRetry} />
      </div>
    )
  }

  const effectiveAnalysis = currentAnalysis ?? analysis
  const effectiveMatrix = currentMatrix ?? priorityMatrix
  const effectivePapers = currentPapers.length > 0 ? currentPapers : papers

  const hasPapers = (effectiveAnalysis?.total_papers ?? 0) > 0 || effectivePapers.length > 0
  const priorityList = effectiveMatrix?.prioritized_topics || []
  const criticalCount = effectiveMatrix?.critical_priority_count || 0
  const totalQuestions = effectiveAnalysis?.total_questions || 0
  const totalExamMarks = effectiveAnalysis?.total_marks || 0

  return (
    <div className="screen screen--wide">
      <header className="page-head">
        <div className="page-head__meta">
          <h1 className="t-h1">Past-Paper Analyzer</h1>
          <p className="t-small t-muted">
            Extract questions, map topic exam weightage & frequency, and prioritize high-yield weak spots.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => handleTabChange('papers')}
          >
            <Upload size={14} strokeWidth={1.5} />
            <span>Upload Papers</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Refresh analysis"
            title="Refresh analysis"
            onClick={() => {
              onRefresh()
              void fetchSubjects()
              void loadSubjectData(selectedSubject)
              void loadQuestions()
            }}
          >
            <RefreshCw size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* Subject Segregation Filter Bar */}
      {subjects.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              paddingRight: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={14} />
            <span>Subject:</span>
          </div>

          <button
            type="button"
            className={`btn btn--sm ${selectedSubject === 'All' ? 'btn--primary' : 'btn--secondary'}`}
            style={{ borderRadius: 'var(--radius-pill)', fontSize: '12px', padding: '4px 12px', whiteSpace: 'nowrap' }}
            onClick={() => handleSubjectChange('All')}
          >
            <span>All Subjects</span>
            <span
              style={{
                marginLeft: '6px',
                fontSize: '11px',
                opacity: 0.85,
                background: selectedSubject === 'All' ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              {subjects.reduce((sum, s) => sum + s.question_count, 0)} Qs
            </span>
          </button>

          {subjects.map((s) => {
            const isSelected = selectedSubject === s.subject
            return (
              <button
                key={s.subject}
                type="button"
                className={`btn btn--sm ${isSelected ? 'btn--primary' : 'btn--secondary'}`}
                style={{ borderRadius: 'var(--radius-pill)', fontSize: '12px', padding: '4px 12px', whiteSpace: 'nowrap' }}
                onClick={() => handleSubjectChange(s.subject)}
              >
                <span>{s.subject}</span>
                <span
                  style={{
                    marginLeft: '6px',
                    fontSize: '11px',
                    opacity: 0.85,
                    background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--surface-2)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-pill)',
                  }}
                >
                  {s.paper_count} {pluralize(s.paper_count, 'paper')} · {s.question_count} Qs
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Top Level Summary Stats */}
      <div className="stats">
        <div className="stat">
          <span className="t-label">Past Papers</span>
          <span className="stat__value">{effectiveAnalysis?.total_papers ?? effectivePapers.length}</span>
        </div>
        <div className="stat">
          <span className="t-label">Questions Extracted</span>
          <span className="stat__value">{totalQuestions}</span>
        </div>
        <div className="stat">
          <span className="t-label">Total Exam Marks</span>
          <span className="stat__value">{Math.round(totalExamMarks)}</span>
        </div>
        <div className="stat">
          <span className="t-label">Critical Weak Spots</span>
          <span className="stat__value" style={{ color: criticalCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {criticalCount}
          </span>
        </div>
      </div>

      {/* High-Yield Weak Spots Urgent Banner */}
      {hasPapers && effectiveMatrix && criticalCount > 0 ? (
        <div
          className="panel"
          style={{
            background: 'var(--danger-bg)',
            borderColor: 'var(--danger)',
            padding: 'var(--space-4)',
            marginTop: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--danger)', fontSize: '15px' }}>
                High-Yield Weak Spot Alert {selectedSubject !== 'All' ? `(${selectedSubject})` : ''} ({criticalCount} {pluralize(criticalCount, 'topic')})
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text)' }}>
                {effectiveMatrix.summary_insight}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '2px' }}>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onStartHighYieldQuiz}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={14} />
              <span>Practice High-Yield Weak Spots</span>
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => handleTabChange('matrix')}
            >
              <span>View Priority Breakdown</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--border-soft)',
          paddingBottom: 'var(--space-2)',
          marginTop: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          className={`btn btn--sm ${activeTab === 'matrix' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => handleTabChange('matrix')}
        >
          <Sparkles size={14} />
          <span>Priority Matrix</span>
        </button>
        <button
          type="button"
          className={`btn btn--sm ${activeTab === 'topics' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => handleTabChange('topics')}
        >
          <BarChart3 size={14} />
          <span>Topic Frequency & Marks</span>
        </button>
        <button
          type="button"
          className={`btn btn--sm ${activeTab === 'questions' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => handleTabChange('questions')}
        >
          <HelpCircle size={14} />
          <span>Past Questions Bank ({totalQuestions})</span>
        </button>
        <button
          type="button"
          className={`btn btn--sm ${activeTab === 'papers' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => handleTabChange('papers')}
        >
          <BookOpen size={14} />
          <span>Uploaded Papers ({effectivePapers.length})</span>
        </button>
      </div>

      {!hasPapers && activeTab !== 'papers' ? (
        <div className="section">
          <div className="panel regmark">
            <EmptyState
              icon={GraduationCap}
              title="No Past Papers Analyzed Yet"
              action={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => handleTabChange('papers')}
                >
                  <Upload size={14} style={{ marginRight: '6px' }} />
                  Upload Previous Years' Question Papers
                </button>
              }
            >
              Upload PDF question papers from previous exam years. Gist will automatically extract every
              question, identify marks, tag topics, and calculate which high-yield concepts you need to
              master first.
            </EmptyState>
          </div>
        </div>
      ) : null}

      {/* TAB 1: Priority Matrix */}
      {hasPapers && activeTab === 'matrix' ? (
        <section className="section">
          <div className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="t-label">Exam Importance vs Student Mastery · Highest Priority First</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {priorityList.map((item) => {
              const isCritical = item.priority_level === 'critical'
              const isHigh = item.priority_level === 'high'
              const isMastered = item.priority_level === 'maintained'
              const isExpanded = expandedTopic === item.topic

              const badgeColor = isCritical
                ? 'var(--danger-bg)'
                : isHigh
                  ? 'var(--warning-bg)'
                  : isMastered
                    ? 'var(--success-bg)'
                    : 'var(--surface-2)'
              const badgeText = isCritical
                ? 'var(--danger)'
                : isHigh
                  ? 'var(--warning)'
                  : isMastered
                    ? 'var(--success)'
                    : 'var(--text-muted)'
              const badgeLabel = isCritical
                ? 'Critical Exam Priority'
                : isHigh
                  ? 'High Yield Focus'
                  : isMastered
                    ? 'Mastered & Frequent'
                    : 'Lower Yield'

              return (
                <div
                  key={item.topic}
                  className="panel"
                  style={{
                    borderColor: isCritical ? 'var(--danger)' : isHigh ? 'var(--warning)' : 'var(--border-soft)',
                    borderWidth: isCritical ? '1.5px' : '1px',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'box-shadow var(--dur-hover)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
                          {item.topic}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-pill)',
                            background: badgeColor,
                            color: badgeText,
                          }}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {item.recommendation}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => onStartTopicQuiz(item.topic)}
                        title="Practice quiz on this specific topic"
                      >
                        Practice Topic
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setExpandedTopic(isExpanded ? null : item.topic)}
                      >
                        {isExpanded ? 'Hide Questions' : `Past Questions (${item.sample_questions.length})`}
                      </button>
                    </div>
                  </div>

                  {/* Dual Metric Bars: Exam Weight vs Quiz Accuracy */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 'var(--space-4)',
                      marginTop: 'var(--space-4)',
                      paddingTop: 'var(--space-3)',
                      borderTop: '1px solid var(--border-soft)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span className="t-label">Exam Marks Weightage</span>
                        <span style={{ fontWeight: 600 }}>{formatPercent(item.exam_marks_pct)} ({item.exam_marks} marks)</span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(item.exam_marks_pct * 3, 100)}%`,
                            height: '100%',
                            background: isCritical ? 'var(--tile-rose)' : 'var(--accent)',
                            borderRadius: 'var(--radius-pill)',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                        Appeared in {formatPercent(item.exam_frequency_pct)} of previous papers
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                        <span className="t-label">Your Quiz Mastery</span>
                        <span style={{ fontWeight: 600 }}>
                          {item.mastery_status === 'Unattempted' ? 'Unattempted (0%)' : formatPercent(item.quiz_accuracy)}
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--surface-2)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${item.quiz_accuracy}%`,
                            height: '100%',
                            background: item.quiz_accuracy >= 80 ? 'var(--success)' : item.quiz_accuracy >= 50 ? 'var(--warning)' : 'var(--danger)',
                            borderRadius: 'var(--radius-pill)',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                        {item.quiz_attempts > 0 ? `${item.quiz_attempts} questions attempted` : 'No quiz taken on this topic yet'}
                      </div>
                    </div>
                  </div>

                  {/* Sample Past Paper Questions Accordion */}
                  {isExpanded && item.sample_questions.length > 0 ? (
                    <div
                      style={{
                        marginTop: 'var(--space-4)',
                        paddingTop: 'var(--space-3)',
                        borderTop: '1px dashed var(--border-soft)',
                      }}
                    >
                      <span className="t-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                        Extracted Past Exam Questions:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {item.sample_questions.map((q, qIdx) => (
                          <div
                            key={qIdx}
                            style={{
                              background: 'var(--surface-2)',
                              padding: '10px 14px',
                              borderRadius: 'var(--radius-xs)',
                              fontSize: '13px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                              <span>
                                <strong>{q.question_number}</strong> · {q.paper_title} ({q.year})
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                {q.marks} {pluralize(q.marks, 'mark')}
                              </span>
                            </div>
                            <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{q.question_text}</div>
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                                onClick={() => onAskQuestion(`Explain how to solve this past paper question on ${item.topic}:\n\n"${q.question_text}"`)}
                              >
                                Ask Gist to explain / solve →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* TAB 2: Topic Frequency & Marks Distribution */}
      {hasPapers && activeTab === 'topics' ? (
        <section className="section">
          <div className="eyebrow">
            <span className="t-label">Topic Marks & Occurrence Distribution</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(effectiveAnalysis?.topic_analysis || []).map((t, idx) => (
              <div key={t.topic} className="panel" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                      {t.topic}
                    </span>
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        background: t.yield_rating === 'High Yield' ? 'var(--tile-ochre)' : 'var(--surface-2)',
                        color: t.yield_rating === 'High Yield' ? '#1e1b18' : 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {t.yield_rating}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent)' }}>
                      {t.total_marks} Marks
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)', marginLeft: '6px' }}>
                      ({formatPercent(t.marks_percentage)})
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: '10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', marginBottom: 'var(--space-2)' }}>
                  <div
                    style={{
                      width: `${Math.min(t.marks_percentage * 3, 100)}%`,
                      height: '100%',
                      background: idx % 3 === 0 ? 'var(--tile-clay)' : idx % 3 === 1 ? 'var(--tile-moss)' : 'var(--tile-teal)',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>
                    {t.question_count} {pluralize(t.question_count, 'question')} extracted
                  </span>
                  <span>
                    Appeared in {t.paper_occurrences} of {effectiveAnalysis?.total_papers || 1} {pluralize(t.paper_occurrences, 'paper')} ({formatPercent(t.paper_frequency_pct)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* TAB 3: Question Bank Explorer */}
      {hasPapers && activeTab === 'questions' ? (
        <section className="section">
          <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="t-label">Browse Past Paper Questions</span>
            <span className="t-small t-muted">{explorerQuestions.length} questions listed</span>
          </div>

          {/* Search & Topic Filters */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <div style={{ flex: '1', minWidth: '220px', position: 'relative' }}>
              <input
                type="text"
                className="input"
                placeholder="Search question keywords (e.g., 'BCNF', 'join', 'transaction')..."
                value={questionSearch}
                onChange={(e) => {
                  setQuestionSearch(e.target.value)
                  void loadQuestions(questionTopicFilter, e.target.value)
                }}
                style={{ width: '100%', paddingLeft: '32px' }}
              />
              <Search
                size={15}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}
              />
            </div>

            <select
              className="input"
              value={questionTopicFilter}
              onChange={(e) => {
                setQuestionTopicFilter(e.target.value)
                void loadQuestions(e.target.value, questionSearch)
              }}
              style={{ minWidth: '180px' }}
            >
              <option value="All">All Topics</option>
              {(effectiveAnalysis?.topic_analysis || []).map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic}
                </option>
              ))}
            </select>
          </div>

          {explorerLoading ? (
            <div className="panel">
              <span className="t-label">Loading questions…</span>
              <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="skel skel--line skel--wide" />
                <span className="skel skel--line skel--mid" />
              </div>
            </div>
          ) : explorerQuestions.length === 0 ? (
            <div className="panel panel--quiet">
              <p className="t-small t-muted">No questions matched your search filters.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {explorerQuestions.map((q) => (
                <div
                  key={q.id}
                  className="panel"
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '14px' }}>
                        {q.question_number}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {q.topic}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          background: 'var(--bubble-user-bg)',
                          color: 'var(--bubble-user-text)',
                        }}
                      >
                        {q.question_type}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                        {q.marks} {pluralize(q.marks, 'mark')}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: '0 0 var(--space-3)', fontSize: '14px', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {q.question_text}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-soft)', fontSize: '12px', color: 'var(--text-faint)' }}>
                    <span>
                      {q.paper_title || 'Past Paper'} {q.paper_year ? `(${q.paper_year})` : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onAskQuestion(`Explain step-by-step how to solve this past paper question (${q.marks} marks) on ${q.topic}:\n\n"${q.question_text}"`)}
                    >
                      Ask Gist to solve →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* TAB 4: Upload & Paper Management */}
      {activeTab === 'papers' ? (
        <section className="section">
          <div className="eyebrow">
            <span className="t-label">Upload & Manage Previous Years' Question Papers</span>
          </div>

          <div
            className="panel"
            style={{
              border: '2px dashed var(--border-soft)',
              padding: 'var(--space-6)',
              textAlign: 'center',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <GraduationCap size={36} color="var(--accent)" style={{ margin: '0 auto var(--space-3)' }} />
            <h2 className="t-h2" style={{ margin: '0 0 var(--space-1)' }}>
              Upload Past Exam Papers (PDF)
            </h2>
            <p className="t-small t-muted" style={{ maxWidth: '460px', margin: '0 auto var(--space-4)' }}>
              Upload your college or university past question papers. Gist's local engine extracts questions,
              infers marks, and detects high-yield exam trends.
            </p>

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', maxWidth: '440px', margin: '0 auto var(--space-4)', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input"
                placeholder="Subject (e.g. DBMS, Python, OS)"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                style={{ flex: 1, minWidth: '160px' }}
              />
              <input
                type="text"
                className="input"
                placeholder="Year (e.g. 2024, 2023)"
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
                style={{ width: '110px' }}
              />
            </div>

            {subjects.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  margin: '-8px auto var(--space-4)',
                  maxWidth: '440px',
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>Existing subjects:</span>
                {subjects.map((s) => (
                  <button
                    key={s.subject}
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{
                      fontSize: '11px',
                      padding: '1px 8px',
                      height: '22px',
                      borderRadius: 'var(--radius-pill)',
                      background: subjectInput === s.subject ? 'var(--bubble-user-bg)' : 'var(--surface-2)',
                      color: subjectInput === s.subject ? 'var(--bubble-user-text)' : 'var(--text)',
                    }}
                    onClick={() => setSubjectInput(s.subject)}
                  >
                    {s.subject}
                  </button>
                ))}
              </div>
            ) : null}

            <input
              id={fileInputId}
              type="file"
              accept=".pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void handleFileUpload(e.target.files)
                e.target.value = ''
              }}
            />

            <label htmlFor={fileInputId} className={`btn btn--primary ${uploading ? 'btn--loading' : ''}`} style={{ cursor: uploading ? 'default' : 'pointer' }}>
              <Upload size={15} style={{ marginRight: '6px' }} />
              {uploading ? 'Extracting & Analyzing Questions…' : 'Select PDF Question Papers'}
            </label>

            {uploadError ? (
              <div style={{ color: 'var(--danger)', fontSize: '13px', marginTop: 'var(--space-3)' }}>
                {uploadError}
              </div>
            ) : null}

            {uploadSuccess ? (
              <div style={{ color: 'var(--success)', fontSize: '13px', marginTop: 'var(--space-3)' }}>
                {uploadSuccess}
              </div>
            ) : null}
          </div>

          {effectivePapers.length > 0 ? (
            <div>
              <div className="eyebrow" style={{ marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="t-label">
                  Analyzed Question Papers ({effectivePapers.length})
                  {selectedSubject !== 'All' ? ` · Filtered by ${selectedSubject}` : ''}
                </span>
                <button
                  type="button"
                  className={`btn btn--ghost btn--sm ${reanalyzing ? 'btn--loading' : ''}`}
                  onClick={handleReanalyzeAll}
                  disabled={reanalyzing}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  title="Re-run deep question extraction and topic tagging across all uploaded papers"
                >
                  <RefreshCw size={12} style={{ marginRight: '4px' }} className={reanalyzing ? 'spin' : ''} />
                  {reanalyzing ? 'Re-analyzing…' : 'Re-classify All Topics'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {effectivePapers.map((p) => (
                  <div
                    key={p.id}
                    className="panel"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 'var(--space-4)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>
                          {p.title}
                        </span>
                        {p.year ? (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              background: 'var(--surface-2)',
                              borderRadius: 'var(--radius-pill)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {p.year}
                          </span>
                        ) : null}
                        {p.subject ? (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              background: 'var(--bubble-user-bg)',
                              borderRadius: 'var(--radius-pill)',
                              color: 'var(--bubble-user-text)',
                            }}
                          >
                            {p.subject}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {p.total_questions} {pluralize(p.total_questions, 'question')} extracted · {p.total_marks} marks total · Uploaded {relativeTime(p.uploaded_at)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() => handleDeletePaper(p.id, p.title)}
                        title="Delete paper"
                        aria-label="Delete paper"
                      >
                        <Trash2 size={15} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
