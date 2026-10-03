import { motion } from 'motion/react'
import { ShieldCheck, ShieldAlert, WifiOff, Cpu, HardDrive, Check, X } from 'lucide-react'

export function PrivacyComparison() {
  const hardwareBadges = [
    { icon: Cpu, label: 'Apple Silicon Metal / NVIDIA CUDA / Intel AVX-512' },
    { icon: HardDrive, label: 'Local Vector Storage (ChromaDB + SQLite)' },
    { icon: WifiOff, label: '100% Air-Gapped Operation' },
  ]

  return (
    <section className="landing-section" id="privacy">
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
            Why local AI matters for students.
          </h2>
          <p className="section-subhead">
            Your university notes, unreleased exam papers, and personal research should belong to you alone—not corporate training datasets.
          </p>
        </div>
      </motion.div>

      <div className="privacy-cards-grid">
        {/* Cloud AI Card (Anti-pattern) */}
        <motion.div
          initial={{ opacity: 0, transform: 'translateY(24px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
          className="privacy-card card-cloud"
        >
          <div className="privacy-card-header">
            <div className="privacy-icon-pill icon-danger">
              <ShieldAlert size={16} />
              <span>Typical Cloud AI</span>
            </div>
            <span className="privacy-card-meta">ChatGPT / Claude / Copilot</span>
          </div>

          <div className="privacy-card-body">
            <ul className="comparison-list">
              <li className="comparison-item item-bad">
                <X size={15} className="text-danger" />
                <span>Lecture slides and student documents uploaded to external cloud servers</span>
              </li>
              <li className="comparison-item item-bad">
                <X size={15} className="text-danger" />
                <span>Queries recorded in remote telemetry logs</span>
              </li>
              <li className="comparison-item item-bad">
                <X size={15} className="text-danger" />
                <span>Requires constant internet; dead on flights or offline study spots</span>
              </li>
              <li className="comparison-item item-bad">
                <X size={15} className="text-danger" />
                <span>Risk of academic integrity or copyright issues with professor material</span>
              </li>
            </ul>
          </div>
        </motion.div>

        {/* Gist Local Card (Hero solution) */}
        <motion.div
          initial={{ opacity: 0, transform: 'translateY(24px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.45, delay: 0.16, ease: [0.23, 1, 0.32, 1] }}
          whileHover={{ transform: 'translateY(-3px)' }}
          className="privacy-card card-gist"
        >
          <div className="privacy-card-header">
            <div className="privacy-icon-pill icon-success">
              <ShieldCheck size={16} />
              <span>Gist Local-First</span>
            </div>
            <span className="privacy-card-meta">Ollama + Local Vector Index</span>
          </div>

          <div className="privacy-card-body">
            <ul className="comparison-list">
              <li className="comparison-item item-good">
                <Check size={15} className="text-success" />
                <span>100% On-Device: embeddings & weights execute entirely on your hardware</span>
              </li>
              <li className="comparison-item item-good">
                <Check size={15} className="text-success" />
                <span>Zero telemetry: 0 KB sent to external networks or servers</span>
              </li>
              <li className="comparison-item item-good">
                <Check size={15} className="text-success" />
                <span>True offline capability: study anywhere with zero latency</span>
              </li>
              <li className="comparison-item item-good">
                <Check size={15} className="text-success" />
                <span>Completely private: safe for proprietary syllabi, slides, and exam notes</span>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>

      {/* Hardware Architecture Badges */}
      <motion.div
        initial={{ opacity: 0, transform: 'translateY(16px)' }}
        whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
        viewport={{ once: false, amount: 0.15 }}
        transition={{ duration: 0.4, delay: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="hardware-badges-row"
      >
        {hardwareBadges.map((badge, idx) => {
          const Icon = badge.icon
          return (
            <motion.div
              key={idx}
              whileHover={{ transform: 'translateY(-2px)' }}
              className="hardware-badge"
            >
              <Icon size={14} className="text-accent" />
              <span>{badge.label}</span>
            </motion.div>
          )
        })}
      </motion.div>
    </section>
  )
}
