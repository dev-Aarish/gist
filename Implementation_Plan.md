# Exam Buddy: Implementation Plan

**Event:** Hacktoberfest Weekend Challenge, theme "Build for a Friend"
**Project:** An offline, private study partner built for one real friend, powered entirely by open-weight models running locally.

---

## 1. Project Summary

Exam Buddy lets a friend upload their own notes, slides, and PDFs. It then:

1. **Answers questions** using only their material, with the source page shown (RAG).
2. **Generates quizzes** (MCQs and short answers) from any topic or chapter.
3. **Tracks weak spots** by logging what they get wrong and prioritizing those topics in the next quiz.

Everything runs on a laptop with no internet and no accounts. Their notes never leave their machine, and it costs nothing to run.

**Friend:** `<name>`, studying `<subject / course>`
**Their real problem:** `<one sentence, in their words if possible>`

> Fill these two lines in first. They anchor the whole write-up.

---

## 2. Why Open-Source Is the Core (for the post)

| Claim | How the project proves it |
|---|---|
| Works with no internet | Demo it with Wi-Fi turned off (hostel or exam-season connectivity is a real use case) |
| Private by design | Notes and quiz history stay on-device; show there are no outbound API calls |
| Zero running cost | No API keys, no per-token billing, unlimited practice |
| Swappable and tunable | Swap models by changing one config line; optionally fine-tune question style |
| Controllable behavior | Custom system prompts keep answers grounded in the notes and reduce made-up answers |

Be honest in the post about where a closed model would be stronger (raw quality on hard reasoning) and why the open trade-off is worth it for this person.

---

## 3. Machine Specifications and Constraints

**Dev machine:** Mac, Apple M4, 16 GB unified RAM, 512 GB storage

Things to keep in mind:

- **No dedicated GPU needed.** Apple Silicon uses its integrated GPU through Metal, and Ollama and llama.cpp use it automatically.
- **RAM is the real limit (16 GB total, shared with macOS and your apps).**
  - 7B-8B models at 4-bit quantization take roughly 5 GB, which is comfortable.
  - Avoid 14B+ models. They load but leave too little headroom for the app, the browser, and the vector store.
- **Budget the memory:** model (~5 GB) + embedding model (<1 GB) + macOS and apps (~4-6 GB) + app/DB (~1 GB). Close heavy apps (Docker, many Chrome tabs) while demoing.
- **Context length:** keep context modest (4k-8k tokens). Longer contexts increase RAM use and slow responses.
- **Storage:** 512 GB is plenty. Each model is a few GB. Keep model files out of the git repo.
- **Handing it to the friend:** their machine may be weaker. Test the 3B fallback model so it can run on an 8 GB laptop. If they have a different OS, document the Ollama install for it.
- **Battery and thermals:** long generations on battery heat the laptop. Plug in during the build and demo.
- **Fine-tuning:** possible on this Mac through MLX-LM (LoRA/QLoRA on a 1B-3B model), but treat it as a stretch goal only. RAG gives better results for this use case with no training time.

---

## 4. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| LLM runtime | **Ollama** | Easiest setup, Metal acceleration, local REST API |
| Main model | **Qwen 2.5 7B Instruct** (`qwen2.5:7b-instruct`) | Strong at structured/JSON output for quizzes |
| Alternative model | **Llama 3.1 8B Instruct** (`llama3.1:8b`) | Compare answer quality; keep switchable via config |
| Fallback model | **Qwen 2.5 3B** or **Llama 3.2 3B** | For weaker laptops |
| Embeddings | **nomic-embed-text** via Ollama | Small and fast |
| Vector store | **ChromaDB** (persistent, local) | No server needed |
| PDF parsing | **PyMuPDF** (`pymupdf`) | Keeps page numbers for citations |
| Structured data | **SQLite** | Quiz history and weak-spot tracking |
| Backend | **Python + FastAPI** | Async, simple to document |
| Frontend | **React + Vite** (or plain HTML/JS if time is tight) | Upload, chat, quiz, progress views |
| Optional voice | **faster-whisper** or **mlx-whisper** | Stretch goal: ask questions by voice |
| Optional speedup | **MLX-LM** | Benchmark against Ollama on the M4 |
| Optional fine-tune | **MLX-LM LoRA** | Stretch goal: question style tuning |

**Verify before building:** confirm exact model tags with `ollama list` / the Ollama library, since names and versions change.

---

## 5. Architecture

```
┌────────────┐     ┌────────────────────────────────────────┐
│  Web UI    │────▶│              FastAPI backend           │
│ (React)    │◀────│                                        │
└────────────┘     │  /upload   /ask   /quiz   /progress    │
                   └───────┬──────────────┬─────────────────┘
                           │              │
              ┌────────────▼───┐   ┌──────▼───────┐
              │ Ingestion      │   │ SQLite       │
              │ PyMuPDF →      │   │ attempts,    │
              │ chunk → embed  │   │ topics,      │
              └──────┬─────────┘   │ scores       │
                     │             └──────────────┘
              ┌──────▼─────────┐
              │ ChromaDB       │
              │ (chunks + page │
              │  metadata)     │
              └──────┬─────────┘
                     │ top-k chunks
              ┌──────▼─────────┐
              │ Ollama         │
              │ LLM + embed    │
              │ (localhost)    │
              └────────────────┘
```

### Data flow

- **Ingest:** PDF → extract text per page → split into chunks (~500-800 tokens, ~100 overlap) → embed → store in Chroma with `{source, page, topic}` metadata.
- **Ask:** question → embed → top-k retrieval (k = 4-6) → prompt with context → answer plus page citations.
- **Quiz:** pick topic (or weakest topics) → retrieve chunks → ask model for JSON quiz questions → render → grade → store results.
- **Weak spots:** each attempt updates a per-topic score; the next quiz weights topics by error rate.

---

## 6. Suggested Project Structure

```
exam-buddy/
├── README.md
├── backend/
│   ├── main.py            # FastAPI app and routes
│   ├── config.py          # model names, chunk sizes, paths
│   ├── ingest.py          # PDF parsing, chunking, embedding
│   ├── rag.py             # retrieval and answer generation
│   ├── quiz.py            # quiz generation and grading
│   ├── tracker.py         # SQLite weak-spot logic
│   └── prompts.py         # all system/user prompts in one place
├── frontend/
│   └── src/               # Upload, Chat, Quiz, Progress components
├── data/                  # (gitignored) uploads, chroma, sqlite
├── docs/                  # screenshots, demo GIF
└── requirements.txt
```

Keep model names and chunk settings in `config.py` so swapping models is a one-line change. That is a direct "open innovation" demo point.

---

## 7. Weekend Timeline

Adjust for your real deadline and availability.

### Saturday

| Block | Goal | Done when |
|---|---|---|
| Morning (setup) | Install Ollama, pull models, create repo, FastAPI skeleton | `ollama run` works; `/health` endpoint returns OK |
| Late morning | Ingestion pipeline: PDF → chunks → Chroma | A test PDF is indexed with page metadata |
| Afternoon | `/ask` with RAG and citations; tune prompts | Correct, cited answers on 10 test questions |
| Evening | Quiz generation (structured JSON), grading, SQLite logging | One full quiz round works end to end |

### Sunday

| Block | Goal | Done when |
|---|---|---|
| Morning | Weak-spot tracker and adaptive quizzes; UI polish | Second quiz visibly focuses on missed topics |
| Late morning | **Hand it to your friend** and watch them use it | You have notes and a quote from them |
| Afternoon | README, screenshots, 2-3 min demo video (Wi-Fi off) | Repo is clean and the demo is recorded |
| Evening | Write and publish the dev.to post | Submitted before the deadline |

**Protect the writing time.** Writing quality is weighted most heavily in judging. Start the post draft on Saturday night while details are fresh.

---

## 8. Key Implementation Notes

### Prompting (grounded answers)
- Instruct the model to answer **only from provided context** and to say "not found in your notes" otherwise.
- Always return source file and page numbers.
- Keep temperature low (~0.2) for answers.

### Reliable quiz JSON
- Ask for a strict JSON schema (question, options, correct answer, explanation, topic). Ollama supports constrained structured output through its `format` parameter; verify against the current Ollama docs.
- Validate with Pydantic, and retry once on parse failure.
- Generate 5 questions per call rather than 20, since smaller batches are more reliable on 7B models.

### Chunking
- Split by headings or paragraphs where possible, not by raw character count.
- Handwritten or scanned PDFs have no text layer. Decide early whether to support OCR (for example Tesseract or a vision model) or state it as a limitation.

### Weak-spot logic (simple and explainable)
- Per topic: `attempts`, `correct`, `last_seen`.
- Priority score = error rate weighted by recency. Sample topics in proportion to that score.
- Show the friend a simple progress view (topics colored by mastery).

### Performance on the M4
- Stream responses to the UI so it feels fast.
- Keep the model loaded between requests (Ollama's `keep_alive`).
- Benchmark tokens/second for Ollama vs MLX and report the real numbers in the post.

---

## 9. Stretch Goals (only if the core is done)

1. **Voice questions** with Whisper (local).
2. **Small LoRA fine-tune** to match the exam's question style, using MLX-LM on a 1B-3B model. Document before/after examples.
3. **Spaced repetition** scheduling for weak topics.
4. **Flashcard export** (Anki format).
5. **Model comparison page** showing the same question answered by two models.

---

## 10. Risks and Fallbacks

| Risk | Fallback |
|---|---|
| 7B model is too slow or heavy during demo | Switch to the 3B model through config |
| Quiz JSON is malformed | Pydantic validation plus one retry; smaller batches |
| Scanned PDFs have no extractable text | Limit scope to text PDFs, or add OCR as a stretch |
| Poor answer quality on math or diagrams | Be upfront in the post about limits; focus on text-heavy subjects |
| Friend unavailable for handover | Do a recorded screen-share session or have them test remotely |
| Running out of time | Cut voice, fine-tuning, and spaced repetition. Keep RAG + quiz + weak spots |

---

## 11. Submission Checklist (dev.to)

Use the challenge's submission template and tags (`devchallenge`, `weekendchallenge`, `hf26challenge`).

- [ ] **What I Built:** who the friend is and the real problem
- [ ] **Demo:** video (ideally with Wi-Fi off) or deployed link
- [ ] **Code:** public GitHub repo embedded, with a clear README
- [ ] **How I Built It:** models, runtime, RAG pipeline, key decisions
- [ ] **Why Open Innovation Matters:** offline, private, free, swappable, with honest trade-offs
- [ ] **Friend's reaction:** a real quote or observation from the handover
- [ ] **Agent session (optional):** save with DevRelay and embed or link it
- [ ] **Prize categories (optional):** list any that apply, or remove the section
- [ ] **Proofread** the post at least once, out loud

### Judging criteria mapping

| Criterion | How this project covers it |
|---|---|
| Writing quality (heaviest) | Personal story, clear structure, honest trade-offs, friend's quote |
| Relevance to theme | One named friend, one real problem, actual handover |
| Creativity | Adaptive weak-spot quizzing on the friend's own material |
| Technical execution | Clean RAG pipeline, validated structured output, benchmarks |
| Partner technology | Optional, use only if it genuinely fits |

---

## 12. Pre-Flight Commands (starter)

```bash
# Install Ollama (https://ollama.com), then:
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text

# Python environment
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn chromadb pymupdf ollama pydantic

# Run the backend
uvicorn backend.main:app --reload
```

*Double-check package and model names against current docs before the weekend, since they change often.*
