import type { CSSProperties } from 'react'
import type { QuizQuestion } from '../lib/types'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function optionText(option: string): string {
  return option.replace(/^[A-Fa-f][).]\s*/, '')
}

export function QuizCard({
  question,
  index,
  total,
  answer,
  onAnswer,
}: {
  question: QuizQuestion
  index: number
  total: number
  answer: string
  onAnswer: (value: string) => void
}) {
  const pct = total > 0 ? (index + 1) / total : 0

  return (
    <section className="qcard" aria-labelledby={`q-${question.id}`}>
      <div className="qcard__progress">
        <span
          className="qcard__progress-fill"
          style={{ '--pct': pct } as CSSProperties}
        />
      </div>

      <div className="qcard__body">
        <div className="qcard__meta">
          <span className="t-label">
            Question {index + 1} of {total}
          </span>
          <span className="t-label">
            {question.type === 'mcq' ? 'Multiple choice' : 'Short answer'}
          </span>
        </div>

        <h2 className="t-h2" id={`q-${question.id}`}>
          {question.question}
        </h2>

        {question.type === 'mcq' ? (
          <div className="opts" role="group" aria-label="Answer options">
            {question.options.map((option, optionIndex) => {
              const selected = answer === option
              return (
                <button
                  key={`${question.id}-${optionIndex}`}
                  type="button"
                  className={`opt${selected ? ' opt--selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => onAnswer(option)}
                >
                  <span className="opt__key" aria-hidden="true">
                    {LETTERS[optionIndex] ?? optionIndex + 1}
                  </span>
                  <span className="opt__text">{optionText(option)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="answer-field">
            <label className="t-label" htmlFor={`answer-${question.id}`}>
              Your answer
            </label>
            <textarea
              id={`answer-${question.id}`}
              className="textarea"
              value={answer}
              placeholder="Write the idea in a sentence or two."
              onChange={(event) => onAnswer(event.target.value)}
            />
          </div>
        )}

        <div>
          <span className="chip">{question.topic}</span>
        </div>
      </div>
    </section>
  )
}
