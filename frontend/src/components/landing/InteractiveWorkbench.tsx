import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  MessageSquare,
  CircleHelp,
  ChartColumn,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  Lock,
  BookmarkCheck,
} from 'lucide-react'

type WorkbenchTab = 'ask' | 'quiz' | 'progress'

export function InteractiveWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('ask')

  // Mouse spotlight coordinates
  const [mousePos, setMousePos] = useState({ x: 250, y: 150 })
  const [isHovered, setIsHovered] = useState(false)

  // Ask Demo State
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedText, setStreamedText] = useState('')
  const [activeCitation, setActiveCitation] = useState<number | null>(null)

  // Quiz Demo State
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  const sampleQuestions = [
    {
      q: 'Explain how virtual memory paging prevents external fragmentation.',
      answer:
        'Paging divides physical memory into fixed-size frames and logical memory into pages of the same size. Because any logical page can be allocated into any available physical frame, processes do not require contiguous physical memory blocks—eliminating external fragmentation entirely.',
      citation: 'Operating System Concepts 10th Ed · Section 9.2, p.354',
      quote:
        '"Physical memory is broken into fixed-sized blocks called frames. Logical memory is also broken into blocks of the same size called pages... With paging, external fragmentation is eliminated entirely."',
    },
    {
      q: 'How does TCP congestion control distinguish between packet loss and network delay?',
      answer:
        'TCP detects packet loss via two mechanisms: a retransmission timeout (RTO expiration) or receiving 3 duplicate ACKs (fast retransmit). While network delay increases RTT measurements, duplicate ACKs specifically indicate that subsequent segments arrived but one was dropped in transit.',
      citation: 'Computer Networking: A Top-Down Approach · Chapter 3.7, p.265',
      quote:
        '"Receipt of three duplicate ACKs is taken as an indication that the packet was lost rather than simply delayed. TCP then performs a fast retransmit before the timer expires."',
    },
  ]

  const quizQuestion = {
    title: 'Operating Systems & Architecture',
    question: 'In a multi-level page table architecture, what is the primary purpose of the Translation Lookaside Buffer (TLB)?',
    options: [
      { id: 0, text: 'To store the operating system kernel code in fast SRAM cache' },
      { id: 1, text: 'To cache recent virtual-to-physical address translations and avoid multi-step RAM lookups', correct: true },
      { id: 2, text: 'To compress inactive memory pages before swapping them to SSD disk storage' },
      { id: 3, text: 'To synchronize memory writes between multiple CPU cores in real-time' },
    ],
    explanation:
      'Without a TLB, each memory access in a 4-level page table requires 4 separate memory accesses just to translate the address. The TLB is an associative high-speed hardware cache that resolves translations in ~1 CPU clock cycle.',
    citation: 'Silberschatz & Galvin · OS Concepts p.360',
  }

  // Handle streaming simulation for Ask Demo
  useEffect(() => {
    if (activeTab !== 'ask') return

    const fullText = sampleQuestions[selectedQuestionIdx].answer
    setIsStreaming(true)
    setStreamedText('')
    setActiveCitation(null)

    let currentLength = 0
    const interval = setInterval(() => {
      currentLength += 3
      if (currentLength >= fullText.length) {
        setStreamedText(fullText)
        setIsStreaming(false)
        clearInterval(interval)
      } else {
        setStreamedText(fullText.slice(0, currentLength))
      }
    }, 16)

    return () => clearInterval(interval)
  }, [selectedQuestionIdx, activeTab])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleSelectQuiz = (idx: number) => {
    if (quizSubmitted) return
    setQuizChoice(idx)
    setQuizSubmitted(true)
    if (quizQuestion.options[idx]?.correct) {
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 2400)
    }
  }

  const resetQuiz = () => {
    setQuizChoice(null)
    setQuizSubmitted(false)
    setShowCelebration(false)
  }

  return (
    <div
      className="landing-workbench-wrapper"
      id="demo"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        ['--mouse-x' as string]: `${mousePos.x}px`,
        ['--mouse-y' as string]: `${mousePos.y}px`,
      }}
    >
      {/* Dynamic Cursor Light Spotlight */}
      <div
        className="workbench-spotlight"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(var(--accent-rgb, 15, 92, 82), 0.08), transparent 80%)`,
        }}
        aria-hidden="true"
      />

      {/* Celebration particles on correct quiz */}
      {showCelebration && (
        <div className="quiz-celebration-overlay" aria-hidden="true">
          <div className="celebration-badge">
            <Sparkles size={18} className="sparkle-spin" />
            <span>Mastery +25! Verified Concept</span>
          </div>
        </div>
      )}

      {/* Workbench Header Chrome */}
      <div className="workbench-top-bar">
        <div className="workbench-title-group">
          <div className="workbench-badge">
            <span className="live-pulse-dot" />
            <span>Live Interactive Workbench</span>
          </div>
          <span className="workbench-file-tag">OS_Final_Review.pdf (142 pages)</span>
        </div>

        {/* Tab Switcher */}
        <div className="workbench-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ask'}
            className={`workbench-tab ${activeTab === 'ask' ? 'active' : ''}`}
            onClick={() => setActiveTab('ask')}
          >
            <MessageSquare size={14} />
            <span>1. Instant Q&A</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quiz'}
            className={`workbench-tab ${activeTab === 'quiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('quiz')}
          >
            <CircleHelp size={14} />
            <span>2. Diagnostic Quiz</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'progress'}
            className={`workbench-tab ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            <ChartColumn size={14} />
            <span>3. Weak-Spot Tracker</span>
          </button>
        </div>
      </div>

      {/* Workbench Body */}
      <div className="workbench-body">
        <AnimatePresence mode="wait">
          {/* TAB 1: ASK DEMO */}
          {activeTab === 'ask' && (
            <motion.div
              key="ask"
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(-8px)' }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="workbench-screen"
            >
              <div className="ask-demo-prompts">
                <span className="prompt-picker-label">Sample Study Queries:</span>
                {sampleQuestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`prompt-chip ${selectedQuestionIdx === idx ? 'selected' : ''}`}
                    onClick={() => setSelectedQuestionIdx(idx)}
                  >
                    <Search size={12} />
                    <span>{item.q.slice(0, 48)}...</span>
                  </button>
                ))}
              </div>

              {/* Chat Thread */}
              <div className="ask-chat-flow">
                {/* User Message */}
                <div className="chat-msg chat-user">
                  <div className="chat-bubble user-bubble">
                    <p>{sampleQuestions[selectedQuestionIdx].q}</p>
                  </div>
                </div>

                {/* Assistant Message */}
                <div className="chat-msg chat-assistant">
                  <div className="chat-bubble assistant-bubble">
                    <div className="assistant-meta">
                      <div className="model-chip">
                        <span className="model-dot" />
                        <span>qwen2.5:7b (Local Ollama · 42 tok/s)</span>
                      </div>
                      <div className="private-chip">
                        <Lock size={11} />
                        <span>Air-Gapped</span>
                      </div>
                    </div>

                    <p className="assistant-text">
                      {streamedText}
                      {isStreaming && <span className="streaming-cursor" />}
                    </p>

                    {/* Source Citation Pill */}
                    {!isStreaming && (
                      <div className="citation-container">
                        <button
                          type="button"
                          className={`citation-pill ${activeCitation === selectedQuestionIdx ? 'expanded' : ''}`}
                          onClick={() =>
                            setActiveCitation(activeCitation === selectedQuestionIdx ? null : selectedQuestionIdx)
                          }
                          title="Click to inspect exact verified PDF text snippet"
                        >
                          <BookmarkCheck size={13} className="text-accent" />
                          <span>{sampleQuestions[selectedQuestionIdx].citation}</span>
                          <span className="citation-inspect-hint">
                            {activeCitation === selectedQuestionIdx ? 'Close preview' : 'View excerpt'}
                          </span>
                        </button>

                        <AnimatePresence>
                          {activeCitation === selectedQuestionIdx && (
                            <motion.div
                              initial={{ opacity: 0, transform: 'translateY(-4px)' }}
                              animate={{ opacity: 1, transform: 'translateY(0px)' }}
                              exit={{ opacity: 0, transform: 'translateY(-4px)' }}
                              transition={{ duration: 0.15 }}
                              className="citation-quote-box"
                            >
                              <div className="quote-header">
                                <FileText size={12} />
                                <span>VERIFIED GROUNDED TEXT FROM LOCAL INDEX:</span>
                              </div>
                              <p className="quote-body">{sampleQuestions[selectedQuestionIdx].quote}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: QUIZ DEMO */}
          {activeTab === 'quiz' && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(-8px)' }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="workbench-screen"
            >
              <div className="quiz-demo-card">
                <div className="quiz-card-header">
                  <span className="quiz-topic-tag">{quizQuestion.title}</span>
                  <span className="quiz-diag-badge">DIAGNOSTIC QUESTION 1 OF 5</span>
                </div>

                <h3 className="quiz-question-text">{quizQuestion.question}</h3>

                <div className="quiz-options-list">
                  {quizQuestion.options.map((option, idx) => {
                    const isSelected = quizChoice === idx
                    let stateClass = ''
                    if (quizSubmitted) {
                      if (option.correct) stateClass = 'opt-correct'
                      else if (isSelected && !option.correct) stateClass = 'opt-wrong'
                      else stateClass = 'opt-dimmed'
                    }

                    return (
                      <motion.button
                        key={option.id}
                        type="button"
                        whileHover={!quizSubmitted ? { transform: 'translateX(4px)' } : {}}
                        whileTap={!quizSubmitted ? { transform: 'scale(0.99)' } : {}}
                        className={`quiz-option-btn ${isSelected ? 'selected' : ''} ${stateClass}`}
                        onClick={() => handleSelectQuiz(idx)}
                        disabled={quizSubmitted}
                      >
                        <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                        <span className="option-text">{option.text}</span>
                        {quizSubmitted && option.correct && (
                          <CheckCircle2 size={16} className="text-success opt-icon" />
                        )}
                        {quizSubmitted && isSelected && !option.correct && (
                          <XCircle size={16} className="text-danger opt-icon" />
                        )}
                      </motion.button>
                    )
                  })}
                </div>

                {quizSubmitted && (
                  <motion.div
                    initial={{ opacity: 0, transform: 'translateY(6px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                    className="quiz-feedback-box"
                  >
                    <div className="feedback-head">
                      {quizChoice === 1 ? (
                        <div className="feedback-status success">
                          <CheckCircle2 size={15} />
                          <span>Correct! +25 Mastery</span>
                        </div>
                      ) : (
                        <div className="feedback-status wrong">
                          <XCircle size={15} />
                          <span>Incorrect · Flagged as Weak Spot</span>
                        </div>
                      )}
                      <button type="button" className="quiz-retry-btn" onClick={resetQuiz}>
                        <RefreshCw size={12} />
                        <span>Try Again</span>
                      </button>
                    </div>
                    <p className="feedback-explanation">{quizQuestion.explanation}</p>
                    <div className="feedback-citation">
                      <FileText size={12} />
                      <span>Source: {quizQuestion.citation}</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: PROGRESS & WEAK-SPOT DEMO */}
          {activeTab === 'progress' && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(-8px)' }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="workbench-screen"
            >
              <div className="progress-demo-grid">
                <div className="progress-summary-card">
                  <div className="summary-stat-row">
                    <div className="stat-box">
                      <span className="stat-label">Exam Readiness</span>
                      <span className="stat-number">68%</span>
                      <span className="stat-sub">Target: 85%+</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Identified Weak Spots</span>
                      <span className="stat-number text-warning">2 Topics</span>
                      <span className="stat-sub">Needs Review</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">Questions Drilled</span>
                      <span className="stat-number">38</span>
                      <span className="stat-sub">100% Offline</span>
                    </div>
                  </div>
                </div>

                <div className="progress-breakdown-card">
                  <div className="breakdown-header">
                    <span className="breakdown-title">Topic Mastery Diagnostic</span>
                    <span className="breakdown-subtitle">Auto-ranked from your quiz attempts</span>
                  </div>

                  <div className="topics-bars-list">
                    {/* Topic 1 - Weak */}
                    <div className="topic-bar-row">
                      <div className="topic-bar-info">
                        <span className="topic-name">Virtual Memory & TLB Caching</span>
                        <span className="topic-badge badge-weak">34% · WEAK SPOT</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill fill-weak" style={{ transform: 'scaleX(0.34)' }} />
                      </div>
                    </div>

                    {/* Topic 2 - Moderate */}
                    <div className="topic-bar-row">
                      <div className="topic-bar-info">
                        <span className="topic-name">Process Synchronization & Semaphores</span>
                        <span className="topic-badge badge-mid">58% · IN PROGRESS</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill fill-mid" style={{ transform: 'scaleX(0.58)' }} />
                      </div>
                    </div>

                    {/* Topic 3 - Mastered */}
                    <div className="topic-bar-row">
                      <div className="topic-bar-info">
                        <span className="topic-name">CPU Scheduling & Deadlock Avoidance</span>
                        <span className="topic-badge badge-strong">89% · MASTERED</span>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill fill-strong" style={{ transform: 'scaleX(0.89)' }} />
                      </div>
                    </div>
                  </div>

                  <div className="weak-spot-action-row">
                    <button
                      type="button"
                      className="quiz-weak-btn"
                      onClick={() => setActiveTab('quiz')}
                    >
                      <span>Drill Weak Spots (2 Questions)</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
