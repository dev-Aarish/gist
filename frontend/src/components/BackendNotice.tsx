import { AlertTriangle } from 'lucide-react'

export const BACKEND_MESSAGE =
  'Gist can’t reach its local backend, so it can’t read your notes right now. Start it on port 8000 and try again.'

/**
 * One consistent, actionable message wherever the backend is unavailable.
 * Errors say what happened and what to do next — they never just apologise.
 */
export function BackendNotice({
  message,
  onRetry,
}: {
  message?: string | null
  onRetry: () => void
}) {
  return (
    <div className="notice notice--danger" role="alert">
      <AlertTriangle
        className="notice__icon"
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="notice__body">
        <p>{message?.trim() ? message : BACKEND_MESSAGE}</p>
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}
