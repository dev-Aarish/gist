import os
import shutil
import threading
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import settings, persist_selected_model
from backend.ingest import (
    ingest_pdf,
    list_indexed_documents,
    delete_document,
    delete_subject,
    reset_index,
    get_ollama_client,
    list_installed_models,
    resolve_installed_model,
    auto_select_models
)
from backend.rag import ask_question, AskResponse, stream_ask_question
from backend.quiz import (
    generate_quiz,
    grade_quiz_submission,
    Quiz,
    QuizSubmission,
    QuizResult
)
from backend.exam import (
    generate_mock_exam,
    grade_mock_exam_submission,
    MockExam,
    MockExamSubmission,
    MockExamResult
)
from backend.tracker import (
    init_db,
    get_progress_summary,
    get_topic_statistics,
    get_quiz_attempt_details,
    get_topic_history,
    reset_tracker,
    list_past_papers,
    get_past_paper,
    delete_past_paper,
    get_past_paper_questions,
    get_past_paper_analysis,
    get_priority_matrix,
    list_past_paper_subjects
)
from backend.analyzer import analyze_and_ingest_past_paper

# Initialize database on startup
init_db()

# Auto-detect best installed models if offline or defaults missing
auto_select_models()

app = FastAPI(
    title="Exam Buddy API",
    description="Offline, Private AI Study Partner powered by Local LLMs (Ollama)",
    version="1.0.0"
)


def warmup_models():
    """Background task to pre-load Ollama LLM and embedding models into memory."""
    try:
        auto_select_models()
        client = get_ollama_client()
        # Warm up main LLM model so it stays in RAM/VRAM
        client.chat(
            model=settings.llm_model,
            messages=[{"role": "user", "content": "hi"}],
            options={"num_predict": 1},
            keep_alive=settings.keep_alive
        )
        # Warm up embedding model
        client.embed(model=settings.embedding_model, input=["warmup"])
    except Exception as e:
        print(f"Model warm-up notice: {e}")





# Enable CORS for local dev frontends (Vite, React, Next, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request & Response Models
class AskRequest(BaseModel):
    question: str
    top_k: Optional[int] = Field(default=settings.top_k_retrieval, ge=1, le=15)
    topic: Optional[str] = None
    source: Optional[str] = None


class QuizGenerateRequest(BaseModel):
    topic: Optional[str] = None
    num_questions: int = Field(default=5, ge=1, le=20)
    use_weak_spots: bool = False
    use_high_yield: bool = False
    fast_mode: bool = False


class ExamGenerateRequest(BaseModel):
    subject: Optional[str] = None
    topic: Optional[str] = None
    duration_minutes: int = Field(default=30, ge=5, le=180)
    total_marks: float = Field(default=50.0, ge=10.0, le=200.0)
    num_questions: int = Field(default=8, ge=3, le=30)
    use_weak_spots: bool = False
    use_high_yield: bool = False
    fast_mode: bool = False




class UploadResponse(BaseModel):
    results: List[dict]
    total_files: int
    message: str


class PastPaperUploadResponse(BaseModel):
    results: List[dict]
    total_files: int
    message: str


class ModelInfo(BaseModel):
    name: str
    size_bytes: Optional[int] = None
    family: Optional[str] = None


class ModelsResponse(BaseModel):
    models: List[ModelInfo]
    active_model: str
    fallback_model: str


class SelectModelRequest(BaseModel):
    model: str


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/")
def root():
    return {
        "app": "Exam Buddy API",
        "status": "online",
        "docs": "/docs",
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model
    }


@app.get("/health")
def health_check():
    """Verify backend services, Ollama connection, and data directories."""
    ollama_status = "unknown"
    models_available = []
    try:
        auto_select_models()
        import ollama
        client = ollama.Client(host=settings.ollama_host)
        tags = client.list()
        # Handle dict or ListResponse
        models = getattr(tags, "models", []) if not isinstance(tags, dict) else tags.get("models", [])
        models_available = [
            getattr(m, "model", m.get("name") if isinstance(m, dict) else str(m))
            for m in models
        ]
        ollama_status = "connected"
    except Exception as e:
        ollama_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "ollama_status": ollama_status,
        "models_available": models_available,
        "active_llm": settings.llm_model,
        "active_embedding": settings.embedding_model,
        "sqlite_db": Path(settings.sqlite_db_path).exists(),
        "chroma_dir": Path(settings.chroma_persist_dir).exists()
    }


@app.post("/upload", response_model=UploadResponse)
async def upload_pdf_files(
    files: List[UploadFile] = File(...),
    topic: Optional[str] = None
):
    """
    Upload one or more PDF documents, parse per page with PyMuPDF,
    chunk, embed with Ollama, and store into ChromaDB.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    upload_results = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            upload_results.append({
                "filename": file.filename,
                "status": "skipped",
                "message": "Only PDF files are supported."
            })
            continue

        file_path = Path(settings.upload_dir) / file.filename
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Ingest into vector store
            ingest_res = ingest_pdf(file_path, topic=topic)
            upload_results.append(ingest_res)
        except Exception as e:
            upload_results.append({
                "filename": file.filename,
                "status": "error",
                "message": str(e)
            })

    return UploadResponse(
        results=upload_results,
        total_files=len(files),
        message="Upload and indexing completed."
    )


@app.get("/documents")
def get_documents():
    """List all indexed study documents with chunk counts and page counts."""
    docs = list_indexed_documents()
    return {
        "documents": docs,
        "total_documents": len(docs)
    }


@app.delete("/documents/{source}")
def delete_document_endpoint(source: str):
    """Delete a document by source filename."""
    success = delete_document(source)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete document from index.")
    return {"status": "success", "deleted_source": source}


@app.delete("/subjects/{topic}")
def delete_subject_endpoint(topic: str):
    """Delete all documents and tracking data for a specific subject/topic."""
    success = delete_subject(topic)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete subject from index.")
    return {"status": "success", "deleted_subject": topic}


@app.post("/ask", response_model=AskResponse)
def ask_question_endpoint(request: AskRequest):
    """
    Answer questions using strict grounding against uploaded notes,
    returning source file citations and page numbers.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        response = ask_question(
            question=request.question,
            top_k=request.top_k,
            topic=request.topic,
            source=request.source
        )
        return response
    except Exception as e:
        err_msg = str(e)
        if any(kw in err_msg.lower() for kw in ["connect", "connection", "refused", "offline", "unreachable"]):
            raise HTTPException(
                status_code=503,
                detail=f"Local LLM service (Ollama) is currently unreachable: {err_msg}. Please ensure Ollama is running ('ollama serve')."
            )
        raise HTTPException(status_code=500, detail=f"Failed to process question: {err_msg}")


@app.post("/ask/stream")
def ask_question_stream_endpoint(request: AskRequest):
    """
    Stream question answers via Server-Sent Events (SSE) for instant time-to-first-token.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    return StreamingResponse(
        stream_ask_question(
            question=request.question,
            top_k=request.top_k or settings.top_k_retrieval,
            topic=request.topic,
            source=request.source
        ),
        media_type="text/event-stream"
    )


@app.post("/warmup")
def warmup_endpoint():
    """Trigger background model warm-up on demand."""
    threading.Thread(target=warmup_models, daemon=True).start()
    return {"status": "started", "message": f"Pre-loading {settings.llm_model} into memory."}


@app.get("/models", response_model=ModelsResponse)
def get_models():
    """List the chat models installed in Ollama and which one is active."""
    try:
        auto_select_models()
        models = list_installed_models()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not reach Ollama: {str(e)}")

    return ModelsResponse(
        models=[ModelInfo(**m) for m in models],
        active_model=settings.llm_model,
        fallback_model=settings.fallback_model
    )


@app.post("/models/select", response_model=ModelsResponse)
def select_model(request: SelectModelRequest):
    """Switch the active model to an installed Ollama model and persist the choice."""
    requested = request.model.strip()
    if not requested:
        raise HTTPException(status_code=400, detail="Model name cannot be empty.")

    try:
        resolved = resolve_installed_model(requested)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not reach Ollama: {str(e)}")

    if not resolved:
        raise HTTPException(
            status_code=400,
            detail=f"'{requested}' is not installed in Ollama. Pull it first, then select it."
        )

    settings.llm_model = resolved
    persist_selected_model(resolved)

    # Pre-load the new model so the first question isn't slow.
    threading.Thread(target=warmup_models, daemon=True).start()

    models = list_installed_models()
    return ModelsResponse(
        models=[ModelInfo(**m) for m in models],
        active_model=settings.llm_model,
        fallback_model=settings.fallback_model
    )



@app.post("/quiz/generate", response_model=Quiz)
def generate_quiz_endpoint(request: QuizGenerateRequest):
    """
    Generate a Pydantic-validated JSON quiz from indexed notes or past paper questions.
    Supports targeting weak spots, high-yield exam priorities, fast mode, or specific topics.
    """
    try:
        quiz = generate_quiz(
            topic=request.topic,
            num_questions=request.num_questions,
            use_weak_spots=request.use_weak_spots,
            use_high_yield=request.use_high_yield,
            fast_mode=request.fast_mode
        )
        return quiz
    except ConnectionError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Local LLM service (Ollama) is currently unreachable: {str(e)}. Please ensure Ollama is running ('ollama serve')."
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if any(kw in err_msg.lower() for kw in ["connect", "connection", "refused", "offline", "unreachable"]):
            raise HTTPException(
                status_code=503,
                detail=f"Local LLM service (Ollama) is currently unreachable: {err_msg}. Please ensure Ollama is running ('ollama serve')."
            )
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {err_msg}")


@app.post("/quiz/submit", response_model=QuizResult)
def submit_quiz_endpoint(submission: QuizSubmission):
    """
    Submit quiz answers for automatic grading (MCQ + conceptual short answer),
    logging attempts and updating topic weak-spot mastery in SQLite.
    """
    try:
        result = grade_quiz_submission(submission)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to grade quiz submission: {str(e)}")


@app.get("/quiz/attempts/{quiz_id}", response_model=QuizResult)
def get_quiz_attempt_endpoint(quiz_id: str):
    """
    Retrieve graded question details, student answers, explanations, and scores
    for a specific past quiz attempt.
    """
    attempt = get_quiz_attempt_details(quiz_id)
    if not attempt:
        raise HTTPException(status_code=404, detail=f"Quiz attempt '{quiz_id}' not found.")
    return attempt


# =========================================================================
# Mock Exam ("Grill Me") Endpoints
# =========================================================================

@app.get("/exam/presets")
def get_exam_presets():
    """Return pre-configured mock exam tier templates."""
    return {
        "presets": [
            {
                "id": "sprint",
                "name": "Quick Grill",
                "tagline": "Rapid-fire precision check",
                "duration_minutes": 15,
                "total_marks": 25,
                "num_questions": 5,
                "description": "5 targeted questions covering core formulas, concepts, and definitions under 15 minutes."
            },
            {
                "id": "standard",
                "name": "Standard Mock",
                "tagline": "Midterm-depth balanced exam",
                "duration_minutes": 30,
                "total_marks": 50,
                "num_questions": 8,
                "description": "8 balanced questions spanning theory, problem-solving, and analysis across all uploaded topics."
            },
            {
                "id": "comprehensive",
                "name": "Finals Marathon",
                "tagline": "Full high-stakes examination simulation",
                "duration_minutes": 60,
                "total_marks": 100,
                "num_questions": 15,
                "description": "15 rigorous questions weighted across high-yield past paper topics and comprehensive theory."
            }
        ]
    }


@app.post("/exam/generate", response_model=MockExam)
def generate_mock_exam_endpoint(request: ExamGenerateRequest):
    """
    Generate a timed multi-topic mock examination with mark allocations.
    """
    try:
        exam = generate_mock_exam(
            subject=request.subject,
            topic=request.topic,
            duration_minutes=request.duration_minutes,
            total_marks=request.total_marks,
            num_questions=request.num_questions,
            use_weak_spots=request.use_weak_spots,
            use_high_yield=request.use_high_yield,
            fast_mode=request.fast_mode
        )
        return exam
    except ConnectionError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Local LLM service (Ollama) is currently unreachable: {str(e)}. Please ensure Ollama is running ('ollama serve')."
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if any(kw in err_msg.lower() for kw in ["connect", "connection", "refused", "offline", "unreachable"]):
            raise HTTPException(
                status_code=503,
                detail=f"Local LLM service (Ollama) is currently unreachable: {err_msg}. Please ensure Ollama is running ('ollama serve')."
            )
        raise HTTPException(status_code=500, detail=f"Failed to generate mock exam: {err_msg}")


@app.post("/exam/submit", response_model=MockExamResult)
def submit_mock_exam_endpoint(submission: MockExamSubmission):
    """
    Submit mock exam answers for rigorous automated grading (MCQs + conceptual/problem multi-mark evaluation),
    calculating individual question marks and generating a comprehensive score breakdown by topic.
    """
    try:
        result = grade_mock_exam_submission(submission)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to grade mock exam: {str(e)}")



@app.get("/progress")
def get_progress_dashboard():
    """
    Retrieve overall study statistics, topic mastery levels,
    weak-spot priorities, and recent quiz scores.
    """
    summary = get_progress_summary()
    return summary


@app.get("/topics")
def get_topics():
    """Get performance statistics for each individual topic."""
    topics = get_topic_statistics()
    return {"topics": topics}


@app.get("/topics/{topic}/history", response_model=QuizResult)
def get_topic_history_endpoint(topic: str):
    """
    Retrieve question logs, student answers, and examiner remarks for a specific topic.
    """
    history = get_topic_history(topic)
    if not history:
        raise HTTPException(status_code=404, detail=f"No quiz history found for topic '{topic}'.")
    return history


# =========================================================================
# Past Paper Analyzer Endpoints
# =========================================================================

@app.post("/past-papers/upload", response_model=PastPaperUploadResponse)
async def upload_past_papers_endpoint(
    files: List[UploadFile] = File(...),
    topic: Optional[str] = None,
    year: Optional[str] = None
):
    """
    Upload previous years' question papers (PDF), extract questions,
    tag by topic/subtopic, detect marks, and save into SQLite and ChromaDB.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No past paper files uploaded.")

    upload_results = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            upload_results.append({
                "filename": file.filename,
                "status": "skipped",
                "message": "Only PDF question papers are supported."
            })
            continue

        file_path = Path(settings.upload_dir) / file.filename
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Analyze and extract questions
            analysis_res = analyze_and_ingest_past_paper(
                pdf_path=file_path,
                topic=topic,
                year=year
            )

            # Index into ChromaDB in background thread so upload response returns immediately
            def _async_chroma_ingest(fpath: Path, top: str):
                try:
                    ingest_pdf(fpath, topic=top)
                except Exception as ex:
                    print(f"Async ChromaDB ingest note: {ex}")

            threading.Thread(
                target=_async_chroma_ingest,
                args=(file_path, topic or analysis_res.get("subject") or "Past Papers"),
                daemon=True
            ).start()

            upload_results.append({
                "filename": file.filename,
                "status": "success",
                "paper_id": analysis_res["paper_id"],
                "title": analysis_res["title"],
                "year": analysis_res["year"],
                "subject": analysis_res["subject"],
                "total_questions": analysis_res["total_questions"],
                "total_marks": analysis_res["total_marks"]
            })
        except Exception as e:
            upload_results.append({
                "filename": file.filename,
                "status": "error",
                "message": str(e)
            })

    return PastPaperUploadResponse(
        results=upload_results,
        total_files=len(files),
        message="Past papers analyzed and questions extracted successfully."
    )


@app.get("/past-papers")
def get_past_papers_endpoint(subject: Optional[str] = None):
    """List all analyzed previous years' question papers, optionally filtered by subject."""
    papers = list_past_papers(subject=subject)
    return {
        "papers": papers,
        "total_papers": len(papers),
        "active_subject": subject or "All"
    }


@app.get("/past-papers/subjects")
def get_past_paper_subjects_endpoint():
    """List distinct subjects across all uploaded question papers with counts."""
    subjects = list_past_paper_subjects()
    return {"subjects": subjects}


@app.get("/past-papers/analysis")
def get_past_papers_analysis_endpoint(subject: Optional[str] = None):
    """
    Retrieve aggregated topic frequency, marks distribution,
    and yield ratings across uploaded past papers, optionally segregated by subject.
    """
    analysis = get_past_paper_analysis(subject=subject)
    return analysis


@app.get("/past-papers/priority-matrix")
def get_past_papers_priority_matrix_endpoint(subject: Optional[str] = None):
    """
    Retrieve the combined Exam Priority Matrix:
    Prioritizes topics that are BOTH high-yield in past papers and weak in quiz tracker.
    Supports subject segregation.
    """
    matrix = get_priority_matrix(subject=subject)
    return matrix


@app.get("/past-papers/questions")
def get_past_paper_questions_endpoint(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    year: Optional[str] = None,
    paper_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500)
):
    """Retrieve browsable past paper questions with subject, topic, marks, and text filters."""
    questions = get_past_paper_questions(
        subject=subject,
        topic=topic,
        year=year,
        paper_id=paper_id,
        search=search,
        limit=limit
    )
    return {
        "questions": questions,
        "total_questions": len(questions)
    }


@app.get("/past-papers/{paper_id}")
def get_past_paper_detail_endpoint(paper_id: int):
    """Retrieve details and extracted questions for a single past paper."""
    paper = get_past_paper(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Past paper not found.")
    return paper


@app.delete("/past-papers/{paper_id}")
def delete_past_paper_endpoint(paper_id: int):
    """Delete a past paper and its questions."""
    success = delete_past_paper(paper_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete past paper.")
    return {"status": "success", "deleted_paper_id": paper_id}


@app.post("/past-papers/reanalyze")
def reanalyze_past_papers_endpoint():
    """Re-analyze all uploaded question papers and refresh topic tags and marks."""
    try:
        from backend.analyzer import reanalyze_all_uploaded_papers
        res = reanalyze_all_uploaded_papers()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reanalyze past papers: {str(e)}")


@app.post("/reset")
def reset_all_data(
    reset_vector_db: bool = Query(default=True),
    reset_tracking: bool = Query(default=False),
    reset_past_papers: bool = Query(default=False)
):
    """Reset ChromaDB index, SQLite quiz tracking history, and/or past papers."""
    chroma_reset = False
    tracker_reset = False

    if reset_vector_db:
        chroma_reset = reset_index()
    if reset_tracking or reset_past_papers:
        tracker_reset = reset_tracker(include_past_papers=reset_past_papers)

    return {
        "status": "success",
        "chroma_reset": chroma_reset,
        "tracker_reset": tracker_reset
    }
