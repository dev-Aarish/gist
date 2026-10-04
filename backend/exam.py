import json
import uuid
import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError

from backend.config import settings
from backend.ingest import get_collection, get_ollama_client, get_fallback_models
from backend.prompts import (
    MOCK_EXAM_SYSTEM_PROMPT,
    MOCK_EXAM_USER_PROMPT,
    MOCK_EXAM_EVALUATION_PROMPT
)
from backend.tracker import (
    get_weak_topics,
    get_priority_matrix,
    get_past_paper_questions,
    record_quiz_submission
)


class MockExamQuestionItem(BaseModel):
    id: str = Field(default_factory=lambda: f"eq_{uuid.uuid4().hex[:6]}")
    question_number: str = "Q1"
    type: Literal["mcq", "short_answer", "long_answer"] = "short_answer"
    marks: float = 5.0
    topic: str
    subtopic: Optional[str] = None
    question: str
    options: List[str] = Field(default_factory=list)
    correct_answer: str
    explanation: str
    source_file: Optional[str] = None


class MockExamSchema(BaseModel):
    title: Optional[str] = "Timed Mock Examination"
    subject: Optional[str] = "General"
    duration_minutes: Optional[int] = 30
    total_marks: Optional[float] = 50.0
    questions: List[MockExamQuestionItem]


class MockExam(BaseModel):
    exam_id: str
    title: str
    subject: str
    duration_minutes: int
    total_marks: float
    total_questions: int
    questions: List[MockExamQuestionItem]
    created_at: str
    is_adaptive: bool = False


class MockExamSubmission(BaseModel):
    exam_id: str
    subject: Optional[str] = None
    duration_minutes: int = 30
    time_taken_seconds: int = 0
    answers: Dict[str, str] = Field(default_factory=dict)
    questions: Optional[List[MockExamQuestionItem]] = None


class GradedExamQuestion(BaseModel):
    question_id: str
    question_number: str
    question_text: str
    question_type: str
    marks_possible: float
    marks_awarded: float
    is_correct: bool
    user_answer: str
    correct_answer: str
    feedback: str
    topic: str
    subtopic: Optional[str] = None


class TopicBreakdownItem(BaseModel):
    topic: str
    question_count: int
    marks_possible: float
    marks_awarded: float
    score_percentage: float
    status: Literal["Mastered", "Needs Review", "Weak Spot"]
    feedback_summary: Optional[str] = None


class MockExamResult(BaseModel):
    exam_id: str
    title: str
    subject: str
    duration_minutes: int
    time_taken_seconds: int
    total_marks_possible: float
    total_marks_awarded: float
    score_percentage: float
    performance_tier: str
    topic_breakdown: List[TopicBreakdownItem]
    graded_questions: List[GradedExamQuestion]
    strongest_topic: Optional[str] = None
    weakest_topic: Optional[str] = None
    recorded_at: str


# In-memory store for active generated exams
ACTIVE_EXAMS: Dict[str, MockExam] = {}


def fetch_context_for_exam(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    use_weak_spots: bool = False,
    use_high_yield: bool = False,
    max_chunks: int = 5
) -> Dict[str, Any]:
    """
    Gather concise study context across multiple topics for a rich mock examination.
    """
    target_subject = subject or "All Topics"
    is_adaptive = False

    # 1. Check priority matrix or weak spots if requested
    focus_topics = []
    if use_high_yield:
        try:
            matrix = get_priority_matrix(subject=subject if subject != "All Topics" else None)
            prioritized = matrix.get("prioritized_topics", [])
            focus_topics = [p["topic"] for p in prioritized[:3]]
            is_adaptive = True
        except Exception:
            pass

    if not focus_topics and use_weak_spots:
        focus_topics = get_weak_topics(limit=3)
        if focus_topics:
            is_adaptive = True

    if topic and topic != "All Topics":
        focus_topics = [topic]

    # Query ChromaDB with compact chunk limit
    collection = get_collection()
    count = 0
    try:
        count = collection.count()
    except Exception:
        count = 0

    documents = []
    metadatas = []

    if count > 0:
        try:
            if focus_topics:
                for top in focus_topics:
                    res = collection.get(
                        where={"topic": top},
                        limit=2,
                        include=["documents", "metadatas"]
                    )
                    documents.extend(res.get("documents", []))
                    metadatas.extend(res.get("metadatas", []))
            
            if not documents:
                res = collection.get(
                    limit=max_chunks,
                    include=["documents", "metadatas"]
                )
                documents = res.get("documents", [])
                metadatas = res.get("metadatas", [])
        except Exception:
            documents = []
            metadatas = []

    # Also query SQLite Past Paper Questions archive
    past_questions = []
    try:
        if focus_topics:
            for top in focus_topics:
                pqs = get_past_paper_questions(topic=top, limit=4)
                past_questions.extend(pqs)
        if not past_questions:
            past_questions = get_past_paper_questions(
                subject=subject if subject != "All Topics" else None,
                limit=max_chunks * 2
            )
    except Exception:
        past_questions = []

    context_blocks = []
    topics_seen = set()

    for idx, doc_text in enumerate(documents[:max_chunks]):
        meta = metadatas[idx] if idx < len(metadatas) else {}
        src = meta.get("source", "Notes")
        pg = meta.get("page", 1)
        top = meta.get("topic", "General")
        topics_seen.add(top)
        snippet = (doc_text[:350] + "...") if len(doc_text) > 350 else doc_text
        context_blocks.append(f"[{src} p.{pg} ({top})]: {snippet}")

    for pq in past_questions[:max_chunks]:
        q_src = pq.get("paper_title") or pq.get("filename") or "Exam Archive"
        q_num = pq.get("question_number") or ""
        q_top = pq.get("topic") or "General"
        q_marks = pq.get("marks") or 5
        q_txt = pq.get("question_text", "")
        topics_seen.add(q_top)
        snippet = (q_txt[:300] + "...") if len(q_txt) > 300 else q_txt
        context_blocks.append(f"[{q_src} {q_num} ({q_marks}M, {q_top})]: {snippet}")

    final_subject = target_subject
    if final_subject == "All Topics" and topics_seen:
        final_subject = ", ".join(list(topics_seen)[:3])

    return {
        "context": "\n".join(context_blocks),
        "subject": final_subject,
        "is_adaptive": is_adaptive,
        "topics": list(topics_seen),
        "past_questions": past_questions
    }


def generate_mock_exam(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    duration_minutes: int = 30,
    total_marks: float = 50.0,
    num_questions: int = 8,
    use_weak_spots: bool = False,
    use_high_yield: bool = False,
    fast_mode: bool = False,
    max_retries: int = 2
) -> MockExam:
    """
    Generate a timed, multi-topic mock examination with mark allocations.
    If fast_mode=True or instant synthesis requested, builds directly from past paper questions in <0.05s.
    """
    context_data = fetch_context_for_exam(
        subject=subject,
        topic=topic,
        use_weak_spots=use_weak_spots,
        use_high_yield=use_high_yield,
        max_chunks=min(6, max(3, num_questions // 2))
    )

    past_qs = context_data.get("past_questions", [])

    # Fast-mode path: Instant assembly from indexed past exam questions (<0.05s)
    if fast_mode and past_qs:
        fallback_items: List[MockExamQuestionItem] = []
        selected_qs = past_qs[:num_questions]
        default_mark_per_q = round(total_marks / max(1, len(selected_qs)), 1)
        accumulated_marks = 0.0

        for i, pq in enumerate(selected_qs, 1):
            q_id = f"eq_fast_{pq.get('id', uuid.uuid4().hex[:6])}"
            p_title = pq.get("paper_title") or pq.get("filename") or "Past Exam Paper"
            p_yr = pq.get("paper_year") or ""
            pq_marks = float(pq.get("marks") or default_mark_per_q)
            pq_topic = pq.get("topic") or topic or "General"
            pq_subtopic = pq.get("subtopic") or ""
            pq_text = pq.get("question_text", "")

            q_type: Literal["mcq", "short_answer", "long_answer"] = "short_answer"
            if pq_marks >= 8.0:
                q_type = "long_answer"

            fallback_items.append(MockExamQuestionItem(
                id=q_id,
                question_number=f"Q{i}",
                type=q_type,
                marks=pq_marks,
                topic=pq_topic,
                subtopic=pq_subtopic,
                question=pq_text,
                options=[],
                correct_answer=f"Comprehensive response addressing core concepts of {pq_topic}.",
                explanation=f"Official question from {p_title} ({p_yr}) carrying {pq_marks} marks.",
                source_file=p_title
            ))
            accumulated_marks += pq_marks

        exam_id = f"exam_{uuid.uuid4().hex[:8]}"
        exam_obj = MockExam(
            exam_id=exam_id,
            title=f"{subject or context_data['subject']} Fast Mock Exam",
            subject=subject or context_data["subject"],
            duration_minutes=duration_minutes,
            total_marks=accumulated_marks or total_marks,
            total_questions=len(fallback_items),
            questions=fallback_items,
            created_at=datetime.datetime.now().isoformat(),
            is_adaptive=context_data.get("is_adaptive", False)
        )
        ACTIVE_EXAMS[exam_id] = exam_obj
        return exam_obj

    if not context_data["context"] and not past_qs:
        raise ValueError("No study notes or past exam papers found. Please upload notes or question papers first.")

    target_subject = subject or context_data["subject"] or "Comprehensive Exam"
    user_prompt = MOCK_EXAM_USER_PROMPT.format(
        context=context_data["context"] or "Refer to past paper questions and standard curriculum.",
        subject=target_subject,
        total_marks=total_marks,
        duration_minutes=duration_minutes,
        num_questions=min(num_questions, 15)
    )

    client = get_ollama_client()
    messages = [
        {"role": "system", "content": MOCK_EXAM_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    models_to_try = [settings.llm_model]
    for fb in get_fallback_models(exclude=settings.llm_model):
        if fb not in models_to_try:
            models_to_try.append(fb)

    last_error = None
    exam_data: Optional[MockExamSchema] = None

    # Predict token cap proportional to question count
    pred_tokens = min(1400, max(350, num_questions * 110))

    for model_name in models_to_try:
        model_messages = list(messages)
        for attempt in range(max_retries):
            try:
                response = client.chat(
                    model=model_name,
                    messages=model_messages,
                    format="json",
                    options={
                        "temperature": 0.25,
                        "num_predict": pred_tokens,
                        "top_p": 0.85,
                    },
                    keep_alive=settings.keep_alive
                )


                raw_json_str = response["message"]["content"].strip()
                parsed_dict = json.loads(raw_json_str)

                # Unpack common root wraps
                if "questions" not in parsed_dict:
                    if "exam" in parsed_dict and isinstance(parsed_dict["exam"], dict):
                        parsed_dict = parsed_dict["exam"]
                    elif isinstance(parsed_dict, list):
                        parsed_dict = {"questions": parsed_dict}

                if "subject" not in parsed_dict:
                    parsed_dict["subject"] = target_subject
                if "duration_minutes" not in parsed_dict:
                    parsed_dict["duration_minutes"] = duration_minutes
                if "total_marks" not in parsed_dict:
                    parsed_dict["total_marks"] = total_marks

                exam_data = MockExamSchema.model_validate(parsed_dict)
                break
            except (json.JSONDecodeError, ValidationError) as e:
                last_error = str(e)
                model_messages.append({"role": "assistant", "content": raw_json_str if 'raw_json_str' in locals() else ""})
                model_messages.append({
                    "role": "user",
                    "content": f"The previous output failed validation: {last_error}. Please provide strictly valid JSON matching the MockExam schema."
                })
            except Exception as e:
                err_str = str(e)
                last_error = err_str
                is_conn_error = any(kw in err_str.lower() for kw in [
                    "connect", "connection", "refused", "offline", "unreachable", "downloaded, running and accessible"
                ])
                if is_conn_error:
                    break

        if exam_data and exam_data.questions:
            break

    # Fallback to direct past-paper questions if LLM is offline or failed
    if not exam_data or not exam_data.questions:
        past_qs = context_data.get("past_questions", [])
        if not past_qs:
            past_qs = get_past_paper_questions(limit=num_questions * 2)

        if past_qs:
            fallback_items: List[MockExamQuestionItem] = []
            accumulated_marks = 0.0
            
            # Select diverse past questions across topics
            selected_qs = past_qs[:num_questions]
            default_mark_per_q = round(total_marks / max(1, len(selected_qs)), 1)

            for i, pq in enumerate(selected_qs, 1):
                q_id = f"eq_fb_{pq.get('id', uuid.uuid4().hex[:6])}"
                p_title = pq.get("paper_title") or pq.get("filename") or "Past Exam Paper"
                p_yr = pq.get("paper_year") or ""
                pq_marks = float(pq.get("marks") or default_mark_per_q)
                pq_topic = pq.get("topic") or "General"
                pq_subtopic = pq.get("subtopic") or ""
                pq_text = pq.get("question_text", "")

                q_type: Literal["mcq", "short_answer", "long_answer"] = "short_answer"
                if pq_marks >= 8.0:
                    q_type = "long_answer"

                fallback_items.append(MockExamQuestionItem(
                    id=q_id,
                    question_number=f"Q{i}",
                    type=q_type,
                    marks=pq_marks,
                    topic=pq_topic,
                    subtopic=pq_subtopic,
                    question=pq_text,
                    options=[],
                    correct_answer=f"Detailed academic response addressing all key theoretical and practical facets of {pq_topic}.",
                    explanation=f"Official examination question from {p_title} ({p_yr}) worth {pq_marks} marks.",
                    source_file=p_title
                ))
                accumulated_marks += pq_marks

            exam_id = f"exam_{uuid.uuid4().hex[:8]}"
            exam_obj = MockExam(
                exam_id=exam_id,
                title=f"{target_subject} Mock Exam",
                subject=target_subject,
                duration_minutes=duration_minutes,
                total_marks=accumulated_marks or total_marks,
                total_questions=len(fallback_items),
                questions=fallback_items,
                created_at=datetime.datetime.now().isoformat(),
                is_adaptive=context_data.get("is_adaptive", False)
            )
            ACTIVE_EXAMS[exam_id] = exam_obj
            return exam_obj

        if any(kw in str(last_error).lower() for kw in [
            "connect", "connection", "refused", "offline", "unreachable", "downloaded, running and accessible"
        ]):
            raise ConnectionError(f"Ollama local LLM is unreachable ({last_error}). Please start Ollama ('ollama serve').")
        raise RuntimeError(f"Failed to generate valid mock exam after {max_retries} attempts. Last error: {last_error}")

    # Standardize questions
    formatted_questions: List[MockExamQuestionItem] = []
    running_marks = 0.0
    for i, q in enumerate(exam_data.questions, 1):
        q.question_number = q.question_number or f"Q{i}"
        q.marks = float(q.marks if q.marks and q.marks > 0 else 5.0)
        running_marks += q.marks
        formatted_questions.append(q)

    exam_id = f"exam_{uuid.uuid4().hex[:8]}"
    exam_obj = MockExam(
        exam_id=exam_id,
        title=exam_data.title or f"{target_subject} Timed Mock Exam",
        subject=exam_data.subject or target_subject,
        duration_minutes=exam_data.duration_minutes or duration_minutes,
        total_marks=round(running_marks, 1) or total_marks,
        total_questions=len(formatted_questions),
        questions=formatted_questions,
        created_at=datetime.datetime.now().isoformat(),
        is_adaptive=context_data.get("is_adaptive", False)
    )

    ACTIVE_EXAMS[exam_id] = exam_obj
    return exam_obj


def evaluate_exam_question(
    question: str,
    correct_answer: str,
    user_answer: str,
    max_marks: float,
    topic: str
) -> Dict[str, Any]:
    """
    Grade a student's answer for a multi-mark exam question using LLM rubric.
    """
    if not user_answer or not user_answer.strip():
        return {
            "marks_awarded": 0.0,
            "is_correct": False,
            "feedback": "No answer submitted."
        }

    # Clean exact match check
    if user_answer.strip().lower() == correct_answer.strip().lower():
        return {
            "marks_awarded": float(max_marks),
            "is_correct": True,
            "feedback": "Complete and exact response meeting all rubric criteria."
        }

    prompt = MOCK_EXAM_EVALUATION_PROMPT.format(
        question=question,
        topic=topic,
        max_marks=max_marks,
        reference_answer=correct_answer,
        student_answer=user_answer
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
                    {"role": "system", "content": "You are a fair, precise university examination grader. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                format="json",
                options={"temperature": 0.1},
                keep_alive=settings.keep_alive
            )
            data = json.loads(response["message"]["content"].strip())
            marks = float(data.get("marks_awarded", 0.0))
            # Clamp between 0.0 and max_marks
            clamped_marks = max(0.0, min(float(max_marks), round(marks, 1)))
            is_corr = bool(data.get("is_correct", clamped_marks >= (max_marks * 0.6)))
            return {
                "marks_awarded": clamped_marks,
                "is_correct": is_corr,
                "feedback": data.get("feedback", "Response evaluated against standard grading criteria.")
            }
        except Exception:
            continue

    # Fallback heuristic grading
    u_lower = user_answer.lower()
    c_lower = correct_answer.lower()
    
    # Check keyword overlaps
    ref_words = set(w for w in c_lower.split() if len(w) > 3)
    user_words = set(w for w in u_lower.split() if len(w) > 3)
    overlap = len(ref_words.intersection(user_words))
    total_ref = max(1, len(ref_words))
    ratio = min(1.0, overlap / total_ref)

    if ratio >= 0.75:
        marks = max_marks
        is_corr = True
        fb = "Strong answer covering key core concepts."
    elif ratio >= 0.4:
        marks = round(max_marks * 0.6, 1)
        is_corr = True
        fb = "Partially correct; addresses main concepts with some omissions."
    elif len(u_lower) > 20:
        marks = round(max_marks * 0.3, 1)
        is_corr = False
        fb = "Basic attempt made but missed several key grading points."
    else:
        marks = 0.0
        is_corr = False
        fb = "Answer insufficient to award marks."

    return {
        "marks_awarded": marks,
        "is_correct": is_corr,
        "feedback": fb
    }


def grade_mock_exam_submission(submission: MockExamSubmission) -> MockExamResult:
    """
    Grade a submitted mock exam, calculate marks, compute detailed topic-wise breakdown,
    record to SQLite tracker, and return comprehensive exam analytics.
    """
    cached_exam = ACTIVE_EXAMS.get(submission.exam_id)
    questions = submission.questions or (cached_exam.questions if cached_exam else [])

    if not questions:
        raise ValueError(f"No questions found for exam_id: {submission.exam_id}. Please supply questions in submission.")

    graded_questions: List[GradedExamQuestion] = []
    
    # Topic breakdown aggregator: topic -> { possible: float, awarded: float, count: int, correct: int, feedbacks: [] }
    topic_map: Dict[str, Dict[str, Any]] = {}

    total_possible_marks = 0.0
    total_awarded_marks = 0.0

    for q in questions:
        q_marks = float(q.marks if q.marks > 0 else 5.0)
        total_possible_marks += q_marks
        user_ans = submission.answers.get(q.id, "").strip()
        corr_ans = q.correct_answer.strip()
        q_topic = q.topic.strip() or "General"

        if q_topic not in topic_map:
            topic_map[q_topic] = {
                "possible": 0.0,
                "awarded": 0.0,
                "count": 0,
                "correct": 0,
                "feedbacks": []
            }

        topic_map[q_topic]["possible"] += q_marks
        topic_map[q_topic]["count"] += 1

        if not user_ans:
            is_correct = False
            awarded = 0.0
            feedback = f"No answer provided. Reference solution: {corr_ans}"
        elif q.type == "mcq":
            norm_user = user_ans.lower().strip()
            norm_corr = corr_ans.lower().strip()
            is_correct = False

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

            awarded = q_marks if is_correct else 0.0
            feedback = q.explanation or ("Correct option selected." if is_correct else f"Incorrect. Correct answer was {corr_ans}.")
        else:
            eval_res = evaluate_exam_question(
                question=q.question,
                correct_answer=corr_ans,
                user_answer=user_ans,
                max_marks=q_marks,
                topic=q_topic
            )
            awarded = eval_res["marks_awarded"]
            is_correct = eval_res["is_correct"]
            feedback = eval_res["feedback"]
            if q.explanation and q.explanation not in feedback:
                feedback = f"{feedback} (Rubric Reference: {q.explanation})"


        total_awarded_marks += awarded
        topic_map[q_topic]["awarded"] += awarded
        if is_correct:
            topic_map[q_topic]["correct"] += 1
        if feedback:
            topic_map[q_topic]["feedbacks"].append(feedback)

        graded_questions.append(GradedExamQuestion(
            question_id=q.id,
            question_number=q.question_number,
            question_text=q.question,
            question_type=q.type,
            marks_possible=q_marks,
            marks_awarded=awarded,
            is_correct=is_correct,
            user_answer=user_ans,
            correct_answer=corr_ans,
            feedback=feedback,
            topic=q_topic,
            subtopic=q.subtopic
        ))

    # Calculate overall score percentage
    score_pct = round((total_awarded_marks / total_possible_marks * 100) if total_possible_marks > 0 else 0.0, 1)

    # Determine Performance Tier
    if score_pct >= 85.0:
        performance_tier = "Distinction (Mastery)"
    elif score_pct >= 70.0:
        performance_tier = "Merit (Strong Performance)"
    elif score_pct >= 50.0:
        performance_tier = "Pass (Review Recommended)"
    else:
        performance_tier = "Needs Immediate Revision"

    # Build topic breakdown items
    topic_breakdown: List[TopicBreakdownItem] = []
    strongest_topic = None
    weakest_topic = None
    best_pct = -1.0
    worst_pct = 101.0

    for top_name, data in topic_map.items():
        t_poss = data["possible"]
        t_award = data["awarded"]
        t_pct = round((t_award / t_poss * 100) if t_poss > 0 else 0.0, 1)

        if t_pct >= 75.0:
            status = "Mastered"
        elif t_pct >= 50.0:
            status = "Needs Review"
        else:
            status = "Weak Spot"

        if t_pct > best_pct:
            best_pct = t_pct
            strongest_topic = top_name
        if t_pct < worst_pct:
            worst_pct = t_pct
            weakest_topic = top_name

        fb_sum = data["feedbacks"][0] if data["feedbacks"] else None

        topic_breakdown.append(TopicBreakdownItem(
            topic=top_name,
            question_count=data["count"],
            marks_possible=round(t_poss, 1),
            marks_awarded=round(t_award, 1),
            score_percentage=t_pct,
            status=status,
            feedback_summary=fb_sum
        ))

    # Sort topic breakdown by priority: lowest score percentage first
    topic_breakdown.sort(key=lambda x: x.score_percentage)

    now = datetime.datetime.now().isoformat()
    exam_title = (cached_exam.title if cached_exam else None) or f"{submission.subject or 'Mock'} Exam"
    exam_subject = (cached_exam.subject if cached_exam else None) or submission.subject or "General"

    # Log to SQLite tracker so mock exam attempts update mastery database!
    try:
        record_quiz_submission(
            quiz_id=submission.exam_id,
            topic=exam_subject,
            graded_questions=[
                {
                    "topic": g.topic,
                    "question_text": g.question_text,
                    "question_type": g.question_type,
                    "user_answer": g.user_answer,
                    "correct_answer": g.correct_answer,
                    "is_correct": g.is_correct,
                    "feedback": g.feedback
                }
                for g in graded_questions
            ]
        )
    except Exception as e:
        print(f"Notice: SQLite tracker log for exam {submission.exam_id}: {e}")

    return MockExamResult(
        exam_id=submission.exam_id,
        title=exam_title,
        subject=exam_subject,
        duration_minutes=submission.duration_minutes,
        time_taken_seconds=submission.time_taken_seconds,
        total_marks_possible=round(total_possible_marks, 1),
        total_marks_awarded=round(total_awarded_marks, 1),
        score_percentage=score_pct,
        performance_tier=performance_tier,
        topic_breakdown=topic_breakdown,
        graded_questions=graded_questions,
        strongest_topic=strongest_topic,
        weakest_topic=weakest_topic,
        recorded_at=now
    )
