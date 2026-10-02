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
  const [shown, setShown] = useState(full)

  useEffect(() => {
    setShown(full)
  }, [full])

  if (!streaming) {
    return {
      text: full,
      isStreaming: false,
    }
  }

  return {
    text: shown,
    isStreaming: true,
  }
}
