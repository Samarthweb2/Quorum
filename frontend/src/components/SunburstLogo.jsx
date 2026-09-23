import React from 'react';

/**
 * Midday-style 12-petal rounded geometric sunburst / asterisk brand mark.
 */
export default function SunburstLogo({ size = 22, color = 'currentColor', className = '' }) {
  const petals = Array.from({ length: 12 });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <g transform="translate(12, 12)">
        {petals.map((_, i) => (
          <rect
            key={i}
            x="-1.1"
            y="-10.5"
            width="2.2"
            height="5.8"
            rx="1.1"
            fill={color}
            transform={`rotate(${i * 30})`}
          />
        ))}
      </g>
    </svg>
  );
}
