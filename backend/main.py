import os
import shutil
import threading
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import settings
from backend.ingest import (
    ingest_pdf,
    list_indexed_documents,
    delete_document,
    delete_subject,
    reset_index,
    get_ollama_client
)
from backend.rag import ask_question, AskResponse, stream_ask_question
from backend.quiz import (
    generate_quiz,
    grade_quiz_submission,
    Quiz,
    QuizSubmission,
    QuizResult
)
from backend.tracker import (
    init_db,
    get_progress_summary,
    get_topic_statistics,
    reset_tracker
)

# Initialize database on startup
init_db()

app = FastAPI(
    title="Exam Buddy API",
    description="Offline, Private AI Study Partner powered by Local LLMs (Ollama)",
    version="1.0.0"
)


def warmup_models():
    """Background task to pre-load Ollama LLM and embedding models into memory."""
    try:
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


class QuizGenerateRequest(BaseModel):
    topic: Optional[str] = None
    num_questions: int = Field(default=5, ge=1, le=10)
    use_weak_spots: bool = False


class UploadResponse(BaseModel):
    results: List[dict]
    total_files: int
    message: str


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
            topic=request.topic
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process question: {str(e)}")


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
            topic=request.topic
        ),
        media_type="text/event-stream"
    )


@app.post("/warmup")
def warmup_endpoint():
    """Trigger background model warm-up on demand."""
    threading.Thread(target=warmup_models, daemon=True).start()
    return {"status": "started", "message": f"Pre-loading {settings.llm_model} into memory."}



@app.post("/quiz/generate", response_model=Quiz)
def generate_quiz_endpoint(request: QuizGenerateRequest):
    """
    Generate a Pydantic-validated JSON quiz from indexed notes.
    Supports targeting weak spots or specific topics.
    """
    try:
        quiz = generate_quiz(
            topic=request.topic,
            num_questions=request.num_questions,
            use_weak_spots=request.use_weak_spots
        )
        return quiz
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate quiz: {str(e)}")


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


@app.post("/reset")
def reset_all_data(
    reset_vector_db: bool = Query(default=True),
    reset_tracking: bool = Query(default=False)
):
    """Reset ChromaDB index and/or SQLite quiz tracking history."""
    chroma_reset = False
    tracker_reset = False

    if reset_vector_db:
        chroma_reset = reset_index()
    if reset_tracking:
        tracker_reset = reset_tracker()

    return {
        "status": "success",
        "chroma_reset": chroma_reset,
        "tracker_reset": tracker_reset
    }
