import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & {
  showWordmark?: boolean;
};

export function MaverickLogo({ showWordmark = true, ...props }: Props) {
  return (
    <svg viewBox={showWordmark ? '0 0 1400 360' : '0 0 512 512'} role="img" aria-label="Maverick AI" {...props}>
      <defs>
        <linearGradient id="mav-a" x1="80" y1="100" x2="320" y2="410" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9A19" />
          <stop offset=".42" stopColor="#FF6B00" />
          <stop offset="1" stopColor="#D94800" />
        </linearGradient>
        <linearGradient id="mav-b" x1="430" y1="100" x2="240" y2="380" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB02E" />
          <stop offset=".36" stopColor="#FF7A00" />
          <stop offset="1" stopColor="#E74D00" />
        </linearGradient>
        <linearGradient id="mav-fold" x1="130" y1="180" x2="340" y2="390" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2A1205" />
          <stop offset="1" stopColor="#090909" />
        </linearGradient>
      </defs>
      <g transform={showWordmark ? 'translate(20,18) scale(.63)' : undefined}>
        <path d="M80 384V177C80 161 99 153 110 164L284 338C296 350 296 369 284 381C272 393 253 393 241 381L133 273V331L80 384Z" fill="url(#mav-a)" />
        <path d="M432 384V177C432 161 413 153 402 164L282 284L322 324L379 267V331L432 384Z" fill="url(#mav-b)" />
        <path d="M133 203L284 354C296 366 296 385 284 397C272 409 253 409 241 397L110 266L133 203Z" fill="url(#mav-fold)" opacity=".84" />
        <path d="M80 177C80 161 99 153 110 164L133 187V250L80 303V177Z" fill="#FF7A00" />
      </g>
      {showWordmark && (
        <>
          <text x="360" y="225" fill="currentColor" fontFamily="Inter, Geist, ui-sans-serif, system-ui, sans-serif" fontSize="142" fontWeight="700" letterSpacing="-7">Maverick</text>
          <text x="990" y="225" fill="#FF6B00" fontFamily="Inter, Geist, ui-sans-serif, system-ui, sans-serif" fontSize="142" fontWeight="800" letterSpacing="-6">AI</text>
        </>
      )}
    </svg>
  );
}
