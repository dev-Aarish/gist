import { Check, Cpu, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelInfo } from '../lib/types'

function formatSize(bytes?: number | null): string | null {
  if (!bytes || bytes <= 0) return null
  const gb = bytes / 1_000_000_000
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${Math.round(bytes / 1_000_000)} MB`
}

/**
 * A small popover for switching the local Ollama model. Only models actually
 * pulled into Ollama are listed — picking an unavailable model is a dead end,
 * so the UI never offers one.
 */
export function ModelPicker({
  models,
  active,
  switching,
  error,
  onSelect,
  disabled = false,
}: {
  models: ModelInfo[]
  active: string | null
  switching: boolean
  error: string | null
  onSelect: (model: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape, like any other menu.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (disabled) {
    return (
      <span className="model-badge">
        <Cpu size={11} strokeWidth={1.5} aria-hidden="true" />
        Backend offline
      </span>
    )
  }

  const hasModels = models.length > 0

  return (
    <div className="model-picker" ref={wrapRef}>
      <button
        type="button"
        className="model-badge model-badge--button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={switching || !hasModels}
        onClick={() => setOpen((prev) => !prev)}
        title={hasModels ? 'Switch the local model' : 'No models installed in Ollama'}
      >
        {switching ? (
          <Loader2 className="model-picker__spin" size={11} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Cpu size={11} strokeWidth={1.5} aria-hidden="true" />
        )}
        <span className="model-picker__name">{active ?? 'No model'}</span>
      </button>

      {open ? (
        <div className="model-picker__menu" role="listbox" aria-label="Installed models">
          {models.map((model) => {
            const isActive = model.name === active
            const size = formatSize(model.size_bytes)
            return (
              <button
                key={model.name}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`model-picker__item${isActive ? ' model-picker__item--active' : ''}`}
                onClick={() => {
                  setOpen(false)
                  onSelect(model.name)
                }}
              >
                <span className="model-picker__item-main">
                  <span className="model-picker__item-name">{model.name}</span>
                  {size ? <span className="model-picker__item-size">{size}</span> : null}
                </span>
                {isActive ? (
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {error ? <span className="model-picker__error">{error}</span> : null}
    </div>
  )
}
