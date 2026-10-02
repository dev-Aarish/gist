import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './useMediaQuery'

/**
 * Reveals an answer token-by-token at a readable, steady rate. The backend
 * returns the whole answer, so this is a presentation layer: it makes a long
 * wait feel like a thought being written rather than a wall of text landing.
 * Reduced motion short-circuits to the full answer.
 */
export function useStreamingText(full: string, enabled = true) {
  const reduceMotion = usePrefersReducedMotion()
  const streaming = enabled && !reduceMotion
  const [shown, setShown] = useState(streaming ? '' : full)

  useEffect(() => {
    if (!streaming) return

    setShown('')
    // Roughly a constant duration regardless of answer length.
    const step = Math.max(2, Math.round(full.length / 110))
    let index = 0
    const id = window.setInterval(() => {
      index = Math.min(full.length, index + step)
      setShown(full.slice(0, index))
      if (index >= full.length) window.clearInterval(id)
    }, 16)

    return () => window.clearInterval(id)
  }, [full, streaming])

  if (!streaming) {
    return {
      text: full,
      isStreaming: false,
    }
  }

  return {
    text: shown,
    isStreaming: shown.length < full.length,
  }
}
