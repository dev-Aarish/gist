import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderPlus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteDocument, deleteSubject, uploadNotes } from '../lib/api'
import { pluralize } from '../lib/format'
import type { DocumentInfo, UploadResultItem } from '../lib/types'
import { BackendNotice } from '../components/BackendNotice'
import { EmptyState } from '../components/EmptyState'

const CUSTOM_SUBJECTS_KEY = 'gist_custom_subjects_v1'

export function NotesScreen({
  documents,
  loading,
  offline,
  offlineMessage,
  onRetry,
  onDocumentsChanged,
}: {
  documents: DocumentInfo[]
  loading: boolean
  offline: boolean
  offlineMessage: string | null
  onRetry: () => void
  onDocumentsChanged: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResultItem[]>([])
  const [failures, setFailures] = useState<string[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [isCreatingSubject, setIsCreatingSubject] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [targetSubjectForUpload, setTargetSubjectForUpload] = useState<string | null>(null)

  const [customSubjects, setCustomSubjects] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_SUBJECTS_KEY)
      if (saved) return JSON.parse(saved) as string[]
    } catch {
      // ignore
    }
    return []
  })

  const fileRef = useRef<HTMLInputElement>(null)
  const subjectFileInputRef = useRef<HTMLInputElement>(null)

  // Save custom subjects
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(customSubjects))
    } catch {
      // ignore
    }
  }, [customSubjects])

  // Aggregate all unique subjects (from indexed documents + custom subjects)
  const allSubjects = useMemo(() => {
    const list: string[] = []
    for (const doc of documents) {
      const t = doc.topic?.trim() || 'General'
      if (!list.includes(t)) list.push(t)
    }
    for (const sub of customSubjects) {
      if (sub && !list.includes(sub)) list.push(sub)
    }
    return list
  }, [documents, customSubjects])

  // Group documents by subject
  const subjectGroups = useMemo(() => {
    const groups: {
      name: string
      documents: DocumentInfo[]
      totalPages: number
      totalChunks: number
    }[] = []

    for (const subjectName of allSubjects) {
      const docs = documents.filter((d) => (d.topic?.trim() || 'General') === subjectName)
      const totalPages = docs.reduce((sum, d) => sum + d.page_count, 0)
      const totalChunks = docs.reduce((sum, d) => sum + d.total_chunks, 0)
      groups.push({
        name: subjectName,
        documents: docs,
        totalPages,
        totalChunks,
      })
    }
    return groups
  }, [allSubjects, documents])

  const totalPages = documents.reduce((sum, doc) => sum + doc.page_count, 0)

  async function handleFiles(files: FileList | null, overrideTopic?: string) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setUploading(true)
    setResults([])
    setFailures([])
    const topicToUse = (overrideTopic ?? selectedSubject).trim()
    try {
      const response = await uploadNotes(list, topicToUse)
      setResults(response.results)
      if (topicToUse && !customSubjects.includes(topicToUse)) {
        setCustomSubjects((prev) => [...prev, topicToUse])
      }
      onDocumentsChanged()
    } catch (err) {
      setFailures([
        err instanceof Error ? err.message : 'Couldn’t upload those files.',
      ])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      if (subjectFileInputRef.current) subjectFileInputRef.current.value = ''
      setTargetSubjectForUpload(null)
    }
  }

  function handleCreateSubject() {
    const clean = newSubjectName.trim()
    if (!clean) return
    if (!customSubjects.includes(clean)) {
      setCustomSubjects((prev) => [...prev, clean])
      setSelectedSubject(clean)
    }
    setNewSubjectName('')
    setIsCreatingSubject(false)
  }

  async function handleDeleteDoc(source: string) {
    try {
      await deleteDocument(source)
      onDocumentsChanged()
    } catch (err) {
      setFailures([err instanceof Error ? err.message : 'Failed to delete file.'])
    }
  }

  async function handleDeleteSubject(subjectName: string) {
    try {
      await deleteSubject(subjectName)
      setCustomSubjects((prev) => prev.filter((s) => s !== subjectName))
      if (selectedSubject === subjectName) setSelectedSubject('')
      onDocumentsChanged()
    } catch (err) {
      setFailures([err instanceof Error ? err.message : 'Failed to delete subject.'])
    }
  }

  function triggerUploadForSubject(subjectName: string) {
    setTargetSubjectForUpload(subjectName)
    subjectFileInputRef.current?.click()
  }

  return (
    <div className="screen screen--wide">
      <header className="page-head">
        <div className="page-head__meta">
          <h1 className="t-h1">Your material</h1>
          <span className="t-small t-muted">
            Organize study material into subjects to test & ask with precise context.
          </span>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setIsCreatingSubject((v) => !v)}
          >
            <FolderPlus size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{isCreatingSubject ? 'Cancel' : 'New subject'}</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Refresh notes"
            title="Refresh notes"
            onClick={onDocumentsChanged}
          >
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>

      {isCreatingSubject ? (
        <form
          className="subject-creator"
          onSubmit={(e) => {
            e.preventDefault()
            handleCreateSubject()
          }}
        >
          <input
            className="subject-creator__input"
            value={newSubjectName}
            placeholder="Subject name (e.g. Operating Systems, Networks, Biology)"
            autoFocus
            onChange={(e) => setNewSubjectName(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={!newSubjectName.trim()}
          >
            <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
            Create
          </button>
        </form>
      ) : null}

      <section className="section">
        <div className="toolbar" style={{ alignItems: 'flex-end', gap: 'var(--space-3)' }}>
          <div className="field" style={{ minWidth: 240, maxWidth: 320 }}>
            <label className="t-label" htmlFor="subject-select">
              Subject category
            </label>
            <div className="select-wrap">
              <select
                id="subject-select"
                className="select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              >
                <option value="">Choose or create a subject…</option>
                {allSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`drop${dragOver ? ' drop--over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            void handleFiles(event.dataTransfer.files)
          }}
        >
          <span className="empty__mark" aria-hidden="true">
            <Upload size={20} strokeWidth={1.5} />
          </span>
          <span className="t-h3">
            {selectedSubject ? `Drop PDFs into "${selectedSubject}"` : 'Drop PDFs here, or choose files'}
          </span>
          <span className="t-small t-muted">
            Text-based PDFs only. Notes will be indexed into the selected subject category.
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void handleFiles(event.target.files)}
        />

        <input
          ref={subjectFileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void handleFiles(event.target.files, targetSubjectForUpload ?? undefined)}
        />

        {uploading ? (
          <div>
            <div className="iline">
              <span className="iline__bar" />
            </div>
            <p className="t-small t-muted" style={{ marginTop: 'var(--space-3)' }}>
              Splitting, embedding and indexing into subject catalog…
            </p>
          </div>
        ) : null}

        {failures.map((message) => (
          <div className="notice notice--danger" role="alert" key={message}>
            <AlertTriangle
              className="notice__icon"
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p>{message}</p>
          </div>
        ))}

        {results.map((result, index) => {
          const ok = result.status === 'success'
          const name = result.source ?? result.filename ?? 'file'
          return (
            <div
              className={`notice${ok ? ' notice--success' : ''}`}
              key={`${name}-${index}`}
              role={ok ? 'status' : 'alert'}
            >
              {ok ? (
                <CheckCircle2
                  className="notice__icon"
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="notice__icon"
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              )}
              <p>
                {ok
                  ? `Indexed ${name} into [${result.topic ?? 'General'}] — ${result.pages ?? 0} ${pluralize(
                      result.pages ?? 0,
                      'page'
                    )}, ${result.chunks_indexed ?? 0} chunks.`
                  : `${name}: ${result.message ?? 'couldn’t be indexed.'}`}
              </p>
            </div>
          )
        })}

        {offline ? (
          <BackendNotice message={offlineMessage} onRetry={onRetry} />
        ) : null}
      </section>

      <section className="section">
        <div className="eyebrow">
          <span className="t-label">
            Categorized Subjects
            {documents.length > 0
              ? ` · ${documents.length} ${pluralize(documents.length, 'file')} · ${totalPages} ${pluralize(
                  totalPages,
                  'page'
                )}`
              : ''}
          </span>
        </div>

        {offline ? null : loading && documents.length === 0 ? (
          <span className="skel skel--line skel--wide" />
        ) : subjectGroups.length === 0 ? (
          <div className="panel">
            <EmptyState icon={FileText} title="No subjects or notes yet">
              Click &quot;New subject&quot; or upload a PDF above to create your first category.
            </EmptyState>
          </div>
        ) : (
          <div className="subjects-grid">
            {subjectGroups.map((group) => (
              <div className="subject-card" key={group.name}>
                <div className="subject-card__header">
                  <div className="subject-card__title-wrap">
                    <span className="subject-card__title">{group.name}</span>
                    <span className="subject-card__count">
                      {group.documents.length} {pluralize(group.documents.length, 'file')} · {group.totalPages}{' '}
                      {pluralize(group.totalPages, 'page')}
                    </span>
                  </div>
                  <div className="subject-card__actions">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => triggerUploadForSubject(group.name)}
                      title={`Upload PDF into ${group.name}`}
                    >
                      <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                      <span>Add PDF</span>
                    </button>
                    <button
                      type="button"
                      className="doc__del"
                      aria-label={`Delete subject ${group.name}`}
                      title={`Delete subject ${group.name}`}
                      onClick={() => void handleDeleteSubject(group.name)}
                    >
                      <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="subject-card__body">
                  {group.documents.length === 0 ? (
                    <div className="subject-card__empty">
                      <span className="t-small t-muted">
                        No files in this subject yet.
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => triggerUploadForSubject(group.name)}
                      >
                        Upload first PDF
                      </button>
                    </div>
                  ) : (
                    <div>
                      {group.documents.map((doc) => (
                        <div className="doc" key={doc.source}>
                          <span className="doc__icon" aria-hidden="true">
                            <FileText size={16} strokeWidth={1.5} />
                          </span>
                          <span className="doc__body">
                            <span className="doc__name">{doc.source}</span>
                            <span className="doc__meta">
                              {doc.page_count} {pluralize(doc.page_count, 'page')} · {doc.total_chunks} chunks
                            </span>
                          </span>
                          <div className="doc__actions">
                            <button
                              type="button"
                              className="doc__del"
                              aria-label={`Delete ${doc.source}`}
                              title="Delete file"
                              onClick={() => void handleDeleteDoc(doc.source)}
                            >
                              <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
