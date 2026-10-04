# API Reference

Complete technical specification for the Gist FastAPI REST and SSE backend.

---

## Overview

- **Base URL**: `http://localhost:8000`
- **Interactive Documentation**: Swagger UI at `http://localhost:8000/docs`, ReDoc at `http://localhost:8000/redoc`.
- **Supported Content Types**: `application/json`, `multipart/form-data`, `text/event-stream`.

---

## 1. System & Runtime Management

### `GET /`
Returns basic service information, active chat model, and active embedding model.

- **Response `200 OK`**:
  ```json
  {
    "app": "Exam Buddy API",
    "status": "online",
    "docs": "/docs",
    "llm_model": "gemma2:9b",
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
    "models_available": ["gemma2:9b", "gemma2:2b", "nomic-embed-text:latest"],
    "active_llm": "gemma2:9b",
    "embedding_model": "nomic-embed-text:latest",
    "data_directory": "/path/to/data",
    "vector_store_exists": true
  }
  ```

---

### `GET /models`
Lists all local Ollama chat models installed on the system, filtering out embedding-only models.

- **Response `200 OK`**:
  ```json
  {
    "models": [
      {
        "name": "gemma2:9b",
        "size_bytes": 5400000000,
        "family": "gemma2"
      },
      {
        "name": "gemma2:2b",
        "size_bytes": 1600000000,
        "family": "gemma2"
      }
    ],
    "active_model": "gemma2:9b",
    "fallback_model": "llama3.2:3b"
  }
  ```

---

### `POST /models/select`
Switches the active chat model to any installed Ollama model and persists the choice across restarts.

- **Request Body**:
  ```json
  {
    "model": "gemma2:2b"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "status": "success",
    "active_model": "gemma2:2b",
    "message": "Active model updated successfully."
  }
  ```
- **Error `400 Bad Request`**: Returned if the requested model is not installed in the local Ollama runtime.

---

### `POST /warmup`
Asynchronously pre-loads the active chat and embedding models into memory to prevent first-request cold-start latency.

- **Response `200 OK`**:
  ```json
  {
    "status": "warming_up",
    "message": "Model warm-up initiated in background."
  }
  ```

---

## 2. Course Material & Document Ingestion

### `POST /upload`
Uploads one or more PDF study documents, extracts text page-by-page, generates vector embeddings, and stores them in ChromaDB.

- **Request Format**: `multipart/form-data`
  - `files`: File payload (one or multiple `.pdf` files).
  - `topic`: Optional course or subject name.
- **Response `200 OK`**:
  ```json
  {
    "results": [
      {
        "filename": "DBMS_Lecture1.pdf",
        "status": "indexed",
        "chunks": 28,
        "pages": 14,
        "topic": "DBMS"
      }
    ],
    "total_files": 1,
    "message": "Uploaded and processed 1 file(s)."
  }
  ```

---

### `GET /documents`
Lists all currently indexed study materials in ChromaDB with metadata.

- **Response `200 OK`**:
  ```json
  [
    {
      "source": "DBMS_Lecture1.pdf",
      "topic": "DBMS",
      "chunks": 28,
      "pages": 14
    }
  ]
  ```

---

### `DELETE /documents/{source}`
Deletes all vector chunks associated with a specific PDF source file.

- **Path Parameters**: `source` (string) — Filename (for example, `DBMS_Lecture1.pdf`).
- **Response `200 OK`**:
  ```json
  {
    "status": "deleted",
    "source": "DBMS_Lecture1.pdf"
  }
  ```

---

### `DELETE /subjects/{topic}`
Deletes all document vector chunks and quiz tracking records associated with a subject.

- **Path Parameters**: `topic` (string) — Subject name (for example, `DBMS`).
- **Response `200 OK`**:
  ```json
  {
    "status": "deleted",
    "topic": "DBMS"
  }
  ```

---

## 3. Grounded Q&A

### `POST /ask`
Performs a synchronous semantic search against indexed documents and generates a grounded answer with page citations.

- **Request Body**:
  ```json
  {
    "question": "What is the third normal form?",
    "top_k": 3,
    "topic": "DBMS",
    "source": "DBMS_Lecture1.pdf"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "answer": "Third Normal Form (3NF) requires a relation to be in 2NF and have no transitive dependencies...",
    "sources": [
      {
        "source": "DBMS_Lecture1.pdf",
        "page": 12,
        "content_snippet": "A relation is in 3NF if there is no transitive dependency for non-prime attributes..."
      }
    ],
    "model_used": "gemma2:9b"
  }
  ```

---

### `POST /ask/stream`
Streams answer tokens in real-time as Server-Sent Events (`text/event-stream`). Accepts the same JSON body as `POST /ask`.

- **Stream Format**:
  - `data: {"token": "Third"}`
  - `data: {"token": " Normal"}`
  - `data: {"sources": [{"source": "DBMS_Lecture1.pdf", "page": 12}]}`
  - `data: [DONE]`

---

## 4. Adaptive Quizzes & Mastery Tracking

### `POST /quiz/generate`
Generates a structured quiz containing multiple-choice and short-answer questions.

- **Request Body**:
  ```json
  {
    "topic": "DBMS",
    "num_questions": 5,
    "use_weak_spots": true,
    "use_high_yield": true,
    "fast_mode": false
  }
  ```
- **Parameters**:
  - `topic`: Target subject or concept area.
  - `num_questions`: Number of questions to generate (1 to 20, default: 5).
  - `use_weak_spots`: When true, pulls concepts where quiz accuracy is below 70%.
  - `use_high_yield`: When true, prioritizes concepts identified as high-yield in the Past-Paper Priority Matrix.
  - `fast_mode`: When true, fetches archived past exam questions instantly (<100ms) without LLM authoring.
- **Response `200 OK`**: Returns structured questions with answer options and evaluation rubrics.

---

### `POST /quiz/submit`
Evaluates student quiz answers, grades short-answer responses via the active LLM, and updates rolling mastery in SQLite.

- **Request Body**: Payload containing question identifiers and student responses.
- **Response `200 OK`**: Returns score percentages, itemized explanations, and updated topic mastery metrics.

---

### `GET /quiz/attempts/{quiz_id}`
Retrieves graded question details, student answers, explanations, and scores for a specific past quiz attempt.

- **Path Parameters**: `quiz_id` (string).
- **Response `200 OK`**: Full `QuizResult` object for historical review.

---

### `GET /progress`
Retrieves aggregated student metrics, overall mastery percentage, recent scores, and weak spots.

---

### `GET /topics`
Retrieves detailed attempt counts, correct answer ratios, and mastery scores per topic.

---

### `GET /topics/{topic}/history`
Retrieves all historical questions, student answers, and grading remarks asked under a specific topic.

- **Path Parameters**: `topic` (string).
- **Response `200 OK`**: Full `QuizResult` payload containing all question logs for that topic.

---

### `POST /reset`
Performs granular database resets.

- **Query Parameters**:
  - `reset_vector_db` (boolean, default: `true`): Clears ChromaDB vector embeddings.
  - `reset_tracking` (boolean, default: `false`): Wipes quiz history and mastery logs.
  - `reset_past_papers` (boolean, default: `false`): Deletes past exam papers and question records.

---

## 5. Mock Exam Simulator ("Grill Me" Mode)

### `GET /exam/presets`
Returns pre-configured mock exam tier templates.

- **Response `200 OK`**:
  ```json
  {
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
  ```

---

### `POST /exam/generate`
Generates a timed multi-topic mock examination with mark allocations.

- **Request Body**:
  ```json
  {
    "subject": "DBMS",
    "topic": "Normalization",
    "duration_minutes": 30,
    "total_marks": 50.0,
    "num_questions": 8,
    "use_weak_spots": true,
    "use_high_yield": true,
    "fast_mode": false
  }
  ```
- **Response `200 OK`**: Returns a `MockExam` object containing `exam_id`, time limit, mark budget, and structured multi-mark questions.

---

### `POST /exam/submit`
Evaluates mock exam submissions (MCQs and conceptual/problem multi-mark evaluation), calculating individual marks and generating a comprehensive score breakdown by topic.

- **Request Body**: `MockExamSubmission` containing `exam_id` and list of answers.
- **Response `200 OK`**: Returns a `MockExamResult` with total marks obtained, percentage score, topic breakdown, and itemized feedback.

---

## 6. Past-Paper Analyzer & Exam Intelligence

### `POST /past-papers/upload`
Uploads previous years' question paper PDFs, parses questions, extracts marks allocations, tags academic topics, and indexes content into SQLite and ChromaDB.

- **Request Format**: `multipart/form-data`
  - `files`: One or more PDF question papers.
  - `topic` (optional): Course or subject name.
  - `year` (optional): Examination year (for example, `"2023"`).
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
        "total_questions": 12,
        "total_marks": 100.0
      }
    ],
    "total_files": 1,
    "message": "Past papers analyzed and questions extracted successfully."
  }
  ```

---

### `GET /past-papers`
Lists all uploaded and analyzed question papers, with optional subject filtering.

- **Query Parameters**: `subject` (optional string).
- **Response `200 OK`**: Lists paper summaries and metadata.

---

### `GET /past-papers/subjects`
Returns a list of distinct academic subjects across all uploaded question papers with their paper counts.

- **Response `200 OK`**:
  ```json
  {
    "subjects": [
      {
        "subject": "DBMS",
        "paper_count": 3
      },
      {
        "subject": "Operating Systems",
        "paper_count": 2
      }
    ]
  }
  ```

---

### `GET /past-papers/{paper_id}`
Returns full details and all extracted questions for a specific past paper.

- **Path Parameters**: `paper_id` (integer).

---

### `DELETE /past-papers/{paper_id}`
Deletes a past paper and its associated questions from the SQLite database.

- **Path Parameters**: `paper_id` (integer).

---

### `GET /past-papers/analysis`
Aggregates topic frequency, total marks, percentage contribution, and yield ratings across uploaded past papers.

- **Query Parameters**: `subject` (optional string).

---

### `GET /past-papers/priority-matrix`
Intersects past-paper marks distribution with student quiz mastery scores to generate the High-Yield Priority Matrix.

- **Query Parameters**: `subject` (optional string).

---

### `GET /past-papers/questions`
Searchable question bank supporting filtering by subject, topic, year, paper ID, and keyword search.

- **Query Parameters**:
  - `subject` (optional string)
  - `topic` (optional string)
  - `year` (optional string)
  - `paper_id` (optional integer)
  - `search` (optional string)
  - `limit` (integer, default: 100, max: 500)

---

### `POST /past-papers/reanalyze`
Re-runs question extraction and topic categorization across all stored question papers in `data/uploads`.
