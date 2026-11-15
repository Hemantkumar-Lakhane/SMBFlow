import React from 'react'

/**
 * MorphingIconButton
 * Morphing button that transitions from rounded rectangle into a circle
 * while sliding downwards and displaying an elevated floating tooltip.
 */
export default function MorphingIconButton({
  icon: Icon,
  label = 'Action',
  onClick,
  className = '',
  gradientFrom = 'from-gray-800',
  gradientTo = 'to-black',
  hoverFrom = 'hover:from-blue-600',
  hoverTo = 'hover:to-indigo-800',
  ...props
}) {
  return (
    <div className="relative inline-flex items-center justify-center group/container">
      <button
        type="button"
        onClick={onClick}
        className={`group relative flex items-center justify-center p-3 rounded-xl drop-shadow-xl bg-gradient-to-r ${gradientFrom} ${gradientTo} text-white font-semibold hover:translate-y-2.5 hover:rounded-[50%] transition-all duration-500 ${hoverFrom} ${hoverTo} cursor-pointer focus:outline-none ${className}`}
        {...props}
      >
        {Icon && <Icon className="w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />}

        {/* Floating Tooltip that pops upwards */}
        <span className="absolute opacity-0 group-hover:opacity-100 group-hover:-translate-y-10 duration-500 text-xs font-semibold px-2.5 py-1 bg-slate-900 dark:bg-black text-white rounded-lg shadow-xl border border-white/10 whitespace-nowrap pointer-events-none transition-all">
          {label}
        </span>
      </button>
    </div>
  )
}
