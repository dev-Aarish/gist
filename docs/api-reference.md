# API Reference

Complete technical specification for the Gist FastAPI REST backend.

---

## Overview

- **Base URL**: `http://localhost:8000`
- **Interactive Documentation**: Swagger UI at `http://localhost:8000/docs`, ReDoc at `http://localhost:8000/redoc`.
- **Content Types**: `application/json`, `multipart/form-data`, `text/event-stream`.

---

## 1. System & Runtime Management

### `GET /`
Returns basic app information and active model names.

- **Response `200 OK`**:
  ```json
  {
    "app": "Exam Buddy API",
    "status": "online",
    "docs": "/docs",
    "llm_model": "qwen2.5:7b",
    "embedding_model": "nomic-embed-text:latest"
  }
  ```

---

### `GET /health`
Verifies system health, backend readiness, local storage access, and Ollama connection status.

- **Response `200 OK`**:
  ```json
  {
    "status": "healthy",
    "ollama_status": "connected",
    "models_available": ["qwen2.5:7b", "nomic-embed-text:latest"],
    "active_llm": "qwen2.5:7b",
    "embedding_model": "nomic-embed-text:latest",
    "data_directory": "/path/to/data",
    "vector_store_exists": true
  }
  ```

---

### `GET /models`
Lists all local Ollama models installed on the system and identifies active/fallback models.

- **Response `200 OK`**:
  ```json
  {
    "models": [
      {
        "name": "qwen2.5:7b",
        "size_bytes": 4700000000,
        "family": "qwen2"
      }
    ],
    "active_model": "qwen2.5:7b",
    "fallback_model": "llama3.2:3b"
  }
  ```

---

### `POST /models/select`
Switches the active chat LLM model to an installed model.

- **Request Body**:
  ```json
  {
    "model": "llama3.2:3b"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "active_model": "llama3.2:3b",
    "message": "Active model updated successfully."
  }
  ```
- **Error `400 Bad Request`**: Returned if the target model is not pulled in Ollama.

---

### `POST /warmup`
Asynchronously pre-loads LLM and embedding models into VRAM/RAM to prevent initial query cold-start latency.

- **Response `200 OK`**:
  ```json
  {
    "status": "warming_up",
    "message": "Model warm-up initiated in background."
  }
  ```

---

## 2. Document Ingestion & Storage

### `POST /upload`
Uploads one or more PDF files, splits them into page-aware text chunks, generates vector embeddings, and stores them in ChromaDB.

- **Request Format**: `multipart/form-data`
  - `files`: File payload (one or multiple `.pdf` files).
  - `topic`: *(Optional)* Topic/subject label to group documents.
- **Response `200 OK`**:
  ```json
  {
    "results": [
      {
        "filename": "chapter1.pdf",
        "status": "indexed",
        "chunks": 24,
        "pages": 12,
        "topic": "Biology"
      }
    ],
    "total_files": 1,
    "message": "Uploaded and processed 1 file(s)."
  }
  ```

---

### `GET /documents`
Lists all currently indexed documents in ChromaDB with metadata.

- **Response `200 OK`**:
  ```json
  [
    {
      "source": "chapter1.pdf",
      "topic": "Biology",
      "chunks": 24,
      "pages": 12
    }
  ]
  ```

---

### `DELETE /documents/{source}`
Deletes all vector chunks associated with a specific PDF source file.

- **Path Parameters**: `source` (string) — Filename (e.g., `chapter1.pdf`).
- **Response `200 OK`**:
  ```json
  {
    "status": "deleted",
    "source": "chapter1.pdf"
  }
  ```

---

### `DELETE /subjects/{topic}`
Deletes all document chunks and quiz tracking records for an entire subject/topic.

- **Path Parameters**: `topic` (string) — Subject name (e.g., `Biology`).
- **Response `200 OK`**:
  ```json
  {
    "status": "deleted",
    "topic": "Biology"
  }
  ```

---

## 3. Grounded Q&A

### `POST /ask`
Executes a synchronous similarity search against indexed document chunks and generates a grounded response.

- **Request Body**:
  ```json
  {
    "question": "What is photosynthesizing?",
    "top_k": 3,
    "topic": "Biology",
    "source": "chapter1.pdf"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "answer": "Photosynthesis is the process by which plants...",
    "sources": [
      {
        "source": "chapter1.pdf",
        "page": 4,
        "content_snippet": "Plants synthesize nutrients from carbon dioxide..."
      }
    ],
    "model_used": "qwen2.5:7b"
  }
  ```

---

### `POST /ask/stream`
Streams answer tokens in real-time as Server-Sent Events (`text/event-stream`).

- **Request Body**: Same JSON schema as `POST /ask`.
- **Stream Format**:
  - `data: {"token": "Photo"}`
  - `data: {"token": "synthesis"}`
  - `data: {"sources": [{"source": "chapter1.pdf", "page": 4}]}`
  - `data: [DONE]`

---

## 4. Adaptive Quizzes & Mastery Tracking

### `POST /quiz/generate`
Generates a structured quiz based on document context or weak spots.

- **Request Body**:
  ```json
  {
    "topic": "Biology",
    "num_questions": 5,
    "use_weak_spots": true
  }
  ```
- **Response `200 OK`**: Returns a list of generated multiple-choice and short-answer questions.

---

### `POST /quiz/submit`
Evaluates student quiz answers, grades short-answer responses via LLM, and updates topic mastery in SQLite.

- **Request Body**: Payload containing user answers.
- **Response `200 OK`**: Returns graded results, explanations, overall percentage score, and updated topic mastery metrics.

---

### `GET /progress`
Retrieves overall study progress, average scores, and identified weak spot topics.

- **Response `200 OK`**:
  ```json
  {
    "overall_mastery": 0.82,
    "quizzes_taken": 14,
    "weak_spots": ["Organic Chemistry"],
    "recent_scores": [80.0, 90.0, 75.0]
  }
  ```

---

### `GET /topics`
Retrieves detailed breakdown of scores, attempt counts, and mastery per topic.

---

### `POST /reset`
Resets system databases based on query parameters.

- **Query Parameters**:
  - `reset_vector_db` (boolean, default `true`): Deletes vector index.
  - `reset_tracking` (boolean, default `false`): Wipes SQLite mastery logs.
  - `reset_past_papers` (boolean, default `false`): Deletes extracted past papers and questions.

---

## 5. Past-Paper Analyzer & Priority Matrix

### `POST /past-papers/upload`
Uploads previous years' question papers (PDF), extracts questions, classifies them by academic topic/concept, extracts marks weightages, and stores them in SQLite and ChromaDB.

- **Form Data**:
  - `files`: PDF file(s)
  - `topic` (optional): General course / subject name
  - `year` (optional): Exam year (e.g., "2023", "2024")
- **Response `200 OK`**:
  ```json
  {
    "results": [
      {
        "filename": "DBMS_2023_Final.pdf",
        "status": "success",
        "paper_id": 1,
        "title": "Database Management Systems Final Exam",
        "year": "2023",
        "subject": "DBMS",
        "total_questions": 9,
        "total_marks": 100.0
      }
    ],
    "total_files": 1,
    "message": "Past papers analyzed and questions extracted successfully."
  }
  ```

---

### `GET /past-papers`
Lists all uploaded and analyzed previous years' question papers.

---

### `GET /past-papers/{paper_id}`
Returns full details and all extracted questions for a specific past paper.

---

### `DELETE /past-papers/{paper_id}`
Deletes a past paper and all its associated questions from SQLite.

---

### `GET /past-papers/analysis`
Aggregates past paper data to reveal:
- **Topic Frequency**: How often each topic appears across past exams.
- **Marks Weightage**: Total marks and percentage contribution of each topic.
- **Yield Ratings**: High Yield vs Medium Yield vs Low Yield categories.

---

### `GET /past-papers/priority-matrix`
**The Core High-Yield Priority Engine**: Cross-references past paper topic weightage with the student's quiz performance history to identify and prioritize topics that are **BOTH high-yield in exams and weak in quizzes**.

- **Response `200 OK`**:
  ```json
  {
    "total_papers_analyzed": 3,
    "total_past_questions": 28,
    "high_yield_weak_spots_count": 2,
    "critical_priority_count": 1,
    "summary_insight": "Found 1 critical high-yield topic where past exams ask heavy marks but your quiz mastery is low.",
    "prioritized_topics": [
      {
        "topic": "Normalization",
        "exam_marks": 35.0,
        "exam_marks_pct": 25.0,
        "exam_frequency_pct": 100.0,
        "exam_importance": 35.0,
        "question_count": 6,
        "quiz_attempts": 4,
        "quiz_accuracy": 25.0,
        "mastery_status": "Weak Spot",
        "priority_level": "critical",
        "priority_score": 76.8,
        "recommendation": "Critical Priority. Worth ~25% of exam marks with only 25% accuracy. Needs immediate study."
      }
    ]
  }
  ```

---

### `GET /past-papers/questions`
Search and filter extracted past paper questions by topic, year, paper ID, or keyword query.

