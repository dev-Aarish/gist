import { BookOpen, FileText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Citation } from '../lib/types'

function shortSource(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')
}

export function SourceList({ sources }: { sources: Citation[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!sources || sources.length === 0) return null

  return (
    <div className="citations-wrap" ref={containerRef}>
      <button
        type="button"
        className="citations-btn"
        aria-expanded={isOpen}
        aria-label={`Show ${sources.length} citation passages`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
        <span>Citations ({sources.length})</span>
      </button>

      {isOpen ? (
        <div className="citations-card" role="dialog" aria-label="Citations detail">
          <div className="citations-card__head">
            <span className="citations-card__title">
              <BookOpen size={13} strokeWidth={1.5} aria-hidden="true" />
              <span>Citations ({sources.length})</span>
            </span>
            <button
              type="button"
              className="citations-card__close"
              aria-label="Close citations"
              title="Close"
              onClick={() => setIsOpen(false)}
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <div className="citations-card__body">
            {sources.map((citation, index) => (
              <div
                key={`${citation.source}-${citation.page}-${index}`}
                className="citation-item"
              >
                <div className="citation-item__meta">
                  <FileText size={13} strokeWidth={1.5} aria-hidden="true" />
                  <span className="citation-item__file">
                    {shortSource(citation.source)}
                  </span>
                  <span>·</span>
                  <span>p. {citation.page}</span>
                </div>
                {citation.text_snippet ? (
                  <p className="citation-item__passage">{citation.text_snippet}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
