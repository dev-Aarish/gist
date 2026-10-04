import type {
  AskResponse,
  Citation,
  DocumentInfo,
  HealthStatus,
  ModelsResponse,
  ProgressSummary,
  Quiz,
  QuizQuestion,
  QuizResult,
  TopicStat,
  UploadResponse,
} from './types'

// Vite proxies /api to the FastAPI backend in dev; a built app served by the
// backend uses the same path, so nothing is hardcoded to localhost.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(
      'Couldn’t reach the local backend. Make sure it’s running, then try again.',
      0
    )
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = body.detail[0]?.msg ?? detail
    } catch {
      /* keep the default message */
    }
    throw new ApiError(detail, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export function getHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('/health')
}

export function getModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>('/models')
}

export function selectModel(model: string): Promise<ModelsResponse> {
  return request<ModelsResponse>('/models/select', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ model }),
  })
}

export function askQuestion(
  question: string,
  opts: { topK?: number; topic?: string | null; source?: string | null } = {}
): Promise<AskResponse> {
  return request<AskResponse>('/ask', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      question,
      top_k: opts.topK,
      topic: opts.topic ?? null,
      source: opts.source ?? null,
    }),
  })
}

export interface StreamChunk {
  type: 'sources' | 'token' | 'done' | 'error'
  sources?: Citation[]
  model?: string
  token?: string
  answer?: string
  error?: string
}

export async function askQuestionStream(
  question: string,
  opts: { topK?: number; topic?: string | null; source?: string | null } = {},
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE}/ask/stream`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        question,
        top_k: opts.topK,
        topic: opts.topic ?? null,
        source: opts.source ?? null,
      }),
    })
  } catch {
    throw new ApiError(
      'Couldn’t reach the local backend. Make sure it’s running, then try again.',
      0
    )
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = body.detail[0]?.msg ?? detail
    } catch {
      /* keep default */
    }
    throw new ApiError(detail, res.status)
  }

  if (!res.body) throw new ApiError('No response body for stream', 0)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6)
        try {
          const parsed = JSON.parse(jsonStr) as StreamChunk
          onChunk(parsed)
        } catch {
          /* ignore parse error */
        }
      }
    }
  }

  if (buffer.trim().startsWith('data: ')) {
    try {
      const parsed = JSON.parse(buffer.trim().slice(6)) as StreamChunk
      onChunk(parsed)
    } catch {
      /* ignore */
    }
  }
}


export function generateQuiz(opts: {
  topic?: string | null
  numQuestions?: number
  useWeakSpots?: boolean
  useHighYield?: boolean
  fastMode?: boolean
}): Promise<Quiz> {
  return request<Quiz>('/quiz/generate', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      topic: opts.topic ?? null,
      num_questions: opts.numQuestions ?? 5,
      use_weak_spots: opts.useWeakSpots ?? false,
      use_high_yield: opts.useHighYield ?? false,
      fast_mode: opts.fastMode ?? false,
    }),
  })
}

export function submitQuiz(input: {
  quizId: string
  topic: string
  answers: Record<string, string>
  questions: QuizQuestion[]
}): Promise<QuizResult> {
  return request<QuizResult>('/quiz/submit', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      quiz_id: input.quizId,
      topic: input.topic,
      answers: input.answers,
      questions: input.questions,
    }),
  })
}

export function getQuizAttemptDetails(quizId: string): Promise<QuizResult> {
  return request<QuizResult>(`/quiz/attempts/${encodeURIComponent(quizId)}`)
}

export function getTopicHistory(topic: string): Promise<QuizResult> {
  return request<QuizResult>(`/topics/${encodeURIComponent(topic)}/history`)
}

// =========================================================================
// Mock Exam Mode ("Grill Me") API
// =========================================================================

export function getExamPresets(): Promise<{ presets: import('./types').ExamPreset[] }> {
  return request<{ presets: import('./types').ExamPreset[] }>('/exam/presets')
}

export function generateMockExam(opts: {
  subject?: string | null
  topic?: string | null
  durationMinutes?: number
  totalMarks?: number
  numQuestions?: number
  useWeakSpots?: boolean
  useHighYield?: boolean
  fastMode?: boolean
}): Promise<import('./types').MockExam> {
  return request<import('./types').MockExam>('/exam/generate', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      subject: opts.subject ?? null,
      topic: opts.topic ?? null,
      duration_minutes: opts.durationMinutes ?? 30,
      total_marks: opts.totalMarks ?? 50,
      num_questions: opts.numQuestions ?? 8,
      use_weak_spots: opts.useWeakSpots ?? false,
      use_high_yield: opts.useHighYield ?? false,
      fast_mode: opts.fastMode ?? false,
    }),
  })
}

export function submitMockExam(input: {
  examId: string
  subject?: string | null
  durationMinutes: number
  timeTakenSeconds: number
  answers: Record<string, string>
  questions: import('./types').MockExamQuestion[]
}): Promise<import('./types').MockExamResult> {
  return request<import('./types').MockExamResult>('/exam/submit', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      exam_id: input.examId,
      subject: input.subject ?? null,
      duration_minutes: input.durationMinutes,
      time_taken_seconds: input.timeTakenSeconds,
      answers: input.answers,
      questions: input.questions,
    }),
  })
}


export function getProgress(): Promise<ProgressSummary> {
  return request<ProgressSummary>('/progress')
}

export async function getTopics(): Promise<TopicStat[]> {
  const res = await request<{ topics: TopicStat[] }>('/topics')
  return res.topics
}

export async function getDocuments(): Promise<DocumentInfo[]> {
  const res = await request<{ documents: DocumentInfo[]; total_documents: number }>(
    '/documents'
  )
  return res.documents
}

export function deleteDocument(source: string): Promise<{ status: string; deleted_source: string }> {
  return request<{ status: string; deleted_source: string }>(`/documents/${encodeURIComponent(source)}`, {
    method: 'DELETE',
  })
}

export function deleteSubject(topic: string): Promise<{ status: string; deleted_subject: string }> {
  return request<{ status: string; deleted_subject: string }>(`/subjects/${encodeURIComponent(topic)}`, {
    method: 'DELETE',
  })
}

export function uploadNotes(
  files: File[],
  topic?: string
): Promise<UploadResponse> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const query = topic && topic.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : ''
  return request<UploadResponse>(`/upload${query}`, {
    method: 'POST',
    body: form,
  })
}

// =========================================================================
// Past Paper Analyzer API
// =========================================================================

export function uploadPastPapers(
  files: File[],
  topic?: string,
  year?: string
): Promise<import('./types').PastPaperUploadResponse> {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  const params = new URLSearchParams()
  if (topic && topic.trim()) params.append('topic', topic.trim())
  if (year && year.trim()) params.append('year', year.trim())
  const queryString = params.toString() ? `?${params.toString()}` : ''

  return request<import('./types').PastPaperUploadResponse>(`/past-papers/upload${queryString}`, {
    method: 'POST',
    body: form,
  })
}

export async function getPastPapers(subject?: string): Promise<{ papers: import('./types').PastPaper[]; total_papers: number; active_subject?: string }> {
  const query = subject && subject !== 'All' ? `?subject=${encodeURIComponent(subject)}` : ''
  return request<{ papers: import('./types').PastPaper[]; total_papers: number; active_subject?: string }>(`/past-papers${query}`)
}

export async function getPastPaperSubjects(): Promise<{ subjects: import('./types').PastPaperSubject[] }> {
  return request<{ subjects: import('./types').PastPaperSubject[] }>('/past-papers/subjects')
}

export function getPastPaper(paperId: number): Promise<import('./types').PastPaper> {
  return request<import('./types').PastPaper>(`/past-papers/${paperId}`)
}

export function deletePastPaper(paperId: number): Promise<{ status: string; deleted_paper_id: number }> {
  return request<{ status: string; deleted_paper_id: number }>(`/past-papers/${paperId}`, {
    method: 'DELETE',
  })
}

export function getPastPaperAnalysis(subject?: string): Promise<import('./types').PastPaperAnalysis> {
  const query = subject && subject !== 'All' ? `?subject=${encodeURIComponent(subject)}` : ''
  return request<import('./types').PastPaperAnalysis>(`/past-papers/analysis${query}`)
}

export function getPriorityMatrix(subject?: string): Promise<import('./types').PriorityMatrixResponse> {
  const query = subject && subject !== 'All' ? `?subject=${encodeURIComponent(subject)}` : ''
  return request<import('./types').PriorityMatrixResponse>(`/past-papers/priority-matrix${query}`)
}

export async function getPastPaperQuestions(opts?: {
  subject?: string
  topic?: string
  year?: string
  paperId?: number
  search?: string
  limit?: number
}): Promise<{ questions: import('./types').PastPaperQuestion[]; total_questions: number }> {
  const params = new URLSearchParams()
  if (opts?.subject && opts.subject !== 'All') params.append('subject', opts.subject)
  if (opts?.topic && opts.topic !== 'All') params.append('topic', opts.topic)
  if (opts?.year && opts.year !== 'All') params.append('year', opts.year)
  if (opts?.paperId !== undefined) params.append('paper_id', String(opts.paperId))
  if (opts?.search && opts.search.trim()) params.append('search', opts.search.trim())
  if (opts?.limit) params.append('limit', String(opts.limit))
  const queryString = params.toString() ? `?${params.toString()}` : ''

  return request<{ questions: import('./types').PastPaperQuestion[]; total_questions: number }>(
    `/past-papers/questions${queryString}`
  )
}

export function reanalyzePastPapers(): Promise<{ reanalyzed: any[]; total_papers: number }> {
  return request<{ reanalyzed: any[]; total_papers: number }>('/past-papers/reanalyze', {
    method: 'POST',
  })
}



