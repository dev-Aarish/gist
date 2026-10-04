import { useCallback, useEffect, useState } from 'react'
import {
  getDocuments,
  getHealth,
  getProgress,
  getPastPapers,
  getPastPaperSubjects,
  getPastPaperAnalysis,
  getPriorityMatrix,
} from '../lib/api'
import type {
  DocumentInfo,
  HealthStatus,
  ProgressSummary,
  PastPaper,
  PastPaperSubject,
  PastPaperAnalysis,
  PriorityMatrixResponse,
} from '../lib/types'

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

export function usePastPaperSubjects() {
  const [subjects, setSubjects] = useState<PastPaperSubject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getPastPaperSubjects()
      setSubjects(res.subjects)
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

  return { subjects, loading, error, refresh }
}

export function usePastPapers(subject?: string) {
  const [papers, setPapers] = useState<PastPaper[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getPastPapers(subject)
      setPapers(res.papers)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [subject])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { papers, loading, error, refresh }
}

export function usePastPaperAnalysis(subject?: string) {
  const [analysis, setAnalysis] = useState<PastPaperAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getPastPaperAnalysis(subject)
      setAnalysis(res)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [subject])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { analysis, loading, error, refresh }
}

export function usePriorityMatrix(subject?: string) {
  const [matrix, setMatrix] = useState<PriorityMatrixResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getPriorityMatrix(subject)
      setMatrix(res)
      setError(null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [subject])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { matrix, loading, error, refresh }
}



