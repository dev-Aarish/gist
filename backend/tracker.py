import sqlite3
import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from backend.config import settings


def get_db_connection() -> sqlite3.Connection:
    """Create a connection to the SQLite database."""
    conn = sqlite3.connect(settings.sqlite_db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite schema if it doesn't already exist."""
    db_path = Path(settings.sqlite_db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Topic summary table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS topics (
            topic_name TEXT PRIMARY KEY,
            total_questions INTEGER DEFAULT 0,
            correct_answers INTEGER DEFAULT 0,
            last_attempted TIMESTAMP
        )
        """)

        # Quiz attempts table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id TEXT NOT NULL,
            topic TEXT,
            total_questions INTEGER NOT NULL,
            correct_count INTEGER NOT NULL,
            score_percentage REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Detailed per-question logs
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id TEXT NOT NULL,
            topic TEXT,
            question_text TEXT,
            question_type TEXT,
            user_answer TEXT,
            correct_answer TEXT,
            is_correct INTEGER NOT NULL,
            feedback TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Past question papers metadata
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS past_papers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            year TEXT,
            subject TEXT,
            total_questions INTEGER DEFAULT 0,
            total_marks REAL DEFAULT 0,
            raw_text TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

        # Individual extracted past paper questions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS past_paper_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_id INTEGER NOT NULL,
            question_number TEXT,
            question_text TEXT NOT NULL,
            topic TEXT NOT NULL,
            subtopic TEXT,
            marks REAL DEFAULT 0,
            question_type TEXT DEFAULT 'theory',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(paper_id) REFERENCES past_papers(id) ON DELETE CASCADE
        )
        """)

        conn.commit()


def record_quiz_submission(
    quiz_id: str,
    topic: str,
    graded_questions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Record quiz results, updating attempts, question logs, and topic statistics.
    """
    init_db()
    total_q = len(graded_questions)
    correct_q = sum(1 for q in graded_questions if q.get("is_correct", False))
    score_percentage = round((correct_q / total_q * 100) if total_q > 0 else 0.0, 1)
    now = datetime.datetime.now().isoformat()

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Insert into quiz_attempts
        cursor.execute("""
        INSERT INTO quiz_attempts (quiz_id, topic, total_questions, correct_count, score_percentage, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (quiz_id, topic, total_q, correct_q, score_percentage, now))

        # 2. Insert into question_logs and update topics
        topic_deltas: Dict[str, Dict[str, int]] = {}

        for item in graded_questions:
            q_topic = item.get("topic") or topic or "General"
            is_corr = 1 if item.get("is_correct", False) else 0

            cursor.execute("""
            INSERT INTO question_logs (
                quiz_id, topic, question_text, question_type,
                user_answer, correct_answer, is_correct, feedback, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                quiz_id,
                q_topic,
                item.get("question_text", ""),
                item.get("question_type", "mcq"),
                item.get("user_answer", ""),
                item.get("correct_answer", ""),
                is_corr,
                item.get("explanation") or item.get("feedback", ""),
                now
            ))

            if q_topic not in topic_deltas:
                topic_deltas[q_topic] = {"total": 0, "correct": 0}
            topic_deltas[q_topic]["total"] += 1
            if is_corr:
                topic_deltas[q_topic]["correct"] += 1

        # 3. Update topic aggregated stats
        for t_name, deltas in topic_deltas.items():
            cursor.execute("""
            INSERT INTO topics (topic_name, total_questions, correct_answers, last_attempted)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(topic_name) DO UPDATE SET
                total_questions = total_questions + ?,
                correct_answers = correct_answers + ?,
                last_attempted = ?
            """, (
                t_name, deltas["total"], deltas["correct"], now,
                deltas["total"], deltas["correct"], now
            ))

        conn.commit()

    return {
        "quiz_id": quiz_id,
        "topic": topic,
        "total_questions": total_q,
        "correct_count": correct_q,
        "score_percentage": score_percentage,
        "recorded_at": now
    }


def get_topic_statistics() -> List[Dict[str, Any]]:
    """
    Fetch all topic performance stats with mastery status and error rates.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT topic_name, total_questions, correct_answers, last_attempted
        FROM topics
        ORDER BY CASE WHEN last_attempted IS NULL THEN 1 ELSE 0 END, last_attempted DESC, total_questions DESC
        """)
        rows = cursor.fetchall()

    stats = []
    for row in rows:
        total = row["total_questions"]
        correct = row["correct_answers"]
        accuracy = round((correct / total * 100) if total > 0 else 0.0, 1)
        error_rate = round(100.0 - accuracy, 1)

        # Categorize mastery
        if total == 0:
            status = "Unattempted"
        elif accuracy >= 80.0:
            status = "Mastered"
        elif accuracy >= 50.0:
            status = "Needs Review"
        else:
            status = "Weak Spot"

        # Calculate priority for adaptive quizzes (higher error rate + lower attempts boost weight)
        priority_score = round(error_rate * (1.0 + (5.0 / (total + 1))), 2)

        stats.append({
            "topic": row["topic_name"],
            "total_questions": total,
            "correct_answers": correct,
            "accuracy": accuracy,
            "error_rate": error_rate,
            "status": status,
            "priority_score": priority_score,
            "last_attempted": row["last_attempted"]
        })

    return stats


def get_weak_topics(limit: int = 3) -> List[str]:
    """
    Identify topics requiring the most practice, sorted by priority score.
    """
    stats = get_topic_statistics()
    if not stats:
        return []

    # Sort descending by priority_score
    sorted_topics = sorted(stats, key=lambda x: x["priority_score"], reverse=True)
    return [t["topic"] for t in sorted_topics[:limit]]


def get_progress_summary() -> Dict[str, Any]:
    """
    Retrieve overall progress dashboard metrics.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*), AVG(score_percentage) FROM quiz_attempts")
        total_quizzes, avg_score = cursor.fetchone()
        avg_score = round(avg_score if avg_score is not None else 0.0, 1)

        cursor.execute("SELECT COUNT(*), SUM(is_correct) FROM question_logs")
        total_q, total_corr = cursor.fetchone()
        total_q = total_q or 0
        total_corr = total_corr or 0
        overall_accuracy = round((total_corr / total_q * 100) if total_q > 0 else 0.0, 1)

        # Recent attempts
        cursor.execute("""
        SELECT quiz_id, topic, total_questions, correct_count, score_percentage, created_at
        FROM quiz_attempts
        ORDER BY id DESC
        LIMIT 50
        """)
        recent_attempts = [dict(row) for row in cursor.fetchall()]

    topic_stats = get_topic_statistics()
    mastered_count = sum(1 for t in topic_stats if t["status"] == "Mastered")
    weak_count = sum(1 for t in topic_stats if t["status"] == "Weak Spot")
    review_count = sum(1 for t in topic_stats if t["status"] == "Needs Review")

    return {
        "total_quizzes_taken": total_quizzes or 0,
        "total_questions_answered": total_q,
        "overall_accuracy": overall_accuracy,
        "average_quiz_score": avg_score,
        "mastered_topics_count": mastered_count,
        "needs_review_count": review_count,
        "weak_spots_count": weak_count,
        "topics": topic_stats,
        "recent_quizzes": recent_attempts
    }


def get_quiz_attempt_details(quiz_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve full question logs and scoring for a specific past quiz attempt.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT quiz_id, topic, total_questions, correct_count, score_percentage, created_at
        FROM quiz_attempts
        WHERE quiz_id = ?
        ORDER BY id DESC
        LIMIT 1
        """, (quiz_id,))
        attempt_row = cursor.fetchone()

        if not attempt_row:
            cursor.execute("""
            SELECT quiz_id, topic, created_at
            FROM question_logs
            WHERE quiz_id = ?
            LIMIT 1
            """, (quiz_id,))
            q_first = cursor.fetchone()
            if not q_first:
                return None
            topic = q_first["topic"]
            created_at = q_first["created_at"]
        else:
            topic = attempt_row["topic"]
            created_at = attempt_row["created_at"]

        cursor.execute("""
        SELECT id, quiz_id, topic, question_text, question_type, user_answer, correct_answer, is_correct, feedback, created_at
        FROM question_logs
        WHERE quiz_id = ?
        ORDER BY id ASC
        """, (quiz_id,))
        question_rows = cursor.fetchall()

    graded_questions = []
    correct_count = 0
    for q_row in question_rows:
        is_corr = bool(q_row["is_correct"])
        if is_corr:
            correct_count += 1
        graded_questions.append({
            "question_id": f"q_{q_row['id']}",
            "question_text": q_row["question_text"],
            "question_type": q_row["question_type"],
            "user_answer": q_row["user_answer"],
            "correct_answer": q_row["correct_answer"],
            "is_correct": is_corr,
            "explanation": q_row["feedback"],
            "topic": q_row["topic"]
        })

    total_q = len(graded_questions)
    if attempt_row:
        score_percentage = attempt_row["score_percentage"]
        correct_count = attempt_row["correct_count"]
        total_q = attempt_row["total_questions"] or total_q
    else:
        score_percentage = round((correct_count / total_q * 100) if total_q > 0 else 0.0, 1)

    return {
        "quiz_id": quiz_id,
        "topic": topic,
        "total_questions": total_q,
        "correct_count": correct_count,
        "score_percentage": score_percentage,
        "graded_questions": graded_questions,
        "recorded_at": created_at
    }


def get_topic_history(topic: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve past question logs, user answers, and examiner remarks for a specific topic.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT id, quiz_id, topic, question_text, question_type, user_answer, correct_answer, is_correct, feedback, created_at
        FROM question_logs
        WHERE LOWER(topic) = LOWER(?) OR LOWER(topic) LIKE LOWER(?) OR LOWER(?) LIKE '%' || LOWER(topic) || '%'
        ORDER BY id DESC
        """, (topic, f"%{topic}%", topic))
        question_rows = cursor.fetchall()

        if not question_rows:
            return None

        cursor.execute("""
        SELECT topic_name, total_questions, correct_answers, last_attempted
        FROM topics
        WHERE LOWER(topic_name) = LOWER(?) OR LOWER(topic_name) LIKE LOWER(?)
        LIMIT 1
        """, (topic, f"%{topic}%"))
        topic_row = cursor.fetchone()

    graded_questions = []
    correct_count = 0
    for q_row in question_rows:
        is_corr = bool(q_row["is_correct"])
        if is_corr:
            correct_count += 1
        graded_questions.append({
            "question_id": f"q_{q_row['id']}",
            "question_text": q_row["question_text"],
            "question_type": q_row["question_type"],
            "user_answer": q_row["user_answer"],
            "correct_answer": q_row["correct_answer"],
            "is_correct": is_corr,
            "explanation": q_row["feedback"],
            "topic": q_row["topic"]
        })

    total_q = len(graded_questions)
    score_percentage = round((correct_count / total_q * 100) if total_q > 0 else 0.0, 1)
    last_time = question_rows[0]["created_at"] if question_rows else None

    return {
        "quiz_id": f"topic_{topic.replace(' ', '_')}",
        "topic": topic_row["topic_name"] if topic_row else topic,
        "total_questions": total_q,
        "correct_count": correct_count,
        "score_percentage": score_percentage,
        "graded_questions": graded_questions,
        "recorded_at": last_time or datetime.datetime.now().isoformat()
    }


# =========================================================================
# Past Paper Analyzer Database Operations
# =========================================================================


def save_past_paper(
    filename: str,
    title: str,
    year: Optional[str],
    subject: Optional[str],
    total_questions: int,
    total_marks: float,
    raw_text: str,
    questions: List[Dict[str, Any]]
) -> int:
    """Save an analyzed past paper and its individual extracted questions."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Delete existing entry if file re-uploaded
        cursor.execute("SELECT id FROM past_papers WHERE filename = ?", (filename,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("DELETE FROM past_paper_questions WHERE paper_id = ?", (existing["id"],))
            cursor.execute("DELETE FROM past_papers WHERE id = ?", (existing["id"],))

        cursor.execute("""
        INSERT INTO past_papers (filename, title, year, subject, total_questions, total_marks, raw_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (filename, title, year or "Recent", subject or "General", total_questions, total_marks, raw_text))
        
        paper_id = cursor.lastrowid

        for q in questions:
            cursor.execute("""
            INSERT INTO past_paper_questions (
                paper_id, question_number, question_text, topic, subtopic, marks, question_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                paper_id,
                q.get("question_number", ""),
                q.get("question_text", ""),
                q.get("topic", "General"),
                q.get("subtopic", ""),
                q.get("marks", 5.0),
                q.get("question_type", "theory")
            ))

        conn.commit()
        return paper_id


def list_past_paper_subjects() -> List[Dict[str, Any]]:
    """Return distinct subjects across uploaded papers with counts and total marks."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT p.subject,
               COUNT(DISTINCT p.id) as paper_count,
               (SELECT COUNT(*) FROM past_paper_questions q2 JOIN past_papers p2 ON q2.paper_id = p2.id WHERE p2.subject = p.subject) as question_count,
               COALESCE(SUM(p.total_marks), 0.0) as total_marks,
               MIN(p.year) as min_year,
               MAX(p.year) as max_year
        FROM past_papers p
        GROUP BY p.subject
        ORDER BY paper_count DESC, p.subject ASC
        """)
        return [dict(row) for row in cursor.fetchall() if row["subject"]]


def list_past_papers(subject: Optional[str] = None) -> List[Dict[str, Any]]:
    """List all analyzed previous years' question papers, optionally filtered by subject."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if subject and subject != "All":
            cursor.execute("""
            SELECT id, filename, title, year, subject, total_questions, total_marks, uploaded_at
            FROM past_papers
            WHERE subject = ?
            ORDER BY uploaded_at DESC
            """, (subject,))
        else:
            cursor.execute("""
            SELECT id, filename, title, year, subject, total_questions, total_marks, uploaded_at
            FROM past_papers
            ORDER BY uploaded_at DESC
            """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_past_paper(paper_id: int) -> Optional[Dict[str, Any]]:
    """Get single past paper with all its extracted questions."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM past_papers WHERE id = ?", (paper_id,))
        paper_row = cursor.fetchone()
        if not paper_row:
            return None

        cursor.execute("""
        SELECT id, paper_id, question_number, question_text, topic, subtopic, marks, question_type, created_at
        FROM past_paper_questions
        WHERE paper_id = ?
        ORDER BY id ASC
        """, (paper_id,))
        questions = [dict(r) for r in cursor.fetchall()]

        paper = dict(paper_row)
        paper["questions"] = questions
        return paper


def delete_past_paper(paper_id: int) -> bool:
    """Delete a past paper and its associated questions."""
    try:
        init_db()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM past_paper_questions WHERE paper_id = ?", (paper_id,))
            cursor.execute("DELETE FROM past_papers WHERE id = ?", (paper_id,))
            conn.commit()
        return True
    except Exception:
        return False


def get_past_paper_questions(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    year: Optional[str] = None,
    paper_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """Retrieve past paper questions with subject, topic, year, and search filters."""
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
        SELECT q.id, q.paper_id, q.question_number, q.question_text, q.topic, q.subtopic,
               q.marks, q.question_type, q.created_at,
               p.filename, p.title as paper_title, p.year as paper_year, p.subject as paper_subject
        FROM past_paper_questions q
        JOIN past_papers p ON q.paper_id = p.id
        WHERE 1=1
        """
        params = []

        if subject and subject != "All":
            query += " AND p.subject = ?"
            params.append(subject)
        if topic and topic != "All":
            query += " AND q.topic = ?"
            params.append(topic)
        if year and year != "All":
            query += " AND p.year = ?"
            params.append(year)
        if paper_id is not None:
            query += " AND q.paper_id = ?"
            params.append(paper_id)
        if search:
            query += " AND (q.question_text LIKE ? OR q.topic LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY q.marks DESC, q.id ASC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def get_past_paper_analysis(subject: Optional[str] = None) -> Dict[str, Any]:
    """
    Compute aggregate statistics across past papers, optionally segregated by subject:
    - Topic frequency (how many questions per topic)
    - Topic marks weightage (total marks & % of exam marks)
    - Paper occurrences (in how many distinct exam papers the topic appeared)
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        where_paper = " WHERE 1=1"
        where_paper_params = []
        if subject and subject != "All":
            where_paper += " AND subject = ?"
            where_paper_params.append(subject)

        cursor.execute(
            f"SELECT COUNT(*), SUM(total_marks), COUNT(DISTINCT year) FROM past_papers {where_paper}",
            where_paper_params
        )
        total_papers_count, total_marks_sum, distinct_years = cursor.fetchone()
        total_papers_count = total_papers_count or 0
        total_marks_sum = total_marks_sum or 0.0

        if total_papers_count == 0:
            return {
                "active_subject": subject or "All",
                "total_papers": 0,
                "total_questions": 0,
                "total_marks": 0.0,
                "distinct_years": 0,
                "topic_analysis": [],
                "recent_papers": []
            }

        where_q = " WHERE 1=1"
        where_q_params = []
        if subject and subject != "All":
            where_q += " AND p.subject = ?"
            where_q_params.append(subject)

        cursor.execute(f"""
        SELECT q.topic,
               COUNT(q.id) as question_count,
               SUM(q.marks) as total_topic_marks,
               COUNT(DISTINCT q.paper_id) as paper_occurrences
        FROM past_paper_questions q
        JOIN past_papers p ON q.paper_id = p.id
        {where_q}
        GROUP BY q.topic
        ORDER BY total_topic_marks DESC, question_count DESC
        """, where_q_params)
        topic_rows = cursor.fetchall()

        cursor.execute(
            f"SELECT COUNT(*) FROM past_paper_questions q JOIN past_papers p ON q.paper_id = p.id {where_q}",
            where_q_params
        )
        total_questions_count = cursor.fetchone()[0] or 0

        topic_analysis = []
        for row in topic_rows:
            t_name = row["topic"]
            q_cnt = row["question_count"]
            m_sum = float(row["total_topic_marks"] or 0.0)
            p_occ = row["paper_occurrences"]

            marks_pct = round((m_sum / total_marks_sum * 100) if total_marks_sum > 0 else 0.0, 1)
            paper_freq_pct = round((p_occ / total_papers_count * 100) if total_papers_count > 0 else 0.0, 1)

            # Sample questions for this topic
            sample_query = """
            SELECT q.question_number, q.question_text, q.marks, p.year, p.title as paper_title
            FROM past_paper_questions q
            JOIN past_papers p ON q.paper_id = p.id
            WHERE q.topic = ?
            """
            sample_params = [t_name]
            if subject and subject != "All":
                sample_query += " AND p.subject = ?"
                sample_params.append(subject)
            sample_query += " ORDER BY q.marks DESC LIMIT 3"

            cursor.execute(sample_query, sample_params)
            samples = [dict(s) for s in cursor.fetchall()]

            # Determine yield category based on marks percentage
            if marks_pct >= 15.0 or (paper_freq_pct >= 66.0 and marks_pct >= 10.0):
                yield_rating = "High Yield"
            elif marks_pct >= 7.0:
                yield_rating = "Medium Yield"
            else:
                yield_rating = "Low Yield"

            topic_analysis.append({
                "topic": t_name,
                "question_count": q_cnt,
                "total_marks": m_sum,
                "marks_percentage": marks_pct,
                "paper_occurrences": p_occ,
                "paper_frequency_pct": paper_freq_pct,
                "yield_rating": yield_rating,
                "sample_questions": samples
            })

        # List recent papers matching filter
        cursor.execute(f"""
        SELECT id, filename, title, year, subject, total_questions, total_marks, uploaded_at
        FROM past_papers
        {where_paper}
        ORDER BY uploaded_at DESC
        LIMIT 10
        """, where_paper_params)
        recent_papers = [dict(r) for r in cursor.fetchall()]

    return {
        "active_subject": subject or "All",
        "total_papers": total_papers_count,
        "total_questions": total_questions_count,
        "total_marks": total_marks_sum,
        "distinct_years": distinct_years or 0,
        "topic_analysis": topic_analysis,
        "recent_papers": recent_papers
    }


def get_priority_matrix(subject: Optional[str] = None) -> Dict[str, Any]:
    """
    Cross-references past paper topic weightage with student mastery
    to prioritize topics that are BOTH weak and highly likely to be asked in the exam.
    Supports subject-level segregation.
    """
    past_analysis = get_past_paper_analysis(subject=subject)
    student_stats = get_topic_statistics()

    # Map student stats by topic name
    student_map: Dict[str, Dict[str, Any]] = {s["topic"].strip().lower(): s for s in student_stats}

    prioritized_topics = []
    high_yield_weak_spots_count = 0
    critical_count = 0

    for item in past_analysis.get("topic_analysis", []):
        t_name = item["topic"]
        marks_pct = item["marks_percentage"]
        freq_pct = item["paper_frequency_pct"]
        total_marks = item["total_marks"]
        q_count = item["question_count"]

        # Frequency acts as a credibility multiplier on marks weightage (scaled 0.6x to 1.0x)
        exam_importance = round(marks_pct * (0.6 + 0.4 * (freq_pct / 100.0)), 1)

        # Check student mastery
        s_data = student_map.get(t_name.strip().lower())
        if not s_data:
            # Fuzzy match check
            for k, v in student_map.items():
                if k in t_name.lower() or t_name.lower() in k:
                    s_data = v
                    break

        if s_data and s_data["total_questions"] > 0:
            accuracy = s_data["accuracy"]
            attempts = s_data["total_questions"]
            weakness_score = 100.0 - accuracy
            status = s_data["status"]
        else:
            accuracy = 0.0
            attempts = 0
            weakness_score = 75.0  # Assumed uncertainty penalty for untested topics
            status = "Unattempted"

        # Composite priority score: Exam Weight * Weakness
        composite_score = round((exam_importance * (weakness_score / 100.0)) * 1.5, 1)

        # Strict weight criteria:
        # Critical Priority requires substantial exam weight (marks_pct >= 12% OR >=10% with high recurrence)
        # Topics with < 5% marks are strictly low priority.
        is_heavy_weight = marks_pct >= 12.0 or (marks_pct >= 10.0 and freq_pct >= 66.0)
        is_good_weight = marks_pct >= 8.0

        if is_heavy_weight and (accuracy < 60.0 or status == "Unattempted"):
            priority_level = "critical"
            critical_count += 1
            high_yield_weak_spots_count += 1
            if status == "Unattempted":
                recommendation = f"High-Yield exam favorite (~{marks_pct}% of marks across papers). Not yet practiced in quizzes — study immediately."
            else:
                recommendation = f"Critical Exam Priority. Worth ~{marks_pct}% of exam marks with only {accuracy}% quiz accuracy. Needs immediate focus."
        elif is_good_weight and (accuracy < 75.0 or status == "Unattempted"):
            priority_level = "high"
            high_yield_weak_spots_count += 1
            recommendation = f"Frequent Exam Topic (~{marks_pct}% weightage). Practice questions to push accuracy above 80%."
        elif is_good_weight and accuracy >= 80.0:
            priority_level = "maintained"
            recommendation = f"Exam Favorite & Mastered (~{marks_pct}% weightage, {accuracy}% accuracy). Keep sharp with periodic quizzes."
        elif marks_pct >= 5.0 or (accuracy < 60.0 and status != "Unattempted"):
            priority_level = "medium"
            recommendation = f"Moderate Exam Weight (~{marks_pct}%). Review after critical and high-yield topics."
        else:
            priority_level = "low"
            recommendation = f"Low Exam Weight (~{marks_pct}% of past marks). Safe to review last."

        prioritized_topics.append({
            "topic": t_name,
            "exam_marks": total_marks,
            "exam_marks_pct": marks_pct,
            "exam_frequency_pct": freq_pct,
            "exam_importance": exam_importance,
            "question_count": q_count,
            "quiz_attempts": attempts,
            "quiz_accuracy": accuracy,
            "mastery_status": status,
            "priority_level": priority_level,
            "priority_score": composite_score,
            "recommendation": recommendation,
            "sample_questions": item["sample_questions"]
        })

    # Sort descending by priority_score
    prioritized_topics.sort(key=lambda x: (
        0 if x["priority_level"] == "critical" else 1 if x["priority_level"] == "high" else 2 if x["priority_level"] == "medium" else 3,
        -x["priority_score"]
    ))

    # Summary insight
    subj_label = f" for {subject}" if subject and subject != "All" else ""
    if critical_count > 0:
        insight = f"Found {critical_count} critical high-yield topics{subj_label} where past exams ask heavy marks but your quiz mastery is low or unattempted."
    elif high_yield_weak_spots_count > 0:
        insight = f"Found {high_yield_weak_spots_count} high-yield topics{subj_label} to focus on to maximize your exam score."
    elif past_analysis["total_papers"] > 0:
        insight = f"Great work! You have strong mastery over the most frequently asked exam topics{subj_label}."
    else:
        insight = f"Upload previous years' question papers{subj_label} to analyze topic weightages and identify high-yield weak spots."

    return {
        "active_subject": subject or "All",
        "total_papers_analyzed": past_analysis["total_papers"],
        "total_past_questions": past_analysis["total_questions"],
        "high_yield_weak_spots_count": high_yield_weak_spots_count,
        "critical_priority_count": critical_count,
        "summary_insight": insight,
        "prioritized_topics": prioritized_topics
    }


def reset_tracker(include_past_papers: bool = False) -> bool:
    """Clear quiz history and optionally past paper tracking data."""
    try:
        init_db()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM question_logs")
            cursor.execute("DELETE FROM quiz_attempts")
            cursor.execute("DELETE FROM topics")
            if include_past_papers:
                cursor.execute("DELETE FROM past_paper_questions")
                cursor.execute("DELETE FROM past_papers")
            conn.commit()
        return True
    except Exception:
        return False
