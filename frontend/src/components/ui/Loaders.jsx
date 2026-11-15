import React from 'react'

/**
 * 3x3 Matrix Grid Squares Loader
 * Staggered fading dot matrix loader.
 */
export function MatrixSquareLoader({ className = '', color = 'bg-blue-600' }) {
  return (
    <div className={`matrix-grid-box ${className}`}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <div key={n} id={`sq${n}`} className={`square ${color}`} />
      ))}
    </div>
  )
}

/**
 * Image Generation Preview Loader
 * Animated sun and mountain graphic loader for AI image and video generation nodes.
 */
export function ImageGenLoader({ className = '' }) {
  return <div className={`image-gen-loader ${className}`} />
}

/**
 * Inset Glowing Ring Loader
 * Rotating inset box-shadow gradient ring with bouncing letters.
 */
export function RingGlowLoader({ text = 'GENERATING', className = '' }) {
  const letters = (text || 'LOADING').split('')

  return (
    <div className={`ring-glow-wrapper ${className}`}>
      <div className="ring-glow-circle" />
      <div className="relative z-10 flex items-center justify-center tracking-widest text-xs uppercase font-bold text-slate-800 dark:text-white">
        {letters.map((char, idx) => (
          <span key={idx} className="loader-letter">
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Typographic Letters Wave Loader
 * Staggered jumping letter animation (hideAndSeek keyframes).
 */
export function WaveTextLoader({ text = 'LOADING', className = '' }) {
  const chars = (text || 'LOADING').toLowerCase().split('')

  return (
    <div className={`wave-text-loader ${className}`}>
      {chars.map((char, idx) => (
        <span
          key={idx}
          style={{ animationDelay: `calc(70ms * ${idx})` }}
          className="text-base font-bold text-slate-900 dark:text-white tracking-wider uppercase px-0.5"
        >
          {char}
        </span>
      ))}
    </div>
  )
}
