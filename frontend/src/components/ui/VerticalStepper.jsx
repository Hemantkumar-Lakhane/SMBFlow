import React from 'react'
import { Check, ChevronRight } from 'lucide-react'

/**
 * VerticalStepper
 * Clean multi-step timeline connecting completed, active, and pending steps with vertical lines.
 */
export default function VerticalStepper({
  steps = [],
  currentStepIndex = 0,
  onStepClick,
  onNext,
  onPrev,
  className = '',
  showControls = false
}) {
  return (
    <div className={`stepper-box ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStepIndex
        const isActive = idx === currentStepIndex
        const isPending = idx > currentStepIndex

        const stateClass = isCompleted
          ? 'stepper-completed'
          : isActive
          ? 'stepper-active'
          : 'stepper-pending'

        return (
          <div
            key={step.id || idx}
            className={`stepper-step ${stateClass} ${onStepClick ? 'cursor-pointer' : ''}`}
            onClick={() => onStepClick && onStepClick(idx, step)}
          >
            {/* Connecting Vertical Line */}
            <div className="stepper-line" />

            {/* Circle Indicator */}
            <div className="stepper-circle">
              {isCompleted ? (
                <Check className="w-5 h-5 text-white" strokeWidth={3} />
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>

            {/* Step Details */}
            <div className="stepper-content">
              <div className="flex items-center justify-between gap-2">
                <div className="stepper-title">{step.title}</div>
                {step.time && <div className="stepper-time">{step.time}</div>}
              </div>

              {step.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              )}

              {step.status && (
                <div className="stepper-status">
                  {step.status}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {showControls && (
        <div className="stepper-controls">
          <button
            type="button"
            className="stepper-button"
            onClick={onPrev}
            disabled={currentStepIndex <= 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="stepper-button stepper-button-primary"
            onClick={onNext}
            disabled={currentStepIndex >= steps.length - 1}
          >
            <span>Next Stage</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
