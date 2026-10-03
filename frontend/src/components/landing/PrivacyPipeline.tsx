import { motion } from 'motion/react'
import { FileText, Cpu, Database, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'

export function PrivacyPipeline() {
  const steps = [
    {
      icon: FileText,
      title: 'Your Notes & Slides',
      subtitle: 'PDFs stay in local sandbox',
      badge: 'Local Disk',
      tagColor: 'clay',
    },
    {
      icon: Database,
      title: 'Vector Search Index',
      subtitle: 'Local ChromaDB / SQLite',
      badge: 'Sub-millisecond',
      tagColor: 'ochre',
    },
    {
      icon: Cpu,
      title: 'Local LLM Inference',
      subtitle: 'Ollama / Metal / CUDA',
      badge: '100% On-Device',
      tagColor: 'teal',
    },
    {
      icon: ShieldCheck,
      title: 'Verified Proof',
      subtitle: 'Page-exact citations',
      badge: 'Air-Gapped',
      tagColor: 'success',
    },
  ]

  return (
    <div className="privacy-pipeline-card">
      <div className="pipeline-header">
        <div className="pipeline-title-group">
          <div className="pipeline-live-indicator">
            <span className="live-radar-ring" />
            <span className="live-radar-dot" />
          </div>
          <span className="pipeline-heading-mono">AIR-GAPPED DATA FLOW PIPELINE</span>
        </div>
        <div className="pipeline-telemetry-badge">
          <Lock size={12} className="text-success" />
          <span>EXTERNAL TELEMETRY: 0.000 KB</span>
        </div>
      </div>

      <div className="pipeline-track">
        {/* Animated Moving Light Beam along the track */}
        <div className="pipeline-beam-runner" />

        <div className="pipeline-steps-container">
          {steps.map((step, idx) => {
            const Icon = step.icon
            return (
              <div key={idx} className="pipeline-step-node">
                <motion.div
                  initial={{ opacity: 0, transform: 'scale(0.92)' }}
                  whileInView={{ opacity: 1, transform: 'scale(1)' }}
                  viewport={{ once: false, amount: 0.2 }}
                  transition={{ duration: 0.4, delay: idx * 0.1, ease: [0.23, 1, 0.32, 1] }}
                  className="step-node-bubble"
                >
                  <div className={`step-node-icon tag-${step.tagColor}`}>
                    <Icon size={20} strokeWidth={1.75} />
                  </div>
                  <span className={`step-node-badge badge-${step.tagColor}`}>{step.badge}</span>
                  <span className="step-node-title">{step.title}</span>
                  <span className="step-node-sub">{step.subtitle}</span>
                </motion.div>
                {idx < steps.length - 1 && (
                  <div className="pipeline-connector-line">
                    <span className="connector-dot-pulse" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="pipeline-footer-banner">
        <div className="footer-status-item">
          <CheckCircle2 size={14} className="text-success" />
          <span>No internet required during study sessions</span>
        </div>
        <div className="footer-status-item">
          <CheckCircle2 size={14} className="text-success" />
          <span>No API billing or OpenAI / Anthropic accounts</span>
        </div>
        <div className="footer-status-item">
          <CheckCircle2 size={14} className="text-success" />
          <span>Zero danger of professor syllabus leaks</span>
        </div>
      </div>
    </div>
  )
}
