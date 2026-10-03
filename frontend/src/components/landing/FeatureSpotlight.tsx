import { motion } from 'motion/react'
import { BookmarkCheck, CircleHelp, Brain } from 'lucide-react'

export function FeatureSpotlight() {
  const features = [
    {
      type: 'clay',
      icon: BookmarkCheck,
      title: 'Verified Page-Exact Citations',
      desc: 'Never second-guess whether the AI hallucinated. Every generated explanation quotes the exact page, chapter, and line in your uploaded PDF.',
      tag: 'Grounded Retrieval',
      citation: 'Lecture_04.pdf · p. 28',
    },
    {
      type: 'ochre',
      icon: CircleHelp,
      title: 'Active Recall Diagnostic Quizzes',
      desc: 'Instantly turn dry 80-page slide decks into challenging multiple-choice questions with thorough conceptual explanations.',
      tag: 'Spaced Retrieval',
      citation: '5 Questions · Conceptual',
    },
    {
      type: 'teal',
      icon: Brain,
      title: 'Automated Weak-Spot Diagnostics',
      desc: "Gist tracks which topics you struggle on and flags knowledge gaps, so you only spend time studying what you haven't mastered yet.",
      tag: 'Adaptive Mastery',
      citation: 'Focus on Weak Topics',
    },
  ]

  return (
    <section className="landing-section" id="features">
      {/* Section Header with Scroll Reveal */}
      <motion.div
        initial={{ opacity: 0, transform: 'translateY(24px)' }}
        whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
        viewport={{ once: false, amount: 0.2 }}
        transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        className="landing-section-header"
      >
        <div className="section-title-wrap">
          <h2 className="section-headline">
            Built for how top students actually study.
          </h2>
          <p className="section-subhead">
            Passive reading is slow. Gist transforms hundreds of pages of lecture slides into an active, verified feedback loop.
          </p>
        </div>
      </motion.div>

      {/* Staggered Features Grid */}
      <div className="features-editorial-grid">
        {features.map((feature, idx) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, transform: 'translateY(28px)' }}
              whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.45, delay: idx * 0.1, ease: [0.23, 1, 0.32, 1] }}
              whileHover={{ transform: 'translateY(-4px)' }}
              className={`feature-card feature-tile-${feature.type}`}
            >
              <div className="feature-card-accent" />
              <div className="feature-icon-box">
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <h3 className="feature-card-title">{feature.title}</h3>
              <p className="feature-card-desc">{feature.desc}</p>
              <div className="feature-visual-chip">
                <span className="visual-chip-tag">{feature.tag}</span>
                <span className="visual-chip-mono">{feature.citation}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
