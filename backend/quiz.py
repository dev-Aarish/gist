import json
import uuid
import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError

from backend.config import settings
from backend.ingest import get_collection, get_ollama_client
from backend.prompts import (
    QUIZ_SYSTEM_PROMPT,
    QUIZ_USER_PROMPT,
    SHORT_ANSWER_GRADING_PROMPT
)
from backend.tracker import get_weak_topics, record_quiz_submission


class QuizQuestionItem(BaseModel):
    id: str = Field(default_factory=lambda: f"q_{uuid.uuid4().hex[:6]}")
    type: Literal["mcq", "short_answer"] = "mcq"
    question: str
    options: List[str] = Field(default_factory=list)
    correct_answer: str
    explanation: str
    topic: str
    source_file: Optional[str] = None
    source_page: Optional[int] = None


class QuizSchema(BaseModel):
    topic: str
    questions: List[QuizQuestionItem]


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


# In-memory store for generated quizzes
ACTIVE_QUIZZES: Dict[str, Quiz] = {}


def fetch_context_for_quiz(
    topic: Optional[str] = None,
    max_chunks: int = 8,
    use_weak_spots: bool = False
) -> Dict[str, Any]:
    """
    Fetch relevant context chunks from ChromaDB for the quiz topic or weakest topics.
    """
    collection = get_collection()
    count = collection.count()
    if count == 0:
        return {"context": "", "topic": topic or "General", "chunks": []}

    target_topic = topic
    is_adaptive = False

    if use_weak_spots or not target_topic:
        weak_topics = get_weak_topics(limit=2)
        if weak_topics:
            target_topic = weak_topics[0]
            is_adaptive = True

    where_filter = None
    if target_topic and target_topic != "All Topics":
        where_filter = {"topic": target_topic}

    # Fetch chunks
    try:
        results = collection.get(
            where=where_filter,
            limit=max_chunks,
            include=["documents", "metadatas"]
        )
    except Exception:
        results = collection.get(limit=max_chunks, include=["documents", "metadatas"])

    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])

    if not documents:
        # Fallback to random/all chunks if topic filter returned nothing
        results = collection.get(limit=max_chunks, include=["documents", "metadatas"])
        documents = results.get("documents", [])
        metadatas = results.get("metadatas", [])

    context_blocks = []
    for idx, doc_text in enumerate(documents):
        meta = metadatas[idx] if idx < len(metadatas) else {}
        src = meta.get("source", "Notes")
        pg = meta.get("page", 1)
        top = meta.get("topic", target_topic or "General")
        context_blocks.append(f"[File: {src}, Page: {pg}, Topic: {top}]\n{doc_text}")

    final_topic = target_topic or (metadatas[0].get("topic", "General") if metadatas else "Course Material")

    return {
        "context": "\n\n".join(context_blocks),
        "topic": final_topic,
        "is_adaptive": is_adaptive,
        "metadatas": metadatas
    }


def generate_quiz(
    topic: Optional[str] = None,
    num_questions: int = 5,
    use_weak_spots: bool = False,
    max_retries: int = 3
) -> Quiz:
    """
    Generate a validated JSON quiz with automatic retries on validation failure.
    """
    context_data = fetch_context_for_quiz(
        topic=topic,
        max_chunks=max(8, min(num_questions, 20)),
        use_weak_spots=use_weak_spots
    )

    if not context_data["context"]:
        raise ValueError("No notes found in database. Please upload your study notes first.")

    target_topic = context_data["topic"]
    user_prompt = QUIZ_USER_PROMPT.format(
        context=context_data["context"],
        topic=target_topic,
        num_questions=min(num_questions, 20)
    )

    client = get_ollama_client()
    messages = [
        {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    last_error = None
    quiz_data: Optional[QuizSchema] = None

    for attempt in range(max_retries):
        try:
            response = client.chat(
                model=settings.llm_model,
                messages=messages,
                format="json",
                options={
                    "temperature": settings.quiz_temperature
                },
                keep_alive=settings.keep_alive
            )

            raw_json_str = response["message"]["content"].strip()
            parsed_dict = json.loads(raw_json_str)

            # Handle possible nested wrappers
            if "questions" not in parsed_dict and isinstance(parsed_dict, list):
                parsed_dict = {"topic": target_topic, "questions": parsed_dict}
            elif "questions" not in parsed_dict and "quiz" in parsed_dict:
                parsed_dict = parsed_dict["quiz"]

            if "topic" not in parsed_dict:
                parsed_dict["topic"] = target_topic

            # Validate against Pydantic schema
            quiz_data = QuizSchema.model_validate(parsed_dict)
            break

        except (json.JSONDecodeError, ValidationError, Exception) as e:
            last_error = str(e)
            # Add error feedback to prompt messages for retry
            messages.append({"role": "assistant", "content": raw_json_str if 'raw_json_str' in locals() else ""})
            messages.append({
                "role": "user",
                "content": f"The previous response failed validation with error: {last_error}. Please correct the formatting and output valid JSON according to the schema."
            })

    if not quiz_data or not quiz_data.questions:
        raise RuntimeError(f"Failed to generate valid quiz after {max_retries} attempts. Last error: {last_error}")

    quiz_id = f"quiz_{uuid.uuid4().hex[:8]}"
    quiz_obj = Quiz(
        quiz_id=quiz_id,
        topic=quiz_data.topic or target_topic,
        questions=quiz_data.questions,
        created_at=datetime.datetime.now().isoformat(),
        is_adaptive=context_data.get("is_adaptive", False)
    )

    # Save to active quizzes cache
    ACTIVE_QUIZZES[quiz_id] = quiz_obj
    return quiz_obj


def grade_short_answer(
    question: str,
    correct_answer: str,
    user_answer: str,
    context: str = ""
) -> Dict[str, Any]:
    """
    Use LLM to grade conceptual short-answer questions.
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
    try:
        response = client.chat(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": "You are a fair, objective exam grader. Output only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            format="json",
            options={"temperature": 0.1},
            keep_alive=settings.keep_alive
        )
        data = json.loads(response["message"]["content"].strip())
        return {
            "is_correct": bool(data.get("is_correct", False)),
            "feedback": data.get("feedback", "")
        }
    except Exception:
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

        if q.type == "mcq":
            # Normalize MCQ answers (e.g. "A) option" vs "A" vs full text)
            norm_user = user_ans.lower().strip()
            norm_corr = correct_ans.lower().strip()
            
            if norm_user == norm_corr:
                is_correct = True
            elif len(norm_user) == 1 and norm_corr.startswith(norm_user + ")"):
                is_correct = True
            elif norm_user.startswith(norm_corr[:2]):
                is_correct = True
            elif norm_user in norm_corr or norm_corr in norm_user:
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
