import React from 'react'

/**
 * GlowExpandButton
 * High-impact interactive CTA button with radial hover expansion,
 * embedded SVG curve accents, and smooth gradient highlights.
 */
export default function GlowExpandButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
  className = '',
  accentColor = 'bg-orange-600',
  icon: Icon,
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex items-center justify-center px-7 py-2.5 overflow-hidden tracking-tight text-white bg-slate-900 dark:bg-slate-800 rounded-xl group font-semibold text-sm transition-all duration-300 shadow-md hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${className}`}
      {...props}
    >
      {/* Radial expanding colored circle */}
      <span
        className={`absolute w-0 h-0 transition-all duration-500 ease-out ${accentColor} rounded-full group-hover:w-64 group-hover:h-64`}
      />

      {/* SVG Decorative Shape - Bottom Left */}
      <span className="absolute bottom-0 left-0 h-full -ml-2 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-auto h-full opacity-15"
          viewBox="0 0 487 487"
        >
          <path
            fill-opacity=".8"
            fill-rule="nonzero"
            fill="#FFF"
            d="M0 .3c67 2.1 134.1 4.3 186.3 37 52.2 32.7 89.6 95.8 112.8 150.6 23.2 54.8 32.3 101.4 61.2 149.9 28.9 48.4 77.7 98.8 126.4 149.2H0V.3z"
          />
        </svg>
      </span>

      {/* SVG Decorative Shape - Top Right */}
      <span className="absolute top-0 right-0 w-12 h-full -mr-3 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="object-cover w-full h-full opacity-15"
          viewBox="0 0 487 487"
        >
          <path
            fill-opacity=".8"
            fill-rule="nonzero"
            fill="#FFF"
            d="M487 486.7c-66.1-3.6-132.3-7.3-186.3-37s-95.9-85.3-126.2-137.2c-30.4-51.8-49.3-99.9-76.5-151.4C70.9 109.6 35.6 54.8.3 0H487v486.7z"
          />
        </svg>
      </span>

      {/* Subtle top glossy gradient overlay */}
      <span className="absolute inset-0 w-full h-full -mt-1 rounded-xl opacity-25 bg-gradient-to-b from-white/30 via-transparent to-transparent pointer-events-none" />

      {/* Button Content */}
      <span className="relative z-10 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />}
        <span>{children}</span>
      </span>
    </button>
  )
}
