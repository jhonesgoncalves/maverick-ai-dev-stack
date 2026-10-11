import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { clamp, colors, easeOut, mono, sans } from "../theme";
import { MaverickMark } from "./Brand";

// Shared backdrop: drifting grid, a slow orange glow and a vignette.
export const Background: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${colors.border} 1px, transparent 1px), linear-gradient(90deg, ${colors.border} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          backgroundPosition: `0px ${frame * 0.35}px`,
          opacity: 0.28,
          maskImage:
            "radial-gradient(ellipse 80% 65% at 50% 45%, black 0%, transparent 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${50 + Math.sin(frame / 80) * 18}% ${
            8 + Math.cos(frame / 110) * 6
          }%, rgba(255, 107, 0, 0.16), transparent 42%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${40 + Math.cos(frame / 95) * 20}% 104%, rgba(255, 107, 0, 0.09), transparent 40%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.65) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

type CornerLogoProps = {
  readonly from: number;
  readonly to: number;
};

// Small brand lockup kept in the corner between the logo reveal and the closing card.
export const CornerLogo: React.FC<CornerLogoProps> = ({ from, to }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + 15, to - 10, to], [0, 1, 1, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        top: 56,
        left: 72,
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: opacity * 0.92,
        fontFamily: sans,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: "-0.04em",
        color: colors.text,
      }}
    >
      <MaverickMark height={30} glow={false} />
      <span>
        Maverick <span style={{ color: colors.orange }}>AI</span>
      </span>
    </div>
  );
};

type ProgressBarProps = {
  readonly total: number;
};

export const ProgressBar: React.FC<ProgressBarProps> = ({ total }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 6,
        width: `${interpolate(frame, [0, total - 1], [0, 100], clamp)}%`,
        background: `linear-gradient(90deg, ${colors.orange}, ${colors.amber})`,
        boxShadow: "0 0 18px rgba(255, 107, 0, 0.6)",
      }}
    />
  );
};

type KickerProps = {
  readonly children: React.ReactNode;
  readonly delay?: number;
};

// "01 · PLAN" style section label.
export const Kicker: React.FC<KickerProps> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 14], [0, 1], { ...clamp, easing: easeOut });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontFamily: mono,
        fontSize: 26,
        fontWeight: 500,
        letterSpacing: "0.14em",
        color: colors.orange,
        opacity: progress,
      }}
    >
      <div
        style={{
          width: 44 * progress,
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.orange,
        }}
      />
      {children}
    </div>
  );
};

type CursorProps = {
  readonly color?: string;
};

export const Cursor: React.FC<CursorProps> = ({ color = colors.orange }) => {
  const frame = useCurrentFrame();

  return (
    <span style={{ color, opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0 }}>▍</span>
  );
};

// Characters of `text` visible at `frame` when typing starts at `start`.
export const typed = (text: string, frame: number, start: number, charsPerFrame = 1.5) =>
  text.slice(0, Math.max(0, Math.floor((frame - start) * charsPerFrame)));

type TerminalProps = {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
};

export const Terminal: React.FC<TerminalProps> = ({ title, children, style }) => (
  <div
    style={{
      borderRadius: 22,
      border: `1px solid ${colors.border}`,
      backgroundColor: "rgba(14, 14, 14, 0.92)",
      boxShadow: "0 40px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.02) inset",
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "20px 28px",
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surface2,
      }}
    >
      {[0, 1, 2].map((dot) => (
        <div
          key={dot}
          style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#2F2F2F" }}
        />
      ))}
      <div
        style={{
          marginLeft: 14,
          fontFamily: mono,
          fontSize: 22,
          color: colors.muted,
        }}
      >
        {title}
      </div>
    </div>
    <div
      style={{
        padding: "28px 34px 34px",
        fontFamily: mono,
        fontSize: 25,
        lineHeight: 1.6,
        color: colors.text,
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </div>
  </div>
);
