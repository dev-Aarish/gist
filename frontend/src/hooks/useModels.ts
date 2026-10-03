import { useCallback, useEffect, useState } from 'react'
import { getModels, selectModel } from '../lib/api'
import type { ModelInfo } from '../lib/types'

/**
 * Owns the list of chat models installed in Ollama and the currently active
 * one. The backend persists the selection, so this is just a view of it.
 *
 * `onChanged` lets the caller refresh anything that displays the model name
 * (the health card, the answer footer) once a switch succeeds.
 */
export function useModels(onChanged?: () => void) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await getModels()
      setModels(res.models)
      setActive(res.active_model)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t list models.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const choose = useCallback(
    async (model: string) => {
      if (model === active) return
      setSwitching(true)
      setError(null)
      try {
        const res = await selectModel(model)
        setModels(res.models)
        setActive(res.active_model)
        onChanged?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Couldn’t switch models.')
      } finally {
        setSwitching(false)
      }
    },
    [active, onChanged]
  )

  return { models, active, loading, switching, error, refresh, choose }
}
