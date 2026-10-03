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

  // Light palette: Warm analog study desk stationery
  const lightColors = [
    'hsl(18, 90%, 58%)',   // Warm Clay Terracotta
    'hsl(42, 94%, 53%)',   // Golden Ochre
    'hsl(350, 75%, 65%)',  // Soft Rose
  ]

  // Dark palette matching 21st.dev Paper Design GrainGradient reference:
  // Pure black canvas with outer Sunset Crimson glow blending through Warm Sunset Flame into Radiant Golden Amber
  const darkColors = [
    '#d83a56',  // Sunset Crimson / Rose Ruby (outer glow)
    '#ea580c',  // Warm Sunset Flame (intermediate transition)
    '#f59e0b',  // Radiant Golden Amber (luminous core)
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
          colorBack={isDark ? '#000000' : 'hsl(38, 44%, 94%)'}
          softness={isDark ? 0.68 : 0.76}
          intensity={isDark ? 0.88 : 0.55}
          noise={isDark ? 0.35 : 0.15}
          shape="corners"
          offsetX={0}
          offsetY={0}
          scale={1.2}
          rotation={0}
          speed={reducedMotion ? 0 : 0.85}
          colors={isDark ? darkColors : lightColors}
        />
      </div>

      {/* 2. Fluid Ambient Liquid Glow Orbs (Continuous organic motion in sunset crimson & amber) */}
      <div className="landing-ambient-orbs">
        <div className={`ambient-orb orb-crimson ${isDark ? 'dark' : ''}`} />
        <div className={`ambient-orb orb-amber ${isDark ? 'dark' : ''}`} />
        <div className={`ambient-orb orb-rose ${isDark ? 'dark' : ''}`} />
      </div>

      {/* 3. Subtle Frosted Glass & Paper Vignette Overlay */}
      <div className="landing-shader-frosted-overlay" />
    </div>
  )
}
