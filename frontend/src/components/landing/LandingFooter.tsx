import { ArrowUp, Shield, Github } from 'lucide-react'

export function LandingFooter() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="landing-footer">
      <div className="landing-footer-container">
        <div className="footer-top-row">
          <div className="footer-brand-col">
            <span className="footer-logo">Gist</span>
            <p className="footer-tagline">
              The private, offline-first exam study companion powered by local AI.
            </p>
            <div className="footer-privacy-note">
              <Shield size={13} className="text-success" />
              <span>Zero telemetry. MIT Licensed open-source software.</span>
            </div>
          </div>

          <div className="footer-links-col">
            <span className="footer-col-title">Navigation</span>
            <a href="#demo" className="footer-link">Interactive Demo</a>
            <a href="#privacy" className="footer-link">Privacy Architecture</a>
            <a href="#features" className="footer-link">Features</a>
            <a href="#quickstart" className="footer-link">Quickstart</a>
          </div>

          <div className="footer-links-col">
            <span className="footer-col-title">Open Source</span>
            <a
              href="https://github.com/dev-Aarish/gist"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              GitHub Repository ↗
            </a>
            <a
              href="https://github.com/dev-Aarish/gist/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              Report an Issue ↗
            </a>
            <a
              href="https://github.com/dev-Aarish/gist/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              MIT License ↗
            </a>
          </div>

          <div className="footer-action-col">
            <a
              href="https://github.com/dev-Aarish/gist"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-launch-btn"
              style={{ textDecoration: 'none', gap: '8px' }}
            >
              <Github size={15} />
              <span>Star on GitHub</span>
            </a>
            <button
              type="button"
              className="footer-top-btn"
              onClick={scrollToTop}
              title="Back to top"
            >
              <ArrowUp size={14} />
              <span>Back to Top</span>
            </button>
          </div>
        </div>

        <div className="footer-bottom-row">
          <span className="footer-copy">
            © {new Date().getFullYear()} Gist · Built for students and researchers who value privacy.
          </span>
          <span className="footer-offline-mono">
            ● 100% OFFLINE READY
          </span>
        </div>
      </div>
    </footer>
  )
}
