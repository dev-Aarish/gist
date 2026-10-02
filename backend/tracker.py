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
        ORDER BY total_questions DESC
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


def reset_tracker() -> bool:
    """Clear all quiz history and tracking data."""
    try:
        init_db()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM question_logs")
            cursor.execute("DELETE FROM quiz_attempts")
            cursor.execute("DELETE FROM topics")
            conn.commit()
        return True
    except Exception:
        return False
