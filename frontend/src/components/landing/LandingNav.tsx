import { useState } from 'react'
import { motion } from 'motion/react'
import { Github, Sun, Moon, ArrowRight } from 'lucide-react'
import type { ThemePreference } from '../../hooks/useTheme'

interface LandingNavProps {
  preference: ThemePreference
  onSelectTheme: (next: ThemePreference) => void
  onLaunchApp: () => void
}

export function LandingNav({ preference, onSelectTheme, onLaunchApp }: LandingNavProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const navLinks = [
    { id: 'demo', label: 'Interactive Demo' },
    { id: 'privacy', label: 'Why Local AI' },
    { id: 'features', label: 'Features' },
    { id: 'quickstart', label: 'Quickstart' },
  ]

  const toggleTheme = () => {
    // Pure 2-way toggle: Light <-> Dark only, no system mode
    const isCurrentlyDark =
      preference === 'dark' ||
      (preference === 'system' && document.documentElement.getAttribute('data-theme') === 'dark')
    onSelectTheme(isCurrentlyDark ? 'light' : 'dark')
  }

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const elem = document.getElementById(targetId)
    if (!elem) return

    // Header height (64px) + comfortable 24px top margin so it never cuts off
    const headerOffset = 88
    const elementPosition = elem.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    const startPosition = window.pageYOffset
    const distance = offsetPosition - startPosition
    const duration = Math.min(800, Math.max(500, Math.abs(distance) * 0.4))
    let start: number | null = null

    // Luxurious easeInOutCubic curve
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const easeProgress = easeInOutCubic(progress)
      window.scrollTo(0, startPosition + distance * easeProgress)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }

    window.requestAnimationFrame(step)
  }

  return (
    <header className="landing-nav-header">
      <div className="landing-nav-container">
        {/* Brand */}
        <div className="landing-brand-group">
          <a
            href="#"
            className="landing-logo-link"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className="landing-logo-serif">Gist</span>
            <span className="landing-logo-badge">v1.0</span>
          </a>

          <div className="landing-status-pill" title="All processing happens on your local hardware">
            <span className="landing-status-dot" />
            <span className="landing-status-text">100% AIR-GAPPED & LOCAL</span>
          </div>
        </div>

        {/* Anchor Navigation with Sliding Hover Capsule */}
        <nav
          className="landing-nav-links"
          aria-label="Landing navigation"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {navLinks.map((link, idx) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className={`landing-nav-link ${hoveredIndex === idx ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredIndex(idx)}
              onClick={(e) => handleNavClick(e, link.id)}
            >
              {hoveredIndex === idx && (
                <motion.div
                  layoutId="nav-hover-pill"
                  className="nav-hover-indicator"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <span className="nav-link-label">{link.label}</span>
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="landing-nav-actions">
          {/* Theme switcher */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="landing-icon-btn"
            onClick={toggleTheme}
            aria-label={preference === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={preference === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {preference === 'dark' ? (
              <Moon size={17} strokeWidth={1.75} />
            ) : (
              <Sun size={17} strokeWidth={1.75} />
            )}
          </motion.button>

          {/* GitHub Repo */}
          <motion.a
            href="https://github.com/dev-Aarish/gist"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ transform: 'translateY(-1px)' }}
            whileTap={{ transform: 'scale(0.98)' }}
            className="landing-github-btn"
            title="View Gist on GitHub"
          >
            <Github size={15} strokeWidth={1.75} />
            <span>GitHub</span>
          </motion.a>

          {/* Launch App */}
          <motion.button
            type="button"
            whileHover={{ transform: 'translateY(-1px)' }}
            whileTap={{ transform: 'scale(0.98)' }}
            className="landing-launch-btn"
            onClick={onLaunchApp}
          >
            <span>Launch App</span>
            <ArrowRight size={14} strokeWidth={2} />
          </motion.button>
        </div>
      </div>
    </header>
  )
}
