import { useState, useEffect, useMemo } from 'react'
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
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
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

  // 5 Diagnostic Quiz Questions for OS_Final_Review.pdf demo
  const allQuizQuestions = useMemo(
    () => [
      {
        id: 1,
        title: 'Virtual Memory & Architecture',
        tag: 'WEAK SPOT',
        tagType: 'weak' as const,
        question:
          'In a multi-level page table architecture, what is the primary purpose of the Translation Lookaside Buffer (TLB)?',
        options: [
          { id: 0, text: 'To store the operating system kernel code in fast SRAM cache' },
          {
            id: 1,
            text: 'To cache recent virtual-to-physical address translations and avoid multi-step RAM lookups',
            correct: true,
          },
          { id: 2, text: 'To compress inactive memory pages before swapping them to SSD disk storage' },
          { id: 3, text: 'To synchronize memory writes between multiple CPU cores in real-time' },
        ],
        explanation:
          'Without a TLB, each memory access in a 4-level page table requires 4 separate memory accesses just to translate the address. The TLB is an associative high-speed hardware cache that resolves translations in ~1 CPU clock cycle.',
        citation: 'Silberschatz & Galvin · OS Concepts p.360',
      },
      {
        id: 2,
        title: 'Process Synchronization & Semaphores',
        tag: 'WEAK SPOT',
        tagType: 'weak' as const,
        question:
          'Which protocol prevents priority inversion when a low-priority thread holds a shared lock needed by a high-priority thread?',
        options: [
          {
            id: 0,
            text: 'Priority Inheritance: the lock-holding low-priority thread temporarily runs at the higher priority',
            correct: true,
          },
          { id: 1, text: 'First-Come-First-Served spinlock queuing without OS preemption' },
          { id: 2, text: 'Immediate termination of all intermediate-priority tasks in the ready queue' },
          { id: 3, text: 'Disabling CPU interrupts globally until all threads release their semaphores' },
        ],
        explanation:
          'Priority inheritance elevates the priority of the thread holding the mutex to match the highest-priority thread waiting for it, preventing intermediate-priority tasks from preempting the lock holder.',
        citation: 'Operating System Concepts 10th Ed · Section 6.7, p.278',
      },
      {
        id: 3,
        title: 'CPU Scheduling & Deadlocks',
        tag: 'MASTERED',
        tagType: 'strong' as const,
        question:
          'Under Dijkstra\'s Banker\'s Algorithm, which condition must be met for a state to be classified as "Safe"?',
        options: [
          { id: 0, text: 'Available resources immediately exceed the sum of maximum claims of all active processes' },
          { id: 1, text: 'No process is currently requesting any additional system resources' },
          {
            id: 2,
            text: 'There exists an execution sequence <P1...Pn> where every process can acquire maximum resources and finish',
            correct: true,
          },
          { id: 3, text: 'All threads operate exclusively under non-preemptive Round-Robin quantum intervals' },
        ],
        explanation:
          'A state is safe if there exists at least one order (a safe sequence) in which all processes can eventually complete, even if all suddenly demand their maximum declared resource limits.',
        citation: 'Modern Operating Systems 4th Ed · Section 6.5, p.452',
      },
      {
        id: 4,
        title: 'Virtual Memory & Page Replacement',
        tag: 'IN PROGRESS',
        tagType: 'mid' as const,
        question:
          'Why does Belady\'s Anomaly occur in the First-In First-Out (FIFO) page replacement algorithm?',
        options: [
          { id: 0, text: 'Because FIFO pages are corrupted during asynchronous disk swap flushes' },
          {
            id: 1,
            text: 'Because FIFO does not satisfy the stack inclusion property as frame count increases',
            correct: true,
          },
          { id: 2, text: 'Because FIFO fails to update the reference bit during a TLB shootdown' },
          { id: 3, text: 'Because physical frame addresses must always be strictly monotonically increasing' },
        ],
        explanation:
          'Stack algorithms like LRU guarantee that pages in memory with n frames are a subset of pages with n+1 frames. FIFO lacks this property, so increasing frame allocation can paradoxically cause more page faults.',
        citation: 'Silberschatz & Galvin · OS Concepts Section 10.4, p.398',
      },
      {
        id: 5,
        title: 'Storage & Unix File Systems',
        tag: 'IN PROGRESS',
        tagType: 'mid' as const,
        question:
          'In a Unix Fast File System (FFS) inode structure, what is the primary architectural purpose of indirect pointer blocks?',
        options: [
          { id: 0, text: 'To encrypt block addresses using hardware AES keys before saving metadata' },
          {
            id: 1,
            text: 'To allow compact inodes for small files while supporting multi-gigabyte files via hierarchical blocks',
            correct: true,
          },
          { id: 2, text: 'To deduplicate identical data blocks across multiple user home directories' },
          { id: 3, text: 'To provide automatic RAID parity checking without kernel filesystem drivers' },
        ],
        explanation:
          'Direct pointers provide single-lookup fast access for files up to 48KB (12 blocks x 4KB). Single, double, and triple indirect pointers expand capacity exponentially to hundreds of gigabytes without wasting space on small files.',
        citation: 'Operating Systems: Three Easy Pieces · Chapter 40, p.4',
      },
    ],
    []
  )

  // Quiz Demo State
  const [weakSpotOnly, setWeakSpotOnly] = useState(false)
  const activeQuizQuestions = useMemo(() => {
    return weakSpotOnly ? allQuizQuestions.filter((q) => q.tagType === 'weak') : allQuizQuestions
  }, [allQuizQuestions, weakSpotOnly])

  const [currentQuizIdx, setCurrentQuizIdx] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmittedMap, setQuizSubmittedMap] = useState<Record<number, boolean>>({})
  const [quizFinished, setQuizFinished] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)

  const currentQuestion = activeQuizQuestions[currentQuizIdx] || activeQuizQuestions[0]
  const isQuestionSubmitted = Boolean(quizSubmittedMap[currentQuizIdx])
  const selectedChoice = quizAnswers[currentQuizIdx] ?? null
  const isChoiceCorrect =
    selectedChoice !== null ? Boolean(currentQuestion?.options[selectedChoice]?.correct) : false

  const totalScore = useMemo(() => {
    let score = 0
    activeQuizQuestions.forEach((q, idx) => {
      const chosen = quizAnswers[idx]
      if (chosen !== undefined && q.options[chosen]?.correct) {
        score++
      }
    })
    return score
  }, [activeQuizQuestions, quizAnswers])

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
    if (isQuestionSubmitted) return
    setQuizAnswers((prev) => ({ ...prev, [currentQuizIdx]: idx }))
    setQuizSubmittedMap((prev) => ({ ...prev, [currentQuizIdx]: true }))
    if (currentQuestion.options[idx]?.correct) {
      setShowCelebration(true)
      setTimeout(() => setShowCelebration(false), 2400)
    }
  }

  const handleRetryCurrentQuestion = () => {
    setQuizAnswers((prev) => {
      const next = { ...prev }
      delete next[currentQuizIdx]
      return next
    })
    setQuizSubmittedMap((prev) => {
      const next = { ...prev }
      delete next[currentQuizIdx]
      return next
    })
    setShowCelebration(false)
  }

  const handleNextQuestion = () => {
    if (currentQuizIdx < activeQuizQuestions.length - 1) {
      setCurrentQuizIdx((prev) => prev + 1)
      setShowCelebration(false)
    } else {
      setQuizFinished(true)
      setShowCelebration(false)
    }
  }

  const handleResetQuiz = (drillWeakSpots = false) => {
    setWeakSpotOnly(drillWeakSpots)
    setCurrentQuizIdx(0)
    setQuizAnswers({})
    setQuizSubmittedMap({})
    setQuizFinished(false)
    setShowCelebration(false)
  }

  const handleDrillWeakSpotsFromProgress = () => {
    handleResetQuiz(true)
    setActiveTab('quiz')
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
                        <span>gemma2:9b (Local Ollama · 58 tok/s)</span>
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
              {quizFinished ? (
                <div className="quiz-results-card">
                  <div className="quiz-results-hero">
                    <div className="quiz-score-badge">
                      <span className="quiz-score-num">{totalScore}</span>
                      <span className="quiz-score-denom">OF {activeQuizQuestions.length}</span>
                    </div>
                    <div className="quiz-results-title-group">
                      <h3 className="quiz-results-headline">
                        {totalScore === activeQuizQuestions.length
                          ? 'Outstanding Mastery!'
                          : totalScore >= Math.ceil(activeQuizQuestions.length / 2)
                          ? 'Diagnostic Complete'
                          : 'Review Recommended'}
                      </h3>
                      <p className="quiz-results-sub">
                        You scored {Math.round((totalScore / activeQuizQuestions.length) * 100)}% (+{totalScore * 25} XP). Gist has logged your weak spots to optimize future spaced active recall.
                      </p>
                    </div>
                  </div>

                  <div className="quiz-results-breakdown">
                    {activeQuizQuestions.map((q, idx) => {
                      const ans = quizAnswers[idx]
                      const wasCorrect = ans !== undefined && q.options[ans]?.correct
                      return (
                        <div key={q.id} className="quiz-breakdown-row">
                          <div className="quiz-breakdown-left">
                            {wasCorrect ? (
                              <CheckCircle2 size={16} className="text-success" />
                            ) : (
                              <XCircle size={16} className="text-danger" />
                            )}
                            <span className="quiz-breakdown-title">
                              Q{idx + 1}: {q.title}
                            </span>
                          </div>
                          <div className="quiz-breakdown-right">
                            <span
                              className={`topic-badge ${
                                q.tagType === 'weak'
                                  ? 'badge-weak'
                                  : q.tagType === 'mid'
                                  ? 'badge-mid'
                                  : 'badge-strong'
                              }`}
                            >
                              {q.tag}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="quiz-results-actions">
                    <button
                      type="button"
                      className="quiz-primary-btn"
                      onClick={() => {
                        setQuizFinished(false)
                        setCurrentQuizIdx(0)
                      }}
                    >
                      <CircleHelp size={14} />
                      <span>Review Answers</span>
                    </button>

                    <button
                      type="button"
                      className="quiz-secondary-btn"
                      onClick={() => handleResetQuiz(false)}
                    >
                      <RotateCcw size={13} />
                      <span>Retake Full Quiz</span>
                    </button>

                    {!weakSpotOnly && (
                      <button
                        type="button"
                        className="quiz-secondary-btn"
                        onClick={() => handleResetQuiz(true)}
                      >
                        <RefreshCw size={13} />
                        <span>Drill Weak Spots (2 Qs)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="quiz-secondary-btn"
                      onClick={() => setActiveTab('progress')}
                    >
                      <ChartColumn size={13} />
                      <span>View Weak-Spot Tracker</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="quiz-demo-card">
                  <div className="quiz-card-header">
                    <div className="quiz-header-left">
                      <span className="quiz-topic-tag">{currentQuestion.title}</span>
                      <span className="quiz-diag-badge">
                        {weakSpotOnly
                          ? `WEAK-SPOT DRILL QUESTION ${currentQuizIdx + 1} OF ${activeQuizQuestions.length}`
                          : `DIAGNOSTIC QUESTION ${currentQuizIdx + 1} OF ${activeQuizQuestions.length}`}
                      </span>
                    </div>

                    <div className="quiz-header-actions">
                      {weakSpotOnly ? (
                        <button
                          type="button"
                          className="quiz-mode-switch-btn"
                          onClick={() => handleResetQuiz(false)}
                          title="Switch to full 5-question diagnostic"
                        >
                          Full 5-Question Quiz
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="quiz-mode-switch-btn"
                          onClick={() => handleResetQuiz(true)}
                          title="Focus only on flagged weak spots"
                        >
                          Focus Weak Spots (2 Qs)
                        </button>
                      )}
                      <button
                        type="button"
                        className="quiz-retry-btn"
                        onClick={() => handleResetQuiz(weakSpotOnly)}
                        title="Restart quiz"
                      >
                        <RotateCcw size={12} />
                        <span>Restart</span>
                      </button>
                    </div>
                  </div>

                  {/* Stepper question selector */}
                  <div className="quiz-stepper" role="navigation" aria-label="Question selector">
                    {activeQuizQuestions.map((q, idx) => {
                      const isCurrent = currentQuizIdx === idx
                      const isAnswered = quizSubmittedMap[idx]
                      const ans = quizAnswers[idx]
                      const wasCorrect = ans !== undefined && q.options[ans]?.correct

                      let statusClass = ''
                      if (isAnswered) {
                        statusClass = wasCorrect ? 'correct' : 'wrong'
                      }

                      return (
                        <button
                          key={q.id}
                          type="button"
                          className={`quiz-step-btn ${isCurrent ? 'active' : ''} ${statusClass}`}
                          onClick={() => {
                            setCurrentQuizIdx(idx)
                            setShowCelebration(false)
                          }}
                          aria-label={`Question ${idx + 1}: ${q.title}`}
                        >
                          <span className="quiz-stepper-dot" />
                          <span>Q{idx + 1}</span>
                          {isAnswered && wasCorrect && <Check size={11} className="text-success" />}
                          {isAnswered && !wasCorrect && <XCircle size={11} className="text-danger" />}
                        </button>
                      )
                    })}
                  </div>

                  <h3 className="quiz-question-text">{currentQuestion.question}</h3>

                  <div className="quiz-options-list">
                    {currentQuestion.options.map((option, idx) => {
                      const isSelected = selectedChoice === idx
                      let stateClass = ''
                      if (isQuestionSubmitted) {
                        if (option.correct) stateClass = 'opt-correct'
                        else if (isSelected && !option.correct) stateClass = 'opt-wrong'
                        else stateClass = 'opt-dimmed'
                      }

                      return (
                        <motion.button
                          key={option.id}
                          type="button"
                          whileHover={!isQuestionSubmitted ? { x: 4 } : {}}
                          whileTap={!isQuestionSubmitted ? { scale: 0.99 } : {}}
                          className={`quiz-option-btn ${isSelected ? 'selected' : ''} ${stateClass}`}
                          onClick={() => handleSelectQuiz(idx)}
                          disabled={isQuestionSubmitted}
                        >
                          <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                          <span className="option-text">{option.text}</span>
                          {isQuestionSubmitted && option.correct && (
                            <CheckCircle2 size={16} className="text-success opt-icon" />
                          )}
                          {isQuestionSubmitted && isSelected && !option.correct && (
                            <XCircle size={16} className="text-danger opt-icon" />
                          )}
                        </motion.button>
                      )
                    })}
                  </div>

                  {isQuestionSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, transform: 'translateY(6px)' }}
                      animate={{ opacity: 1, transform: 'translateY(0px)' }}
                      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                      className="quiz-feedback-box"
                    >
                      <div className="feedback-head">
                        {isChoiceCorrect ? (
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
                        <button
                          type="button"
                          className="quiz-retry-btn"
                          onClick={handleRetryCurrentQuestion}
                        >
                          <RefreshCw size={12} />
                          <span>Try Again</span>
                        </button>
                      </div>
                      <p className="feedback-explanation">{currentQuestion.explanation}</p>
                      <div className="feedback-citation">
                        <FileText size={12} />
                        <span>Source: {currentQuestion.citation}</span>
                      </div>

                      <div className="quiz-feedback-actions">
                        {currentQuizIdx > 0 && (
                          <button
                            type="button"
                            className="quiz-secondary-btn"
                            onClick={() => {
                              setCurrentQuizIdx((prev) => prev - 1)
                              setShowCelebration(false)
                            }}
                          >
                            <ChevronLeft size={13} />
                            <span>Previous</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="quiz-primary-btn"
                          onClick={handleNextQuestion}
                        >
                          <span>
                            {currentQuizIdx < activeQuizQuestions.length - 1
                              ? 'Next Question'
                              : 'View Diagnostic Results'}
                          </span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
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
                      onClick={handleDrillWeakSpotsFromProgress}
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
