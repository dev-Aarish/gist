// Mirrors the Pydantic models in backend/. Keep in step with the API.

export interface Citation {
  source: string
  page: number
  topic?: string | null
  text_snippet: string
  score?: number | null
}

export interface AskResponse {
  answer: string
  sources: Citation[]
  model: string
  has_notes: boolean
}

export type QuestionType = 'mcq' | 'short_answer'

export interface QuizQuestion {
  id: string
  type: QuestionType
  question: string
  options: string[]
  correct_answer: string
  explanation: string
  topic: string
  source_file?: string | null
  source_page?: number | null
}

export interface Quiz {
  quiz_id: string
  topic: string
  questions: QuizQuestion[]
  created_at: string
  is_adaptive: boolean
}

export interface GradedQuestion {
  question_id: string
  question_text: string
  question_type: string
  user_answer: string
  correct_answer: string
  is_correct: boolean
  explanation: string
  topic: string
}

export interface QuizResult {
  quiz_id: string
  topic: string
  total_questions: number
  correct_count: number
  score_percentage: number
  graded_questions: GradedQuestion[]
  recorded_at: string
}

export type MasteryStatus = 'Unattempted' | 'Weak Spot' | 'Needs Review' | 'Mastered'

export interface TopicStat {
  topic: string
  total_questions: number
  correct_answers: number
  accuracy: number
  error_rate: number
  status: MasteryStatus
  priority_score: number
  last_attempted: string | null
}

export interface RecentQuiz {
  quiz_id: string
  topic: string
  total_questions: number
  correct_count: number
  score_percentage: number
  created_at: string
}

export interface ProgressSummary {
  total_quizzes_taken: number
  total_questions_answered: number
  overall_accuracy: number
  average_quiz_score: number
  mastered_topics_count: number
  needs_review_count: number
  weak_spots_count: number
  topics: TopicStat[]
  recent_quizzes: RecentQuiz[]
}

export interface DocumentInfo {
  source: string
  topic: string
  total_chunks: number
  page_count: number
}

export interface ModelInfo {
  name: string
  size_bytes?: number | null
  family?: string | null
}

export interface ModelsResponse {
  models: ModelInfo[]
  active_model: string
  fallback_model: string
}

export interface HealthStatus {
  status: string
  ollama_status: string
  models_available: string[]
  active_llm: string
  active_embedding: string
  sqlite_db: boolean
  chroma_dir: boolean
}

export interface UploadResultItem {
  source?: string
  filename?: string
  status: 'success' | 'warning' | 'error' | 'skipped'
  message?: string
  chunks_indexed?: number
  pages?: number
  topic?: string
}

export interface UploadResponse {
  results: UploadResultItem[]
  total_files: number
  message: string
}

export interface PastPaperQuestion {
  id: number
  paper_id: number
  question_number: string
  question_text: string
  topic: string
  subtopic?: string | null
  marks: number
  question_type: string
  created_at?: string
  filename?: string
  paper_title?: string
  paper_year?: string
}

export interface PastPaper {
  id: number
  filename: string
  title: string
  year: string | null
  subject: string | null
  total_questions: number
  total_marks: number
  uploaded_at: string
  questions?: PastPaperQuestion[]
}

export interface TopicSampleQuestion {
  question_number: string
  question_text: string
  marks: number
  year: string
  paper_title: string
}

export interface TopicAnalysisItem {
  topic: string
  question_count: number
  total_marks: number
  marks_percentage: number
  paper_occurrences: number
  paper_frequency_pct: number
  yield_rating: 'High Yield' | 'Medium Yield' | 'Low Yield'
  sample_questions: TopicSampleQuestion[]
}

export interface PastPaperSubject {
  subject: string
  paper_count: number
  question_count: number
  total_marks: number
  min_year?: string | null
  max_year?: string | null
}

export interface PastPaperAnalysis {
  active_subject?: string
  total_papers: number
  total_questions: number
  total_marks: number
  distinct_years: number
  topic_analysis: TopicAnalysisItem[]
  recent_papers: PastPaper[]
}

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'maintained' | 'low'

export interface PrioritizedTopic {
  topic: string
  exam_marks: number
  exam_marks_pct: number
  exam_frequency_pct: number
  exam_importance: number
  question_count: number
  quiz_attempts: number
  quiz_accuracy: number
  mastery_status: MasteryStatus
  priority_level: PriorityLevel
  priority_score: number
  recommendation: string
  sample_questions: TopicSampleQuestion[]
}

export interface PriorityMatrixResponse {
  active_subject?: string
  total_papers_analyzed: number
  total_past_questions: number
  high_yield_weak_spots_count: number
  critical_priority_count: number
  summary_insight: string
  prioritized_topics: PrioritizedTopic[]
}

export interface PastPaperUploadResultItem {
  filename: string
  status: 'success' | 'warning' | 'error' | 'skipped'
  message?: string
  paper_id?: number
  title?: string
  year?: string
  subject?: string
  total_questions?: number
  total_marks?: number
}

export interface PastPaperUploadResponse {
  results: PastPaperUploadResultItem[]
  total_files: number
  message: string
}

