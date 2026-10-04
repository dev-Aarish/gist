import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Github,
  ArrowRight,
  Terminal,
  HardDrive,
  FileCheck,
  Lock,
  ChevronDown,
} from 'lucide-react'
import type { ThemePreference } from '../hooks/useTheme'
import { ShaderBackground } from '../components/landing/ShaderBackground'
import { LandingNav } from '../components/landing/LandingNav'
import { QuickstartTerminal } from '../components/landing/QuickstartTerminal'
import { InteractiveWorkbench } from '../components/landing/InteractiveWorkbench'
import { PrivacyComparison } from '../components/landing/PrivacyComparison'
import { PrivacyPipeline } from '../components/landing/PrivacyPipeline'
import { FeatureSpotlight } from '../components/landing/FeatureSpotlight'
import { SupportedModels } from '../components/landing/SupportedModels'
import { LandingFooter } from '../components/landing/LandingFooter'

interface LandingScreenProps {
  preference: ThemePreference
  onSelectTheme: (next: ThemePreference) => void
}

export function LandingScreen({
  preference,
  onSelectTheme,
}: LandingScreenProps) {
  // Rotating headline word
  const words = ['exams.', 'finals.', 'lecture notes.', 'syllabi.', 'midterms.']
  const [wordIdx, setWordIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIdx((prev) => (prev + 1) % words.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [words.length])

  return (
    <div className="landing-root">
      {/* Dynamic Animated Grain Shader & Liquid Background */}
      <ShaderBackground theme={preference} />

      {/* Sticky Top Navigation */}
      <LandingNav
        preference={preference}
        onSelectTheme={onSelectTheme}
      />

      <main className="landing-main-content">
        {/* HERO SECTION */}
        <section className="landing-hero-section">
          <div className="landing-hero-container">
            {/* Staggered Content Animation Container */}
            <div className="hero-typography-block">
              {/* Main Headline (Dynamic Animated Word Flip) */}
              <motion.h1
                initial={{ opacity: 0, transform: 'translateY(16px)' }}
                whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                className="landing-hero-headline"
              >
                Ace your{' '}
                <span className="headline-flip-container">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={words[wordIdx]}
                      initial={{ opacity: 0, transform: 'translateY(18px) rotateX(-45deg)' }}
                      animate={{ opacity: 1, transform: 'translateY(0px) rotateX(0deg)' }}
                      exit={{ opacity: 0, transform: 'translateY(-18px) rotateX(45deg)' }}
                      transition={{ duration: 0.38, ease: [0.23, 1, 0.32, 1] }}
                      className="headline-word-highlight"
                    >
                      {words[wordIdx]}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <br />
                <span className="headline-italic">Without giving your notes to the cloud.</span>
              </motion.h1>

              {/* Subheading */}
              <motion.p
                initial={{ opacity: 0, transform: 'translateY(16px)' }}
                whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.45, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
                className="landing-hero-subhead"
              >
                Upload textbooks, lecture slides, and personal notes. Ask complex questions with page-exact
                citations, generate instant diagnostic quizzes, and master weak spots—powered by local
                AI running 100% privately on your machine.
              </motion.p>

              {/* Hero Action Buttons */}
              <motion.div
                initial={{ opacity: 0, transform: 'translateY(16px)' }}
                whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.45, delay: 0.16, ease: [0.23, 1, 0.32, 1] }}
                className="landing-hero-actions"
              >
                <motion.a
                  href="https://github.com/dev-Aarish/gist"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ transform: 'translateY(-2px)' }}
                  whileTap={{ transform: 'scale(0.98)' }}
                  className="hero-primary-cta"
                >
                  <Github size={18} strokeWidth={2} />
                  <span>Get on GitHub</span>
                  <ArrowRight size={15} strokeWidth={2} />
                </motion.a>

                <motion.a
                  href="#quickstart"
                  whileHover={{ transform: 'translateY(-2px)' }}
                  whileTap={{ transform: 'scale(0.98)' }}
                  className="hero-secondary-cta"
                  style={{ textDecoration: 'none' }}
                  onClick={(e) => {
                    e.preventDefault()
                    const elem = document.getElementById('quickstart')
                    if (!elem) return
                    const headerOffset = 88
                    const elementPosition = elem.getBoundingClientRect().top
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset
                    window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
                  }}
                >
                  <Terminal size={16} className="text-accent" />
                  <span>Quickstart Guide</span>
                </motion.a>
              </motion.div>

              {/* Trust Metrics Pill Row */}
              <motion.div
                initial={{ opacity: 0, transform: 'translateY(12px)' }}
                whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
                viewport={{ once: false, amount: 0.1 }}
                transition={{ duration: 0.4, delay: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="hero-trust-row"
              >
                <div className="trust-item">
                  <Lock size={13} className="text-success" />
                  <span>0 KB Sent to Cloud</span>
                </div>
                <div className="trust-sep">·</div>
                <div className="trust-item">
                  <FileCheck size={13} className="text-accent" />
                  <span>Page-Exact Citations</span>
                </div>
                <div className="trust-sep">·</div>
                <div className="trust-item">
                  <HardDrive size={13} className="text-accent" />
                  <span>100% Offline Capable</span>
                </div>
              </motion.div>
            </div>

            {/* Quickstart Terminal Card in Hero */}
            <motion.div
              initial={{ opacity: 0, transform: 'translateY(24px)' }}
              whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
              viewport={{ once: false, amount: 0.1 }}
              transition={{ duration: 0.5, delay: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="hero-terminal-container"
            >
              <QuickstartTerminal />
            </motion.div>
          </div>

          <div className="hero-scroll-indicator">
            <a
              href="#demo"
              className="scroll-hint-link"
              aria-label="Scroll to interactive demo"
              onClick={(e) => {
                e.preventDefault()
                const elem = document.getElementById('demo')
                if (!elem) return
                const headerOffset = 88
                const elementPosition = elem.getBoundingClientRect().top
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset
                const startPosition = window.pageYOffset
                const distance = offsetPosition - startPosition
                const duration = Math.min(800, Math.max(500, Math.abs(distance) * 0.4))
                let start: number | null = null
                const easeInOutCubic = (t: number) =>
                  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
                const step = (timestamp: number) => {
                  if (!start) start = timestamp
                  const progress = Math.min((timestamp - start) / duration, 1)
                  window.scrollTo(0, startPosition + distance * easeInOutCubic(progress))
                  if (progress < 1) window.requestAnimationFrame(step)
                }
                window.requestAnimationFrame(step)
              }}
            >
              <span>Explore Interactive Demo</span>
              <ChevronDown size={14} className="drift-subtle" />
            </a>
          </div>
        </section>

        {/* INTERACTIVE WORKBENCH DEMO */}
        <motion.section
          initial={{ opacity: 0, transform: 'translateY(32px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.08 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="landing-section-workbench"
        >
          <InteractiveWorkbench />
        </motion.section>

        {/* ANIMATED PRIVACY PIPELINE */}
        <motion.section
          initial={{ opacity: 0, transform: 'translateY(32px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.12 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="landing-section-pipeline"
        >
          <PrivacyPipeline />
        </motion.section>

        {/* WHY LOCAL AI / PRIVACY COMPARISON */}
        <PrivacyComparison />

        {/* FEATURE SPOTLIGHT */}
        <FeatureSpotlight />

        {/* SUPPORTED LOCAL MODELS */}
        <SupportedModels />

        {/* QUICKSTART SECTION */}
        <section className="landing-section" id="quickstart">
          <motion.div
            initial={{ opacity: 0, transform: 'translateY(24px)' }}
            whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
            viewport={{ once: false, amount: 0.2 }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            className="landing-section-header"
          >
            <div className="section-title-wrap">
              <h2 className="section-headline">Ready in under 60 seconds.</h2>
              <p className="section-subhead">
                No subscription. No account creation. No cloud dependencies. Just clone and study.
              </p>
            </div>
          </motion.div>

          <div className="quickstart-steps-grid">
            <motion.div
              initial={{ opacity: 0, transform: 'translateY(28px)' }}
              whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.45, delay: 0.0, ease: [0.23, 1, 0.32, 1] }}
              whileHover={{ transform: 'translateY(-3px)' }}
              className="step-card"
            >
              <span className="step-badge">STEP 1</span>
              <h3 className="step-title">Install Ollama & Pull Model</h3>
              <p className="step-desc">
                Download Ollama (or LM Studio) and pull your preferred open-weight model with one command.
              </p>
              <pre className="step-code"><code>ollama pull qwen2.5:7b</code></pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, transform: 'translateY(28px)' }}
              whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.45, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
              whileHover={{ transform: 'translateY(-3px)' }}
              className="step-card"
            >
              <span className="step-badge">STEP 2</span>
              <h3 className="step-title">Clone the Repository</h3>
              <p className="step-desc">
                Clone Gist from GitHub to your machine. Everything runs locally in Python & React.
              </p>
              <pre className="step-code"><code>git clone https://github.com/dev-Aarish/gist.git</code></pre>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, transform: 'translateY(28px)' }}
              whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
              viewport={{ once: false, amount: 0.15 }}
              transition={{ duration: 0.45, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
              whileHover={{ transform: 'translateY(-3px)' }}
              className="step-card"
            >
              <span className="step-badge">STEP 3</span>
              <h3 className="step-title">Launch & Study</h3>
              <p className="step-desc">
                Run the start script. Drop your lecture notes, slides, and syllabus into Gist and start drilling.
              </p>
              <pre className="step-code"><code>cd gist && ./start.sh</code></pre>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, transform: 'translateY(24px)' }}
            whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
            viewport={{ once: false, amount: 0.15 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="quickstart-cta-banner"
          >
            <div className="banner-text">
              <h3 className="banner-title">Start preparing for your exams privately today.</h3>
              <p className="banner-sub">MIT Licensed · Open Source on GitHub</p>
            </div>
            <div className="banner-actions">
              <motion.a
                href="https://github.com/dev-Aarish/gist"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ transform: 'translateY(-2px)' }}
                whileTap={{ transform: 'scale(0.98)' }}
                className="banner-primary-btn"
              >
                <Github size={17} />
                <span>Star & Clone on GitHub</span>
              </motion.a>
            </div>
          </motion.div>
        </section>
      </main>

      {/* FOOTER */}
      <LandingFooter />
    </div>
  )
}
