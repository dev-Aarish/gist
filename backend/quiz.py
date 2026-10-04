import json
import uuid
import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError

from backend.config import settings
from backend.ingest import get_collection, get_ollama_client, get_fallback_models
from backend.prompts import (
    QUIZ_SYSTEM_PROMPT,
    QUIZ_USER_PROMPT,
    SHORT_ANSWER_GRADING_PROMPT
)
from backend.tracker import get_weak_topics, record_quiz_submission, get_past_paper_questions, get_priority_matrix


class QuizQuestionItem(BaseModel):
    id: str = Field(default_factory=lambda: f"q_{uuid.uuid4().hex[:6]}")
    type: Literal["mcq", "short_answer"] = "mcq"
    question: str
    options: List[str] = Field(default_factory=list)
    correct_answer: str = ""
    explanation: str = ""
    topic: Optional[str] = None
    source_file: Optional[str] = None
    source_page: Optional[int] = None


class QuizSchema(BaseModel):
    topic: Optional[str] = "General"
    questions: List[QuizQuestionItem] = Field(default_factory=list)


class Quiz(BaseModel):
    quiz_id: str
    topic: str
    questions: List[QuizQuestionItem]
    created_at: str
    is_adaptive: bool = False


class QuizSubmission(BaseModel):
    quiz_id: str
    topic: Optional[str] = None
    # Map of question_id -> user answer string
    answers: Dict[str, str]
    # Optionally client can include the full questions if state is not cached
    questions: Optional[List[QuizQuestionItem]] = None


class GradedQuestion(BaseModel):
    question_id: str
    question_text: str
    question_type: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    topic: str


class QuizResult(BaseModel):
    quiz_id: str
    topic: str
    total_questions: int
    correct_count: int
    score_percentage: float
    graded_questions: List[GradedQuestion]
    recorded_at: str


# In-memory store for active generated quizzes
ACTIVE_QUIZZES: Dict[str, Quiz] = {}

# In-memory reusable pool of generated topic questions for instant reuse
TOPIC_QUIZ_CACHE: Dict[str, List[QuizQuestionItem]] = {}


def fetch_context_for_quiz(
    topic: Optional[str] = None,
    max_chunks: int = 3,
    use_weak_spots: bool = False,
    use_high_yield: bool = False
) -> Dict[str, Any]:
    """
    Fetch focused context chunks from ChromaDB and/or SQLite Past Paper archive
    for the quiz topic, weakest topics, or high-yield past paper priorities.
    """
    target_topic = topic
    is_adaptive = False

    if use_high_yield:
        try:
            matrix = get_priority_matrix()
            prioritized = matrix.get("prioritized_topics", [])
            if prioritized:
                target_topic = prioritized[0]["topic"]
                is_adaptive = True
        except Exception:
            pass

    if not target_topic and use_weak_spots:
        weak_topics = get_weak_topics(limit=2)
        if weak_topics:
            target_topic = weak_topics[0]
            is_adaptive = True

    # 1. Query ChromaDB with compact chunk limit
    collection = get_collection()
    count = 0
    try:
        count = collection.count()
    except Exception:
        count = 0

    documents = []
    metadatas = []

    where_filter = None
    if target_topic and target_topic != "All Topics":
        where_filter = {"topic": target_topic}

    if count > 0:
        try:
            results = collection.get(
                where=where_filter,
                limit=max_chunks,
                include=["documents", "metadatas"]
            )
            documents = results.get("documents", [])
            metadatas = results.get("metadatas", [])
        except Exception:
            documents = []
            metadatas = []

    # 2. If no chunks found for target_topic in ChromaDB, check Past Paper Questions
    past_questions = []
    if not documents and target_topic and target_topic != "All Topics":
        past_questions = get_past_paper_questions(topic=target_topic, limit=max_chunks * 2)

    if not documents and not past_questions and count == 0:
        past_questions = get_past_paper_questions(limit=max_chunks * 2)

    context_blocks = []
    if documents:
        for idx, doc_text in enumerate(documents[:max_chunks]):
            meta = metadatas[idx] if idx < len(metadatas) else {}
            src = meta.get("source", "Notes")
            pg = meta.get("page", 1)
            top = meta.get("topic", target_topic or "General")
            # Compact text to 280 chars max for fast token eval
            snippet = (doc_text[:280] + "...") if len(doc_text) > 280 else doc_text
            context_blocks.append(f"[{src} p.{pg} ({top})]: {snippet}")
        final_topic = target_topic or (metadatas[0].get("topic", "General") if metadatas else "Course Material")
    elif past_questions:
        for q in past_questions[:max_chunks]:
            q_src = q.get("paper_title") or q.get("filename") or "Exam Paper"
            q_num = q.get("question_number") or ""
            q_top = q.get("topic") or target_topic or "General"
            q_txt = q.get("question_text", "")
            snippet = (q_txt[:250] + "...") if len(q_txt) > 250 else q_txt
            context_blocks.append(f"[{q_src} {q_num} ({q_top})]: {snippet}")
        final_topic = target_topic or past_questions[0].get("topic", "Exam Questions")
    elif count > 0:
        results = collection.get(limit=max_chunks, include=["documents", "metadatas"])
        documents = results.get("documents", [])
        metadatas = results.get("metadatas", [])
        for idx, doc_text in enumerate(documents[:max_chunks]):
            meta = metadatas[idx] if idx < len(metadatas) else {}
            src = meta.get("source", "Notes")
            pg = meta.get("page", 1)
            top = meta.get("topic", target_topic or "General")
            snippet = (doc_text[:280] + "...") if len(doc_text) > 280 else doc_text
            context_blocks.append(f"[{src} p.{pg} ({top})]: {snippet}")
        final_topic = target_topic or (metadatas[0].get("topic", "General") if metadatas else "Course Material")
    else:
        final_topic = target_topic or "General"

    return {
        "context": "\n".join(context_blocks),
        "topic": final_topic,
        "is_adaptive": is_adaptive,
        "metadatas": metadatas,
        "past_questions": past_questions
    }


def _extract_question_objects(text: str) -> List[Dict[str, Any]]:
    """Extract all fully closed JSON objects from potentially truncated JSON text."""
    objs = []
    depth = 0
    start = -1
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if ch == '"' and not escape:
            in_string = not in_string
        elif ch == '\\' and not escape:
            escape = True
            continue
        elif not in_string:
            if ch == '{':
                if depth == 1:
                    start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 1 and start != -1:
                    chunk = text[start:i + 1]
                    try:
                        parsed = json.loads(chunk)
                        if isinstance(parsed, dict) and "question" in parsed:
                            objs.append(parsed)
                    except Exception:
                        pass
                    start = -1
        escape = False
    return objs


def _clean_and_repair_quiz_json(raw_str: str, target_topic: str) -> Dict[str, Any]:
    """
    Robust JSON parser that sanitizes markdown blocks, isolates JSON payloads,
    recovers from truncated JSON streams, and normalizes question keys so validation never fails.
    """
    text = raw_str.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()

    first_brace = text.find("{")
    first_bracket = text.find("[")

    parsed = None
    if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
        last_brace = text.rfind("}")
        if last_brace != -1:
            try:
                parsed = json.loads(text[first_brace:last_brace + 1])
            except Exception:
                pass
    elif first_bracket != -1:
        last_bracket = text.rfind("]")
        if last_bracket != -1:
            try:
                parsed = json.loads(text[first_bracket:last_bracket + 1])
            except Exception:
                pass

    if parsed is None:
        try:
            parsed = json.loads(text)
        except Exception:
            # Attempt recovering partial valid questions from incomplete stream
            recovered_questions = _extract_question_objects(text)
            if recovered_questions:
                parsed = {"topic": target_topic, "questions": recovered_questions}
            else:
                parsed = {"topic": target_topic, "questions": []}

    # Normalize root container
    if isinstance(parsed, list):
        parsed = {"topic": target_topic, "questions": parsed}
    elif isinstance(parsed, dict):
        if "questions" not in parsed:
            for k in ["quiz", "items", "data", "quiz_questions", "exam"]:
                if k in parsed and isinstance(parsed[k], list):
                    parsed["questions"] = parsed[k]
                    break
                elif k in parsed and isinstance(parsed[k], dict) and "questions" in parsed[k]:
                    parsed = parsed[k]
                    break
            if "questions" not in parsed:
                if "question" in parsed:
                    parsed = {"topic": target_topic, "questions": [parsed]}
                else:
                    parsed["questions"] = _extract_question_objects(text)

    if "topic" not in parsed or not parsed["topic"]:
        parsed["topic"] = target_topic

    # Normalize each question item
    clean_questions = []
    raw_questions_list = parsed.get("questions", [])
    if not raw_questions_list:
        raw_questions_list = _extract_question_objects(text)

    for idx, item in enumerate(raw_questions_list):
        if not isinstance(item, dict) or not item.get("question"):
            continue
        q_id = str(item.get("id") or f"q{idx + 1}")
        q_text = str(item.get("question", "")).strip()
        q_type = str(item.get("type", "mcq")).lower()
        if q_type not in ["mcq", "short_answer"]:
            q_type = "mcq" if item.get("options") else "short_answer"

        options = item.get("options") or []
        if isinstance(options, dict):
            options = [f"{k}) {v}" for k, v in options.items()]
        elif not isinstance(options, list):
            options = []

        options = [str(o).strip() for o in options if str(o).strip()]

        if q_type == "mcq" and len(options) < 2:
            q_type = "short_answer"

        correct_ans = str(item.get("correct_answer") or item.get("answer") or "").strip()
        if not correct_ans:
            if q_type == "mcq" and options:
                correct_ans = options[0]
            else:
                correct_ans = "Core concept from notes."

        explanation = str(item.get("explanation") or "").strip()
        if not explanation:
            explanation = f"Based on {target_topic} concepts."

        q_topic = str(item.get("topic") or target_topic).strip()

        clean_questions.append({
            "id": q_id,
            "type": q_type,
            "question": q_text,
            "options": options,
            "correct_answer": correct_ans,
            "explanation": explanation,
            "topic": q_topic,
            "source_file": item.get("source_file"),
            "source_page": item.get("source_page")
        })

    parsed["questions"] = clean_questions
    return parsed


def get_fast_quiz_models() -> List[str]:
    """
    Return model candidates prioritized for high-speed quiz authoring
    (fast 3B/2B/1B models first for 3-6s latency, then active 7B/14B models).
    """
    from backend.ingest import list_installed_models
    installed = [m["name"] for m in list_installed_models()]

    fast_priority = [
        "llama3.2:3b", "llama3.2:1b", "llama3.2",
        "qwen2.5:3b", "qwen2.5:1.5b", "qwen2.5:0.5b",
        "gemma2:2b", "phi3:mini", "tinyllama"
    ]

    models = []
    for fp in fast_priority:
        for inst in installed:
            if inst == fp or inst.startswith(f"{fp}:") or (":" not in fp and inst.startswith(fp)):
                if inst not in models:
                    models.append(inst)

    if settings.llm_model not in models:
        models.append(settings.llm_model)
    for fb in get_fallback_models(exclude=settings.llm_model):
        if fb not in models:
            models.append(fb)

    return models or [settings.llm_model]


def generate_quiz(
    topic: Optional[str] = None,
    num_questions: int = 5,
    use_weak_spots: bool = False,
    use_high_yield: bool = False,
    fast_mode: bool = False,
    max_retries: int = 2
) -> Quiz:
    """
    Generate a validated JSON quiz with speed-optimized prompt & tokens,
    sub-second fast-mode support, and robust auto-repair fallback.
    """
    context_data = fetch_context_for_quiz(
        topic=topic,
        max_chunks=min(3, max(2, num_questions // 2)),
        use_weak_spots=use_weak_spots,
        use_high_yield=use_high_yield
    )

    target_topic = context_data["topic"]
    norm_topic_key = target_topic.lower().strip()

    # 1. Fast Mode / Instant Practice Path (<0.05s) from past paper archive
    if fast_mode:
        direct_pqs = get_past_paper_questions(
            topic=target_topic if target_topic != "All Topics" else None,
            limit=num_questions
        )
        if direct_pqs:
            fast_items = []
            for idx, pq in enumerate(direct_pqs[:num_questions], 1):
                q_id = f"pq_{pq.get('id', uuid.uuid4().hex[:6])}"
                p_title = pq.get("paper_title") or pq.get("filename") or "Past Exam Paper"
                p_yr = pq.get("paper_year") or ""
                marks = pq.get("marks", 5)
                fast_items.append(QuizQuestionItem(
                    id=q_id,
                    type="short_answer",
                    question=pq.get("question_text", ""),
                    options=[],
                    correct_answer=f"Comprehensive response addressing core concepts for {marks} marks.",
                    explanation=f"Official question from {p_title} ({p_yr}) carrying {marks} marks for topic '{pq.get('topic', target_topic)}'.",
                    topic=pq.get("topic") or target_topic,
                    source_file=p_title
                ))
            quiz_id = f"quiz_fast_{uuid.uuid4().hex[:8]}"
            quiz_obj = Quiz(
                quiz_id=quiz_id,
                topic=target_topic,
                questions=fast_items,
                created_at=datetime.datetime.now().isoformat(),
                is_adaptive=context_data.get("is_adaptive", False)
            )
            ACTIVE_QUIZZES[quiz_id] = quiz_obj
            return quiz_obj

    if not context_data["context"]:
        # Check if past paper questions exist
        direct_pqs = get_past_paper_questions(
            topic=target_topic if target_topic != "All Topics" else None,
            limit=num_questions
        )
        if not direct_pqs:
            raise ValueError("No study notes or past exam questions found. Please upload notes or question papers first.")

    user_prompt = QUIZ_USER_PROMPT.format(
        context=context_data["context"],
        topic=target_topic,
        num_questions=min(num_questions, 15)
    )

    client = get_ollama_client()
    messages = [
        {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    # Prioritize fast models (e.g. 3B models) for rapid 3-6s quiz authoring
    models_to_try = get_fast_quiz_models()

    last_error = None
    quiz_data: Optional[QuizSchema] = None

    # Predict tokens with safe headroom per question
    pred_tokens = min(1200, max(450, num_questions * 110))

    for model_name in models_to_try:
        model_messages = list(messages)
        for attempt in range(max_retries):
            try:
                response = client.chat(
                    model=model_name,
                    messages=model_messages,
                    format="json",
                    options={
                        "temperature": 0.2,
                        "num_predict": pred_tokens,
                        "num_ctx": 1536,  # Compact context window cuts KV cache allocation overhead
                        "top_p": 0.85,
                    },
                    keep_alive=settings.keep_alive
                )

                raw_json_str = response["message"]["content"].strip()
                repaired_dict = _clean_and_repair_quiz_json(raw_json_str, target_topic)

                # Validate against Pydantic schema
                quiz_data = QuizSchema.model_validate(repaired_dict)
                if quiz_data.questions:
                    break

            except (json.JSONDecodeError, ValidationError) as e:
                last_error = str(e)
                model_messages.append({"role": "assistant", "content": raw_json_str if 'raw_json_str' in locals() else ""})
                model_messages.append({
                    "role": "user",
                    "content": f"The previous response failed schema parsing. Please output strictly valid JSON with topic and questions list."
                })
            except Exception as e:
                err_str = str(e)
                last_error = err_str
                is_conn_error = any(kw in err_str.lower() for kw in [
                    "connect", "connection", "refused", "offline", "unreachable", "downloaded, running and accessible"
                ])
                if is_conn_error:
                    break

        if quiz_data and quiz_data.questions:
            break

    # If LLM generation failed, gracefully construct practice quiz from past questions
    if not quiz_data or not quiz_data.questions:
        direct_pqs = get_past_paper_questions(
            topic=target_topic if target_topic != "All Topics" else None,
            limit=num_questions
        )
        if direct_pqs:
            fallback_items = []
            for pq in direct_pqs[:num_questions]:
                q_id = f"pq_{pq.get('id', uuid.uuid4().hex[:6])}"
                p_title = pq.get("paper_title") or pq.get("filename") or "Past Exam Paper"
                p_yr = pq.get("paper_year") or ""
                marks = pq.get("marks", 5)
                fallback_items.append(QuizQuestionItem(
                    id=q_id,
                    type="short_answer",
                    question=pq.get("question_text", ""),
                    options=[],
                    correct_answer=f"Comprehensive response addressing core concepts for {marks} marks.",
                    explanation=f"Real exam question from {p_title} ({p_yr}) carrying {marks} marks for topic '{pq.get('topic', target_topic)}'.",
                    topic=pq.get("topic") or target_topic,
                    source_file=p_title
                ))
            quiz_id = f"quiz_{uuid.uuid4().hex[:8]}"
            quiz_obj = Quiz(
                quiz_id=quiz_id,
                topic=target_topic,
                questions=fallback_items,
                created_at=datetime.datetime.now().isoformat(),
                is_adaptive=context_data.get("is_adaptive", False)
            )
            ACTIVE_QUIZZES[quiz_id] = quiz_obj
            return quiz_obj

        if any(kw in str(last_error).lower() for kw in [
            "connect", "connection", "refused", "offline", "unreachable", "downloaded, running and accessible"
        ]):
            raise ConnectionError(f"Ollama local LLM is unreachable ({last_error}). Please ensure Ollama is running ('ollama serve').")
        raise RuntimeError(f"Failed to generate valid quiz after {max_retries} attempts. Last error: {last_error}")

    quiz_id = f"quiz_{uuid.uuid4().hex[:8]}"
    quiz_obj = Quiz(
        quiz_id=quiz_id,
        topic=quiz_data.topic or target_topic,
        questions=quiz_data.questions,
        created_at=datetime.datetime.now().isoformat(),
        is_adaptive=context_data.get("is_adaptive", False)
    )

    # Save to active cache and topic question cache
    ACTIVE_QUIZZES[quiz_id] = quiz_obj
    if norm_topic_key not in TOPIC_QUIZ_CACHE:
        TOPIC_QUIZ_CACHE[norm_topic_key] = []
    TOPIC_QUIZ_CACHE[norm_topic_key].extend(quiz_data.questions)

    return quiz_obj


def grade_short_answer(
    question: str,
    correct_answer: str,
    user_answer: str,
    context: str = ""
) -> Dict[str, Any]:
    """
    Use LLM to grade conceptual short-answer questions with speed-optimized token predict caps.
    """
    if not user_answer or not user_answer.strip():
        return {
            "is_correct": False,
            "feedback": "No answer provided."
        }

    # Fast check: exact or stripped match
    if user_answer.strip().lower() == correct_answer.strip().lower():
        return {
            "is_correct": True,
            "feedback": "Exact match!"
        }

    prompt = SHORT_ANSWER_GRADING_PROMPT.format(
        context=context,
        question=question,
        correct_answer=correct_answer,
        user_answer=user_answer
    )

    client = get_ollama_client()
    models_to_try = [settings.llm_model]
    for fb in get_fallback_models(exclude=settings.llm_model):
        if fb not in models_to_try:
            models_to_try.append(fb)

    for model_name in models_to_try:
        try:
            response = client.chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": "You are a fair, objective exam grader. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                format="json",
                options={
                    "temperature": 0.1,
                    "num_predict": 80,
                    "num_ctx": 1024
                },
                keep_alive=settings.keep_alive
            )
            data = json.loads(response["message"]["content"].strip())
            return {
                "is_correct": bool(data.get("is_correct", False)),
                "feedback": data.get("feedback", "")
            }
        except Exception:
            continue

    # Fallback to loose containment
    is_corr = (
        correct_answer.lower() in user_answer.lower() or
        user_answer.lower() in correct_answer.lower()
    )
    return {
        "is_correct": is_corr,
        "feedback": "Graded via keyword matching fallback."
    }


def grade_quiz_submission(submission: QuizSubmission) -> QuizResult:
    """
    Grade a submitted quiz, calculate score, record to SQLite tracker, and return results.
    """
    # Look up cached quiz if available
    cached_quiz = ACTIVE_QUIZZES.get(submission.quiz_id)
    questions = submission.questions or (cached_quiz.questions if cached_quiz else [])

    if not questions:
        raise ValueError(f"No questions found for quiz_id: {submission.quiz_id}. Please supply questions in submission.")

    graded_list: List[GradedQuestion] = []
    topic = submission.topic or (cached_quiz.topic if cached_quiz else "General")

    for q in questions:
        user_ans = submission.answers.get(q.id, "").strip()
        correct_ans = q.correct_answer.strip()
        is_correct = False
        feedback = q.explanation

        if not user_ans:
            is_correct = False
            feedback = f"No answer provided. Reference answer: {correct_ans}"
        elif q.type == "mcq":
            norm_user = user_ans.lower().strip()
            norm_corr = correct_ans.lower().strip()

            if norm_user == norm_corr:
                is_correct = True
            elif len(norm_user) == 1 and (norm_corr.startswith(norm_user + ")") or norm_corr.startswith(norm_user + ".")):
                is_correct = True
            elif len(norm_corr) == 1 and (norm_user.startswith(norm_corr + ")") or norm_user.startswith(norm_corr + ".")):
                is_correct = True
            elif len(norm_user) >= 2 and len(norm_corr) >= 2 and (norm_user.startswith(norm_corr[:2]) or norm_corr.startswith(norm_user[:2])):
                is_correct = True
            elif len(norm_user) > 3 and norm_user in norm_corr:
                is_correct = True
            elif len(norm_corr) > 3 and norm_corr in norm_user:
                is_correct = True
            else:
                is_correct = False

        else:
            # Short answer grading
            grade_res = grade_short_answer(
                question=q.question,
                correct_answer=correct_ans,
                user_answer=user_ans
            )
            is_correct = grade_res["is_correct"]
            if grade_res.get("feedback"):
                feedback = f"{grade_res['feedback']} (Reference: {q.explanation})"

        graded_list.append(GradedQuestion(
            question_id=q.id,
            question_text=q.question,
            question_type=q.type,
            user_answer=user_ans,
            correct_answer=correct_ans,
            is_correct=is_correct,
            explanation=feedback,
            topic=q.topic or topic
        ))

    total_q = len(graded_list)
    correct_q = sum(1 for item in graded_list if item.is_correct)
    score_pct = round((correct_q / total_q * 100) if total_q > 0 else 0.0, 1)
    now = datetime.datetime.now().isoformat()

    # Log to SQLite tracker
    record_quiz_submission(
        quiz_id=submission.quiz_id,
        topic=topic,
        graded_questions=[g.model_dump() for g in graded_list]
    )

    return QuizResult(
        quiz_id=submission.quiz_id,
        topic=topic,
        total_questions=total_q,
        correct_count=correct_q,
        score_percentage=score_pct,
        graded_questions=graded_list,
        recorded_at=now
    )
