# How-To Guides

This section provides practical, task-oriented recipes to help you operate, configure, and troubleshoot **Gist**.

---

## 1. How to Dynamically Switch Active LLM Models

Gist automatically detects all chat models installed in your local Ollama runtime and lets you switch between them at any time without restarting the server.

You can use any open-weight model, including **Google Gemma 2**, **Meta Llama 3.2**, **Mistral**, **Microsoft Phi-4**, **DeepSeek-R1**, or **Qwen 2.5**.

### Option A: Via REST API
Send a `POST` request to `/models/select` with your chosen model name:

```bash
# Switch to Google Gemma 2 (9B)
curl -X POST "http://localhost:8000/models/select" \
     -H "Content-Type: application/json" \
     -d '{"model": "gemma2:9b"}'

# Or switch to a lightweight model for lower RAM
curl -X POST "http://localhost:8000/models/select" \
     -H "Content-Type: application/json" \
     -d '{"model": "gemma2:2b"}'
```

The server verifies the model is installed in Ollama, switches the active runtime model, and persists your choice to `data/model_config.json`.

### Option B: Via Environment Variable
You can set a default model at startup by defining `LLM_MODEL`:

```bash
export LLM_MODEL="gemma2:9b"
uvicorn backend.main:app --reload --port 8000
```

> **Note:** An explicit `LLM_MODEL` environment variable overrides any persisted selection in `data/model_config.json`.

---

## 2. How to Upload and Analyze Past Exam Question Papers

Gist can ingest previous years' question papers to build an automated exam question bank with marks detection.

### Uploading via cURL
Use the `POST /past-papers/upload` multi-part endpoint:

```bash
curl -X POST "http://localhost:8000/past-papers/upload" \
     -F "files=@DBMS_2023_Final.pdf" \
     -F "topic=DBMS" \
     -F "year=2023"
```

The engine:
1. Extracts question items and detects question marks using regex and language model heuristics.
2. Tags each question with a specific concept topic.
3. Indexes the raw text into ChromaDB in the background for note cross-referencing.
4. Stores the structured question items in SQLite for query filtering and priority analysis.

### Re-analyzing Stored Papers
If you pull a more capable model (for example, switching from `2b` to `9b`) and want to improve topic categorization across existing papers:

```bash
curl -X POST "http://localhost:8000/past-papers/reanalyze"
```

---

## 3. How to Interpret and Act on the Exam Priority Matrix

The Exam Priority Matrix cross-references past paper topic weightages with your quiz mastery scores.

To fetch the matrix:

```bash
curl -X GET "http://localhost:8000/past-papers/priority-matrix?subject=DBMS"
```

### Priority Classification Rules

```mermaid
graph TD
    ExamWeight{"Exam Topic Marks Percentage"} --> HighMarks["High Yield: >= 15% of Exam Marks"]
    ExamWeight --> LowMarks["Low Yield: < 15% of Exam Marks"]
    
    HighMarks --> CheckMastery{"Student Quiz Accuracy"}
    LowMarks --> CheckMastery2{"Student Quiz Accuracy"}
    
    CheckMastery -- "< 60% Accuracy" --> Critical["Critical Priority: High Yield + Weak Spot"]
    CheckMastery -- ">= 60% Accuracy" --> HighPriority["High Priority: High Yield + Strong Mastery"]
    
    CheckMastery2 -- "< 60% Accuracy" --> MediumPriority["Medium Priority: Low Yield + Weak Spot"]
    CheckMastery2 -- ">= 60% Accuracy" --> LowPriority["Low Priority: Low Yield + Strong Mastery"]
```

- **Critical Priority**: Topics that frequently appear in exams with high marks weightage, but where your quiz accuracy is below 60%. Study these first.
- **High Priority**: High-mark topics where you currently perform well, requiring periodic revision.
- **Medium Priority**: Infrequently tested topics where mastery is low.
- **Low Priority**: Infrequently tested topics with high mastery.

---

## 4. How to Isolate Study Materials with Subject Segregation

Gist supports full subject segregation, keeping distinct courses (such as *Database Systems* and *Operating Systems*) completely separate.

### Filter Past Papers by Subject
```bash
curl -X GET "http://localhost:8000/past-papers?subject=DBMS"
```

### Browse Questions for a Specific Subject
```bash
curl -X GET "http://localhost:8000/past-papers/questions?subject=DBMS&limit=50"
```

### Delete an Entire Subject
To remove all lecture notes, vector chunks, and quiz tracking records for a subject:
```bash
curl -X DELETE "http://localhost:8000/subjects/DBMS"
```

---

## 5. How to Reset System Data

Gist provides granular controls to reset different data stores independently.

```mermaid
graph TD
    ResetReq["POST /reset Request Received"] --> CheckVector{"reset_vector_db is true?"}
    CheckVector -- "Yes" --> ClearChroma["Purge ChromaDB Vector Collection"]
    CheckVector -- "No" --> KeepVector["Preserve Vector Index"]
    
    ClearChroma --> CheckTracking{"reset_tracking is true?"}
    KeepVector --> CheckTracking
    
    CheckTracking -- "Yes" --> WipeSQLite["Wipe Quiz Scores and Mastery History"]
    CheckTracking -- "No" --> KeepSQLite["Preserve Quiz History"]
    
    WipeSQLite --> CheckPapers{"reset_past_papers is true?"}
    KeepSQLite --> CheckPapers
    
    CheckPapers -- "Yes" --> WipePapers["Delete Past Papers and Extracted Questions"]
    CheckPapers -- "No" --> KeepPapers["Preserve Past Papers"]
    
    WipePapers --> Success["Return 200 OK Response"]
    KeepPapers --> Success
```

### Reset Vector Database Only
```bash
curl -X POST "http://localhost:8000/reset?reset_vector_db=true&reset_tracking=false&reset_past_papers=false"
```

### Reset Past Papers Only
```bash
curl -X POST "http://localhost:8000/reset?reset_vector_db=false&reset_tracking=false&reset_past_papers=true"
```

### Complete System Wipe
```bash
curl -X POST "http://localhost:8000/reset?reset_vector_db=true&reset_tracking=true&reset_past_papers=true"
```

---

## 6. How to Tune Text Chunking Parameters

If your study materials contain dense mathematical formulas or lengthy code blocks, tuning the text splitter parameters in `backend/config.py` can improve retrieval precision.

1. Open `backend/config.py`.
2. Adjust `chunk_size` and `chunk_overlap`:
   ```python
   # Smaller chunks for concise factual QA
   chunk_size: int = 400
   chunk_overlap: int = 80
   ```
3. Re-ingest your documents so new embeddings are calculated and stored in ChromaDB.

---

## 7. How to Troubleshoot Common Issues

```mermaid
graph TD
    Issue["Issue Identified"] --> CheckType{"Select Symptom"}
    CheckType -- "Ollama connection error" --> FixOllama["Run 'ollama serve' or check OLLAMA_HOST env var"]
    CheckType -- "High RAM or slow inference" --> FixRAM["Switch to gemma2:2b or call POST /warmup"]
    CheckType -- "QA says info not found" --> FixContext["Increase top_k retrieval or check PDF text readability"]
    CheckType -- "Past paper marks not detected" --> FixMarks["Ensure PDF is text-based and run POST /past-papers/reanalyze"]
```

### Issue: `ollama_status: error` in `/health`
- **Cause**: Ollama daemon is not running or is configured on a non-standard port.
- **Solution**: Start Ollama in your terminal:
  ```bash
  ollama serve
  ```
  If running on a custom host or port, set `OLLAMA_HOST`:
  ```bash
  export OLLAMA_HOST="http://127.0.0.1:11434"
  ```

### Issue: High Memory Consumption or Slow Responses
- **Cause**: Larger models (9B+) can experience latency on systems with unified memory below 16 GB.
- **Solution**: Switch to `gemma2:2b` or `llama3.2:3b`, or call `POST /warmup` to keep model weights pre-loaded in memory:
  ```bash
  curl -X POST "http://localhost:8000/warmup"
  ```

### Issue: Questions Extracted Without Marks
- **Cause**: The PDF question paper might use unusual formatting or is an image scan.
- **Solution**: Verify the PDF text is selectable. You can re-run the extraction heuristics using `POST /past-papers/reanalyze`.
