import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Zap, HardDrive } from 'lucide-react'

export function SupportedModels() {
  const [selectedModel, setSelectedModel] = useState<string>('qwen')

  const models = [
    {
      id: 'qwen',
      name: 'Qwen 2.5 (7B / 14B)',
      provider: 'Alibaba Cloud · Open Weights',
      badge: 'Recommended for STEM',
      ram: '8 GB – 16 GB Unified Memory',
      speed: '40–75 tok/s on Apple Silicon / RTX',
      cmd: 'ollama pull qwen2.5:7b',
      strengths: 'Excels at complex academic reasoning, STEM proofs, code, and direct citation extraction.',
    },
    {
      id: 'llama',
      name: 'Llama 3.2 (3B / 1B)',
      provider: 'Meta AI · Open Weights',
      badge: 'Ultra-Light & Instant',
      ram: '4 GB – 8 GB RAM',
      speed: '80–120 tok/s on standard laptops',
      cmd: 'ollama pull llama3.2:3b',
      strengths: 'Lightning fast on lightweight laptops with near-instant quiz generation and zero battery drain.',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek R1 Distill (8B)',
      provider: 'DeepSeek AI · Reasoning',
      badge: 'Deep Chain-of-Thought',
      ram: '8 GB – 16 GB RAM',
      speed: '30–50 tok/s',
      cmd: 'ollama pull deepseek-r1:8b',
      strengths: 'Detailed step-by-step thinking for multi-step physics, math, and algorithmic examination problems.',
    },
    {
      id: 'mistral',
      name: 'Mistral 7B / Nemo (12B)',
      provider: 'Mistral AI · Open Weights',
      badge: 'Editorial & Humanities',
      ram: '8 GB – 16 GB RAM',
      speed: '35–60 tok/s',
      cmd: 'ollama pull mistral',
      strengths: 'Clean, dense summaries and essay-style exam prep for history, economics, and literature.',
    },
  ]

  const active = models.find((m) => m.id === selectedModel) || models[0]

  return (
    <section className="landing-section" id="models">
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
            Compatible with any open-weight model.
          </h2>
          <p className="section-subhead">
            Switch between high-speed compact models and deep reasoning models with zero vendor lock-in.
          </p>
        </div>
      </motion.div>

      <div className="models-interactive-layout">
        {/* Model Selector Buttons */}
        <motion.div
          initial={{ opacity: 0, transform: 'translateY(20px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
          className="model-selector-list"
        >
          {models.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              whileHover={{ transform: 'translateX(3px)' }}
              whileTap={{ transform: 'scale(0.99)' }}
              className={`model-select-card ${selectedModel === m.id ? 'active' : ''}`}
              onClick={() => setSelectedModel(m.id)}
            >
              <div className="model-card-top">
                <span className="model-name">{m.name}</span>
                <span className="model-badge-tag">{m.badge}</span>
              </div>
              <span className="model-provider">{m.provider}</span>
            </motion.button>
          ))}
        </motion.div>

        {/* Active Model Spec Detail with Animated Morph */}
        <motion.div
          initial={{ opacity: 0, transform: 'translateY(24px)' }}
          whileInView={{ opacity: 1, transform: 'translateY(0px)' }}
          viewport={{ once: false, amount: 0.15 }}
          transition={{ duration: 0.45, delay: 0.16, ease: [0.23, 1, 0.32, 1] }}
          className="model-spec-panel"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, transform: 'translateY(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(-6px)' }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <div className="spec-head">
                <div>
                  <h3 className="spec-title">{active.name}</h3>
                  <span className="spec-provider-sub">{active.provider}</span>
                </div>
                <span className="spec-badge-accent">{active.badge}</span>
              </div>

              <p className="spec-desc">{active.strengths}</p>

              <div className="spec-metrics-grid">
                <div className="metric-box">
                  <HardDrive size={14} className="text-accent" />
                  <div className="metric-content">
                    <span className="metric-label">Memory Footprint</span>
                    <span className="metric-val">{active.ram}</span>
                  </div>
                </div>

                <div className="metric-box">
                  <Zap size={14} className="text-accent" />
                  <div className="metric-content">
                    <span className="metric-label">Typical Speed</span>
                    <span className="metric-val">{active.speed}</span>
                  </div>
                </div>
              </div>

              <div className="spec-cmd-box">
                <span className="spec-cmd-label">Pull model via terminal:</span>
                <code className="spec-code">$ {active.cmd}</code>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
