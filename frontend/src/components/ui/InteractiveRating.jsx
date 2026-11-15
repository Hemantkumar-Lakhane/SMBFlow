import React, { useState } from 'react'

/**
 * InteractiveRating
 * Animated 5-star rating using CSS stroke-dasharray and pop animations (idle & yippee).
 */
export default function InteractiveRating({
  value = 5,
  onChange,
  name = 'workflow-rating',
  size = 'w-6 h-6',
  className = ''
}) {
  const [selected, setSelected] = useState(value)

  const handleSelect = (val) => {
    setSelected(val)
    if (onChange) onChange(val)
  }

  return (
    <div className={`rating ${className}`}>
      {[5, 4, 3, 2, 1].map((star) => (
        <React.Fragment key={star}>
          <input
            type="radio"
            id={`${name}-star-${star}`}
            name={name}
            value={star}
            checked={selected === star}
            onChange={() => handleSelect(star)}
          />
          <label htmlFor={`${name}-star-${star}`} title={`${star} stars`}>
            <svg
              className={size}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              />
            </svg>
          </label>
        </React.Fragment>
      ))}
    </div>
  )
}
