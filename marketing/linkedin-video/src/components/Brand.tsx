import type React from "react";
import { useId } from "react";
import { colors, sans } from "../theme";

type MarkProps = {
  readonly height: number;
  readonly glow?: boolean;
  readonly style?: React.CSSProperties;
};

// Paths from maverick-ai-brandkit/assets/logo/svg/maverick-ai-mark.svg, cropped to the mark.
export const MaverickMark: React.FC<MarkProps> = ({ height, glow = true, style }) => {
  const id = useId().replace(/:/g, "");
  const width = height * (372 / 270);

  return (
    <svg
      width={width}
      height={height}
      viewBox="70 145 372 270"
      fill="none"
      style={{ overflow: "visible", ...style }}
    >
      <defs>
        <linearGradient id={`${id}a`} x1="86" y1="102" x2="318" y2="410" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9A19" />
          <stop offset="0.42" stopColor="#FF6B00" />
          <stop offset="1" stopColor="#D94800" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="426" y1="100" x2="237" y2="381" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB02E" />
          <stop offset="0.36" stopColor="#FF7A00" />
          <stop offset="1" stopColor="#E74D00" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="130" y1="180" x2="343" y2="391" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2A1205" />
          <stop offset="1" stopColor="#090909" />
        </linearGradient>
        <filter id={`${id}g`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {glow ? (
        <path
          d="M80 384V177C80 161 99 153 110 164L256 310L402 164C413 153 432 161 432 177V384L379 331V250L292 337C272 357 240 357 220 337L133 250V331L80 384Z"
          fill="#FF6B00"
          opacity="0.18"
          filter={`url(#${id}g)`}
        />
      ) : null}
      <path
        d="M80 384V177C80 161 99 153 110 164L284 338C296 350 296 369 284 381C272 393 253 393 241 381L133 273V331L80 384Z"
        fill={`url(#${id}a)`}
      />
      <path
        d="M432 384V177C432 161 413 153 402 164L282 284L322 324L379 267V331L432 384Z"
        fill={`url(#${id}b)`}
      />
      <path
        d="M133 203L284 354C296 366 296 385 284 397C272 409 253 409 241 397L110 266L133 203Z"
        fill={`url(#${id}c)`}
        opacity="0.84"
      />
      <path d="M80 177C80 161 99 153 110 164L133 187V250L80 303V177Z" fill="#FF7A00" />
    </svg>
  );
};

type WordmarkProps = {
  readonly fontSize: number;
  readonly style?: React.CSSProperties;
};

export const Wordmark: React.FC<WordmarkProps> = ({ fontSize, style }) => (
  <div
    style={{
      display: "flex",
      gap: fontSize * 0.24,
      fontFamily: sans,
      fontSize,
      fontWeight: 700,
      letterSpacing: "-0.05em",
      lineHeight: 1,
      color: colors.text,
      ...style,
    }}
  >
    <span>Maverick</span>
    <span style={{ color: colors.orange, fontWeight: 800 }}>AI</span>
  </div>
);
