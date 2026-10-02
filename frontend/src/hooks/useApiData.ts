import { useCallback, useEffect, useState } from 'react'
import { getDocuments, getHealth, getProgress } from '../lib/api'
import type { DocumentInfo, HealthStatus, ProgressSummary } from '../lib/types'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDocuments(await getDocuments())
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { documents, loading, error, refresh }
}

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setHealth(await getHealth())
    } catch {
      // The health endpoint is decoration, not a blocker — failures are
      // surfaced on the screens that actually need the backend.
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { health, refresh }
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setProgress(await getProgress())
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { progress, loading, error, refresh }
}
