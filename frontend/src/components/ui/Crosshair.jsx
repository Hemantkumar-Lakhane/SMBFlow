import React, { useEffect, useRef, useState } from 'react'

/**
 * Crosshair
 * Interactive coordinate crosshair tracking cursor with target lock reticle,
 * click pulse ripple, smoothing (lerp), and real-time HUD coordinate readouts.
 */
export default function Crosshair({
  containerRef,
  color = '#ffffff',
  targetEffect = 'lock',
  thickness = 1,
  opacity = 0.85,
  smoothing = 0.35,
  showCoordinates = true,
  lineStyle = 'solid',
  blendMode = 'normal',
  gap = 0,
  fade = 0,
  clickPulse = true,
  hideCursor = false,
}) {
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const [pulse, setPulse] = useState(false)

  // Target coordinates for smooth interpolation
  const targetPos = useRef({ x: 0, y: 0 })
  const currentPos = useRef({ x: 0, y: 0 })
  const animFrame = useRef(null)

  useEffect(() => {
    const container = containerRef?.current
    if (!container) return

    if (hideCursor) {
      container.style.cursor = 'none'
    }

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        targetPos.current = { x, y }
        if (!visible) setVisible(true)
      } else {
        setVisible(false)
      }
    }

    const handleMouseEnter = () => setVisible(true)
    const handleMouseLeave = () => setVisible(false)

    const handleClick = () => {
      if (clickPulse) {
        setPulse(true)
        setTimeout(() => setPulse(false), 500)
      }
    }

    // Animation Loop with Lerp smoothing
    const updatePosition = () => {
      const dx = targetPos.current.x - currentPos.current.x
      const dy = targetPos.current.y - currentPos.current.y

      const factor = smoothing > 0 ? Math.min(1, Math.max(0.05, 1 - smoothing)) : 1

      currentPos.current.x += dx * factor
      currentPos.current.y += dy * factor

      setCoords({
        x: Math.round(currentPos.current.x),
        y: Math.round(currentPos.current.y),
      })

      animFrame.current = requestAnimationFrame(updatePosition)
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('mousedown', handleClick)

    animFrame.current = requestAnimationFrame(updatePosition)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('mousedown', handleClick)
      if (animFrame.current) cancelAnimationFrame(animFrame.current)
      if (hideCursor) container.style.cursor = 'auto'
    }
  }, [containerRef, smoothing, hideCursor, clickPulse, visible])

  if (!visible) return null

  const strokeDash = lineStyle === 'dashed' ? '6 6' : lineStyle === 'dotted' ? '2 4' : undefined

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-20"
      style={{ mixBlendMode: blendMode }}
    >
      <svg className="w-full h-full">
        {/* Horizontal Line - Left Segment */}
        <line
          x1="0"
          y1={coords.y}
          x2={Math.max(0, coords.x - gap)}
          y2={coords.y}
          stroke={color}
          strokeWidth={thickness}
          strokeOpacity={opacity}
          strokeDasharray={strokeDash}
        />
        {/* Horizontal Line - Right Segment */}
        <line
          x1={coords.x + gap}
          y1={coords.y}
          x2="100%"
          y2={coords.y}
          stroke={color}
          strokeWidth={thickness}
          strokeOpacity={opacity}
          strokeDasharray={strokeDash}
        />

        {/* Vertical Line - Top Segment */}
        <line
          x1={coords.x}
          y1="0"
          x2={coords.x}
          y2={Math.max(0, coords.y - gap)}
          stroke={color}
          strokeWidth={thickness}
          strokeOpacity={opacity}
          strokeDasharray={strokeDash}
        />
        {/* Vertical Line - Bottom Segment */}
        <line
          x1={coords.x}
          y1={coords.y + gap}
          x2={coords.x}
          y2="100%"
          stroke={color}
          strokeWidth={thickness}
          strokeOpacity={opacity}
          strokeDasharray={strokeDash}
        />

        {/* Target Effect: Tactical Corner Brackets (Lock) */}
        {targetEffect === 'lock' && (
          <g stroke={color} strokeWidth={Math.max(1.5, thickness)} strokeOpacity={opacity} fill="none">
            {/* Top-Left Bracket */}
            <path d={`M ${coords.x - 14} ${coords.y - 6} L ${coords.x - 14} ${coords.y - 14} L ${coords.x - 6} ${coords.y - 14}`} />
            {/* Top-Right Bracket */}
            <path d={`M ${coords.x + 6} ${coords.y - 14} L ${coords.x + 14} ${coords.y - 14} L ${coords.x + 14} ${coords.y - 6}`} />
            {/* Bottom-Left Bracket */}
            <path d={`M ${coords.x - 14} ${coords.y + 6} L ${coords.x - 14} ${coords.y + 14} L ${coords.x - 6} ${coords.y + 14}`} />
            {/* Bottom-Right Bracket */}
            <path d={`M ${coords.x + 6} ${coords.y + 14} L ${coords.x + 14} ${coords.y + 14} L ${coords.x + 14} ${coords.y + 6}`} />
            {/* Center dot */}
            <circle cx={coords.x} cy={coords.y} r="2" fill={color} fillOpacity={opacity} />
          </g>
        )}

        {/* Click Pulse Ripple */}
        {pulse && (
          <circle
            cx={coords.x}
            cy={coords.y}
            r="28"
            stroke={color}
            strokeWidth="2"
            fill="none"
            className="animate-ping"
            style={{ transformOrigin: `${coords.x}px ${coords.y}px` }}
          />
        )}
      </svg>

      {/* Coordinate HUD Readout */}
      {showCoordinates && (
        <div
          className="absolute pointer-events-none transform translate-x-4 -translate-y-6 flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-md border border-white/20 text-[10px] font-mono font-medium shadow-md transition-transform duration-75"
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            color: color,
          }}
        >
          <span>X:{coords.x}</span>
          <span className="opacity-40">|</span>
          <span>Y:{coords.y}</span>
        </div>
      )}
    </div>
  )
}
