import { AlertTriangle, RotateCcw } from 'lucide-react'
import { memo } from 'react'
import { RichText } from '../lib/richText'
import type { Citation } from '../lib/types'
import { SourceList } from './SourceList'
import { useStreamingText } from '../hooks/useStreamingText'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  userQuestion?: string
  topic?: string
  sources?: Citation[]
  model?: string
  streaming?: boolean
  error?: boolean
}

export const ChatMessage = memo(function ChatMessage({
  turn,
  onRetry,
}: {
  turn: ChatTurn
  onRetry?: (question: string) => void
}) {
  const { text, isStreaming } = useStreamingText(
    turn.text,
    Boolean(turn.streaming)
  )

  if (turn.role === 'user') {
    return (
      <li className="msg msg--user">
        <div className="msg__col">
          <div className="msg__bubble">
            <p>{turn.text}</p>
            {turn.topic ? (
              <div style={{ marginTop: 'var(--space-1)' }}>
                <span className="msg__topic-tag">@{turn.topic}</span>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    )
  }

  if (turn.error) {
    return (
      <li className="msg msg--assistant">
        <div className="msg__col">
          <div
            className="notice notice--danger"
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertTriangle
                className="notice__icon"
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p>{turn.text}</p>
            </div>
            {onRetry && turn.userQuestion ? (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => onRetry(turn.userQuestion!)}
                style={{
                  height: '30px',
                  padding: '0 10px',
                  fontSize: '12px',
                  gap: '6px',
                }}
              >
                <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
                Retry
              </button>
            ) : null}
          </div>
        </div>
      </li>
    )
  }

  return (
    <li className="msg msg--assistant">
      <div className="msg__col">
        <div
          className="msg__bubble"
          aria-live={turn.streaming ? 'polite' : undefined}
          aria-busy={isStreaming || undefined}
        >
          {turn.streaming && text.length === 0 ? (
            <div className="msg__skeleton" aria-hidden="true">
              <span className="skel skel--line skel--wide" />
              <span className="skel skel--line skel--mid" />
              <span className="skel skel--line skel--short" />
            </div>
          ) : (
            <div className="prose">
              <RichText text={text} />
              {isStreaming ? <span className="caret" aria-hidden="true" /> : null}
            </div>
          )}
        </div>

        {!isStreaming && turn.sources && turn.sources.length > 0 ? (
          <SourceList sources={turn.sources} />
        ) : null}

        {!isStreaming && turn.model ? (
          <div className="msg__note">
            <span className="t-label" style={{ color: 'var(--text-faint)' }}>
              {turn.model}
            </span>
          </div>
        ) : null}

        {isStreaming ? (
          <div className="msg__note">
            <span className="t-label" style={{ color: 'var(--text-faint)' }}>
              Reading your notes
            </span>
          </div>
        ) : null}
      </div>
    </li>
  )
})
