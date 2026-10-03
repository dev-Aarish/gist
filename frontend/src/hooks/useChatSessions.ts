import { useCallback, useEffect, useState } from 'react'
import type { ChatTurn } from '../components/ChatMessage'

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  turns: ChatTurn[]
}

const STORAGE_KEY = 'gist_chat_sessions_v2'
const ACTIVE_SESSION_KEY = 'gist_active_chat_session_id_v2'

function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Streaming is transient UI state, but it can slip into localStorage when a
 * session is saved mid-answer (reload or close while the model is replying).
 * Rehydrate turns with it cleared, and drop assistant turns that were saved
 * empty because the stream was interrupted, so old answers never keep a
 * blinking caret or an endless "Reading your notes" label.
 */
function reviveTurns(turns: ChatTurn[]): ChatTurn[] {
  return turns
    .filter(
      (turn) => !(turn.role === 'assistant' && turn.streaming && !turn.text && !turn.error)
    )
    .map((turn) => (turn.streaming ? { ...turn, streaming: false } : turn))
}

export function deriveTitle(question: string): string {
  if (!question || !question.trim()) return 'New question'

  let text = question.trim().replace(/\s+/g, ' ')

  // Extract topic mention if any (e.g. @Biology or @OS)
  let topicTag = ''
  const topicMatch = text.match(/^@([\w-]+)\s+/)
  if (topicMatch) {
    topicTag = `[${topicMatch[1]}] `
    text = text.slice(topicMatch[0].length).trim()
  }

  // Remove leading conversational fillers and question intros
  const fillerPatterns = [
    /^(can|could|would) you (please\s+)?(explain|tell me|describe|show me|give me|summarize|detail|outline|help me with|provide( me with)?)\s+/i,
    /^please (explain|tell me|describe|summarize|outline|provide|help me with)\s+/i,
    /^(what|where|when|why|who|how) (is|are|was|were|does|do|did|can|could|should|would) (the\s+)?/i,
    /^what's (the\s+)?/i,
    /^tell me (about|around)\s+/i,
    /^explain (to me\s+)?(the\s+)?/i,
    /^summarize (the\s+)?/i,
    /^help me (understand|with)\s+/i,
    /^i (want|would like) to (know|understand|learn) (about\s+)?/i,
    /^(give|show) me (a|an|the|some)?\s*(example|summary|overview|details|explanation) of\s+/i,
    /^(notes|questions?|info|information) (on|about)\s+/i,
  ]

  let cleanText = text
  let matched = true
  let attempts = 0
  while (matched && attempts < 3) {
    matched = false
    attempts++
    for (const pattern of fillerPatterns) {
      const next = cleanText.replace(pattern, '')
      if (next !== cleanText) {
        cleanText = next.trim()
        matched = true
        break
      }
    }
  }

  // Strip trailing punctuation
  cleanText = cleanText.replace(/[\?\!\.\:\;]+$/, '').trim()

  // Revert if stripping left an empty string or single char
  if (cleanText.length < 2) {
    cleanText = text.replace(/[\?\!\.\:\;]+$/, '').trim()
  }

  if (!cleanText) return 'New question'

  // Ensure initial letter is uppercase
  cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1)

  const fullTitle = `${topicTag}${cleanText}`

  // Truncate cleanly at word boundaries
  const MAX_LEN = 38
  if (fullTitle.length <= MAX_LEN) {
    return fullTitle
  }

  const truncated = fullTitle.slice(0, MAX_LEN)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > 12) {
    return `${truncated.slice(0, lastSpace)}…`
  }
  return `${truncated.slice(0, MAX_LEN - 1)}…`
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ChatSession[]
        if (Array.isArray(parsed)) {
          return parsed.map((session) => ({
            ...session,
            turns: reviveTurns(session.turns ?? []),
          }))
        }
      }
    } catch {
      // ignore
    }
    return []
  })

  // Always start with a new chat (null activeId) on site open / refresh
  const [activeId, setActiveId] = useState<string | null>(null)

  // Clear stored active session key from localStorage on mount
  useEffect(() => {
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
    } catch {
      // ignore
    }
  }, [])

  // Sync sessions to localStorage, without persisting the transient flag.
  useEffect(() => {
    try {
      const persisted = sessions.map((session) => ({
        ...session,
        turns: reviveTurns(session.turns),
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
    } catch {
      // ignore
    }
  }, [sessions])

  // Ensure activeId remains valid when sessions change
  useEffect(() => {
    if (activeId && !sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0]?.id ?? null)
    }
  }, [sessions, activeId])

  const activeSession = sessions.find((s) => s.id === activeId) ?? null

  const createSession = useCallback((initialTurns: ChatTurn[] = []): string => {
    const id = generateSessionId()
    const now = new Date().toISOString()
    const firstUserMsg = initialTurns.find((t) => t.role === 'user')?.text
    const title = firstUserMsg ? deriveTitle(firstUserMsg) : 'New question'
    const newSession: ChatSession = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      turns: initialTurns,
    }
    setSessions((prev) => [newSession, ...prev.filter((s) => s.turns.length > 0)])
    setActiveId(id)
    return id
  }, [])

  const selectSession = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const startNewSession = useCallback(() => {
    setActiveId(null)
  }, [])

  const updateTurns = useCallback((targetId: string, turns: ChatTurn[]) => {
    const now = new Date().toISOString()
    const firstUserMsg = turns.find((t) => t.role === 'user')?.text
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === targetId)
      if (!exists) {
        const title = firstUserMsg ? deriveTitle(firstUserMsg) : 'New question'
        return [
          {
            id: targetId,
            title,
            createdAt: now,
            updatedAt: now,
            turns,
          },
          ...prev,
        ]
      }
      return prev.map((s) => {
        if (s.id !== targetId) return s
        const title =
          (s.title === 'New question' || s.title === '') && firstUserMsg
            ? deriveTitle(firstUserMsg)
            : s.title
        return {
          ...s,
          title,
          updatedAt: now,
          turns,
        }
      })
    })
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setActiveId((curr) => (curr === id ? null : curr))
  }, [])

  const clearAllSessions = useCallback(() => {
    setSessions([])
    setActiveId(null)
  }, [])

  return {
    sessions,
    activeId,
    activeSession,
    createSession,
    selectSession,
    startNewSession,
    updateTurns,
    deleteSession,
    clearAllSessions,
  }
}

