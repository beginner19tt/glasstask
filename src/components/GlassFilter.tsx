/**
 * The displacement filter that makes the glass refract instead of merely blur.
 * feTurbulence generates a smooth noise field, feDisplacementMap pushes the
 * backdrop pixels along it, and a soft blur keeps the distortion from reading
 * as grain. Referenced from CSS as `backdrop-filter: url(#liquid-glass)`,
 * behind an @supports guard, so browsers without it fall back to plain blur.
 */
export function GlassFilter() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.013"
            numOctaves={2}
            seed={7}
            result="noise"
          >
            <animate
              attributeName="baseFrequency"
              dur="24s"
              values="0.009 0.013; 0.013 0.009; 0.009 0.013"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feGaussianBlur in="noise" stdDeviation="1.6" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={14}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
