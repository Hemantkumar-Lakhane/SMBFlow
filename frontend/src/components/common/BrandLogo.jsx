// frontend/src/components/common/BrandLogo.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Unified Brand Logo Component for Isolate Platform
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'

export default function BrandLogo({
  className = 'h-7 w-auto',
  showText = false,
  textClassName = 'text-base font-bold tracking-tight text-slate-900 dark:text-white',
  hideIcon = false,
  iconOnly = false
}) {
  const logoSrc = iconOnly ? '/isolate-icon.svg' : '/isolatelogo.svg'

  return (
    <div className="flex items-center gap-2">
      {!hideIcon && (
        <img
          src={logoSrc}
          alt="Isolate"
          className={`${className} object-contain shrink-0`}
        />
      )}
      {showText && (
        <span className={textClassName}>
          Isolate
        </span>
      )}
    </div>
  )
}
