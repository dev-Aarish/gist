import { ArrowUp, AtSign, BookOpen, Paperclip, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { askQuestion, uploadNotes } from '../lib/api'
import { pluralize } from '../lib/format'
import type { DocumentInfo } from '../lib/types'
import type { ScreenId } from '../lib/nav'
import type { ChatSession } from '../hooks/useChatSessions'
import { BackendNotice } from '../components/BackendNotice'
import { ChatMessage, type ChatTurn } from '../components/ChatMessage'
import { EmptyState } from '../components/EmptyState'

const CUSTOM_SUBJECTS_KEY = 'gist_custom_subjects_v1'

let turnSeq = 0
const nextTurnId = () => `turn-${(turnSeq += 1)}`

export function AskScreen({
  documents,
  model,
  offline,
  offlineMessage,
  onRetry,
  onNavigate,
  onDocumentsChanged,
  sessions,
  activeSessionId,
  onStartNewSession,
  onUpdateTurns,
  onCreateSession,
}: {
  documents: DocumentInfo[]
  model: string | null
  offline: boolean
  offlineMessage: string | null
  onRetry: () => void
  onNavigate: (next: ScreenId) => void
  onDocumentsChanged: () => void
  sessions?: ChatSession[]
  activeSessionId?: string | null
  onStartNewSession?: () => void
  onUpdateTurns?: (sessionId: string, turns: ChatTurn[]) => void
  onCreateSession?: (initialTurns?: ChatTurn[]) => string
}) {
  const activeSession = sessions?.find((s) => s.id === activeSessionId) ?? null
  const [turns, setTurns] = useState<ChatTurn[]>(() => activeSession?.turns ?? [])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Subject targeting state
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const hasNotes = documents.length > 0

  // Aggregate all unique subjects
  const allSubjects = useMemo(() => {
    const list: string[] = []
    for (const doc of documents) {
      const t = doc.topic?.trim() || 'General'
      if (!list.includes(t)) list.push(t)
    }
    try {
      const saved = localStorage.getItem(CUSTOM_SUBJECTS_KEY)
      if (saved) {
        const custom = JSON.parse(saved) as string[]
        for (const sub of custom) {
          if (sub && !list.includes(sub)) list.push(sub)
        }
      }
    } catch {
      // ignore
    }
    return list
  }, [documents])

  const filteredSubjects = useMemo(() => {
    if (!mentionFilter) return allSubjects
    const q = mentionFilter.toLowerCase()
    return allSubjects.filter((s) => s.toLowerCase().includes(q))
  }, [allSubjects, mentionFilter])

  // Keep turns synced when switching sessions
  useEffect(() => {
    setTurns(activeSession?.turns ?? [])
  }, [activeSessionId, activeSession])

  useEffect(() => {
    if (turns.length === 0) return
    const id = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end' })
    })
    return () => cancelAnimationFrame(id)
  }, [turns])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)

    const cursor = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursor)
    const lastAt = textBeforeCursor.lastIndexOf('@')

    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
      const query = textBeforeCursor.slice(lastAt + 1)
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionFilter(query)
        setShowMentionMenu(true)
        setHighlightIndex(0)
        return
      }
    }
    setShowMentionMenu(false)
  }

  function selectSubject(subject: string) {
    setSelectedTopic(subject)
    if (inputRef.current) {
      const cursor = inputRef.current.selectionStart ?? input.length
      const textBeforeCursor = input.slice(0, cursor)
      const lastAt = textBeforeCursor.lastIndexOf('@')
      if (lastAt !== -1 && (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1]))) {
        const query = textBeforeCursor.slice(lastAt + 1)
        if (!query.includes(' ') && !query.includes('\n')) {
          const nextInput =
            input.slice(0, lastAt) + input.slice(cursor).trimStart()
          setInput(nextInput)
        }
      }
    }
    setShowMentionMenu(false)
    setMentionFilter('')
    inputRef.current?.focus()
  }

  async function submit(customQuestion?: string, overrideTopic?: string) {
    const question = (customQuestion ?? input).trim()
    if (!question || sending) return

    const topicToAsk = overrideTopic ?? selectedTopic
    const pendingId = nextTurnId()
    if (!customQuestion) setInput('')
    setSending(true)

    const userTurn: ChatTurn = {
      id: nextTurnId(),
      role: 'user',
      text: question,
      topic: topicToAsk ?? undefined,
    }
    const pendingTurn: ChatTurn = {
      id: pendingId,
      role: 'assistant',
      text: '',
      streaming: true,
      userQuestion: question,
    }

    const nextTurns = [...turns, userTurn, pendingTurn]
    setTurns(nextTurns)

    let currentSessionId = activeSessionId
    if (!currentSessionId && onCreateSession) {
      currentSessionId = onCreateSession(nextTurns)
    } else if (currentSessionId && onUpdateTurns) {
      onUpdateTurns(currentSessionId, nextTurns)
    }

    try {
      const response = await askQuestion(question, { topic: topicToAsk ?? undefined })
      const finalizedTurns = nextTurns.map((turn) =>
        turn.id === pendingId
          ? {
              ...turn,
              text: response.answer,
              sources: response.sources,
              model: response.model,
            }
          : turn
      )
      setTurns(finalizedTurns)
      if (currentSessionId && onUpdateTurns) {
        onUpdateTurns(currentSessionId, finalizedTurns)
      }
    } catch (error) {
      const errorTurns = nextTurns.map((turn) =>
        turn.id === pendingId
          ? {
              ...turn,
              streaming: false,
              error: true,
              text:
                error instanceof Error
                  ? error.message
                  : 'Couldn’t get an answer. Try again.',
            }
          : turn
      )
      setTurns(errorTurns)
      if (currentSessionId && onUpdateTurns) {
        onUpdateTurns(currentSessionId, errorTurns)
      }
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setUploading(true)
    try {
      const response = await uploadNotes(list, selectedTopic ?? undefined)
      const lines = response.results.map((result) => {
        const name = result.source ?? result.filename ?? 'file'
        if (result.status === 'success') {
          return `Indexed ${name} into [${result.topic ?? 'General'}] — ${result.pages ?? 0} ${pluralize(
            result.pages ?? 0,
            'page'
          )}, ${result.chunks_indexed ?? 0} chunks.`
        }
        return `${name}: ${result.message ?? 'couldn’t be indexed.'}`
      })
      const nextTurns = [
        ...turns,
        {
          id: nextTurnId(),
          role: 'assistant' as const,
          text: lines.join('\n\n'),
          model: undefined,
        },
      ]
      setTurns(nextTurns)
      if (activeSessionId && onUpdateTurns) {
        onUpdateTurns(activeSessionId, nextTurns)
      }
      onDocumentsChanged()
    } catch (error) {
      const nextTurns = [
        ...turns,
        {
          id: nextTurnId(),
          role: 'assistant' as const,
          error: true,
          text:
            error instanceof Error
              ? error.message
              : 'Couldn’t upload that file. Try again.',
        },
      ]
      setTurns(nextTurns)
      if (activeSessionId && onUpdateTurns) {
        onUpdateTurns(activeSessionId, nextTurns)
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Never claim there are no notes when the real problem is a silent backend.
  if (offline && !hasNotes) {
    return (
      <div className="screen">
        <header className="page-head">
          <div className="page-head__meta">
            <h1 className="t-h1">Ask your notes</h1>
          </div>
        </header>
        <BackendNotice message={offlineMessage} onRetry={onRetry} />
      </div>
    )
  }

  if (!hasNotes && turns.length === 0) {
    return (
      <div className="screen">
        <div className="panel regmark">
          <EmptyState
            icon={BookOpen}
            title="Add your first notes"
            action={
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onNavigate('notes')}
              >
                Add notes
              </button>
            }
          >
            Gist answers only from the material you give it, so it never guesses.
            Start with a PDF of your course notes.
          </EmptyState>
        </div>
      </div>
    )
  }

  const renderComposer = (isCentered: boolean) => (
    <div className={`composer ${isCentered ? 'composer--center' : ''}`}>
      {selectedTopic ? (
        <div className="composer__tag-bar">
          <span className="composer__tag">
            <AtSign size={11} strokeWidth={2} />
            <span>{selectedTopic}</span>
            <button
              type="button"
              className="composer__tag-clear"
              aria-label={`Remove @${selectedTopic} filter`}
              title={`Remove @${selectedTopic}`}
              onClick={() => setSelectedTopic(null)}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        {showMentionMenu && allSubjects.length > 0 ? (
          <div className="mention-popup" role="listbox" aria-label="Select subject">
            {filteredSubjects.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No subjects match &ldquo;{mentionFilter}&rdquo;
              </div>
            ) : (
              filteredSubjects.map((sub, idx) => {
                const count = documents.filter((d) => (d.topic?.trim() || 'General') === sub).length
                return (
                  <button
                    key={sub}
                    type="button"
                    role="option"
                    aria-selected={idx === highlightIndex}
                    className={`mention-popup__item${idx === highlightIndex ? ' mention-popup__item--active' : ''}`}
                    onClick={() => selectSubject(sub)}
                  >
                    <span className="mention-popup__name">@{sub}</span>
                    <span className="mention-popup__meta">
                      {count} {pluralize(count, 'file')}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}

        <form
          className="composer__field"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Add notes from a PDF"
            title="Add notes from a PDF"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <textarea
            ref={inputRef}
            className="composer__input"
            rows={1}
            value={input}
            placeholder={
              selectedTopic
                ? `Ask about @${selectedTopic}…`
                : hasNotes
                ? 'Ask something or type @ to pick a subject…'
                : 'Add notes, then ask anything…'
            }
            aria-label="Your question"
            onChange={handleInputChange}
            onKeyDown={(event) => {
              if (showMentionMenu && filteredSubjects.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setHighlightIndex((prev) => (prev + 1) % filteredSubjects.length)
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setHighlightIndex((prev) => (prev - 1 + filteredSubjects.length) % filteredSubjects.length)
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  selectSubject(filteredSubjects[highlightIndex] ?? filteredSubjects[0])
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setShowMentionMenu(false)
                  return
                }
              }

              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <button
            type="submit"
            className="btn btn--primary btn--icon"
            aria-label="Send question"
            disabled={sending || input.trim().length === 0}
          >
            <ArrowUp size={17} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </div>
      {uploading ? (
        <div className="composer__hint">
          <span className="t-label">Indexing your file…</span>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className={`screen ${turns.length === 0 ? 'screen--ask-empty' : ''}`}>
      <header className="page-head">
        <div className="page-head__meta">
          <h1 className="t-h1">Ask your notes</h1>
          {activeSession ? (
            <span className="t-label t-muted" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
              {activeSession.title}
            </span>
          ) : null}
        </div>
        <div className="page-head__actions">
          {onStartNewSession && (turns.length > 0 || activeSessionId) ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onStartNewSession}
              title="Start a new Q&A session"
            >
              <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>New question</span>
            </button>
          ) : null}
          {model ? <span className="model-badge">{model}</span> : null}
        </div>
      </header>

      {turns.length === 0 ? (
        <div className="ask-hero">
          <div className="ask-hero__meta">
            <h2 className="ask-hero__title">What do you want to ask?</h2>
            <p className="ask-hero__sub">
              Answers come strictly from your uploaded course notes, with exact page citations.
            </p>
          </div>
          {renderComposer(true)}
        </div>
      ) : (
        <>
          <ul className="chat" aria-label="Conversation">
            {turns.map((turn) => (
              <ChatMessage
                key={turn.id}
                turn={turn}
                onRetry={(q) => void submit(q, turn.topic)}
              />
            ))}
          </ul>
          <div ref={endRef} />
          {renderComposer(false)}
        </>
      )}
    </div>
  )
}

