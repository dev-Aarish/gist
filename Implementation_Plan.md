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

