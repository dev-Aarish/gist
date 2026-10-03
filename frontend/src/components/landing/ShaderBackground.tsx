import { useEffect, useState } from 'react'
import { GrainGradient } from '@paper-design/shaders-react'

export function ShaderBackground({ theme }: { theme?: string }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return (
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        localStorage.getItem('theme') === 'dark'
      )
    } catch {
      return false
    }
  })

  const [reducedMotion, setReducedMotion] = useState<boolean>(false)

  useEffect(() => {
    const updateTheme = () => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      setIsDark(dark)
    }
    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(motionQuery.matches)
    const handleMotion = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    motionQuery.addEventListener('change', handleMotion)

    return () => {
      observer.disconnect()
      motionQuery.removeEventListener('change', handleMotion)
    }
  }, [theme])

  // Warm study palette: No purple, cyan or neon lime
  // Rich warm clay, gold ochre, petrol-teal on warm cream/dark canvas
  const lightColors = [
    'hsl(18, 90%, 58%)',   // Warm Clay Terracotta
    'hsl(42, 94%, 53%)',   // Golden Ochre
    'hsl(172, 82%, 27%)',  // Petrol-Teal
  ]

  const darkColors = [
    'hsl(18, 94%, 58%)',   // Luminous Terracotta Embers
    'hsl(40, 96%, 52%)',   // Radiant Golden Amber
    'hsl(165, 75%, 38%)',  // Glowing Emerald Sage
  ]

  return (
    <div
      className="landing-shader-wrapper"
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* 1. Paper Design GrainGradient Shader (GPU WebGL) */}
      <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <GrainGradient
          style={{ width: '100vw', height: '100vh', display: 'block' }}
          colorBack={isDark ? 'hsl(24, 25%, 10%)' : 'hsl(38, 44%, 94%)'}
          softness={0.76}
          intensity={isDark ? 0.82 : 0.55}
          noise={0}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1.2}
          rotation={0}
          speed={reducedMotion ? 0 : 1.0}
          colors={isDark ? darkColors : lightColors}
        />
      </div>

      {/* 2. Fluid Ambient Liquid Glow Orbs (Guaranteed continuous organic motion) */}
      <div className="landing-ambient-orbs">
        <div className={`ambient-orb orb-clay ${isDark ? 'dark' : ''}`} />
        <div className={`ambient-orb orb-ochre ${isDark ? 'dark' : ''}`} />
        <div className={`ambient-orb orb-teal ${isDark ? 'dark' : ''}`} />
      </div>

      {/* 3. Subtle Frosted Glass & Paper Vignette Overlay */}
      <div className="landing-shader-frosted-overlay" />
    </div>
  )
}
