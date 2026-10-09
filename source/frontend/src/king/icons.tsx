// Decorative stroke icons; every use sits next to visible text, so they are hidden from assistive tech.
type IconProps = { className?: string };

const strokeProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

export const CrownIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" strokeWidth={1.6} strokeLinejoin="round" aria-hidden focusable={false} className={className}>
    <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" />
  </svg>
);

export const EyeIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const BowlIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M3 12h18a9 6 0 0 1-18 0z" />
    <path d="M9 9c0-2 2-2 2-4M14 9c0-2 2-2 2-4" />
  </svg>
);

export const BackIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const UndoIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export const PinIcon = ({ className }: IconProps) => (
  <svg {...strokeProps} className={className}>
    <path d="M12 22s7-7.2 7-12a7 7 0 0 0-14 0c0 4.8 7 12 7 12z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
