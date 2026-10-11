import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { MaverickMark, Wordmark } from "../components/Brand";
import { Cursor, typed } from "../components/Chrome";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, mono, safe, sans } from "../theme";

const COMMAND = "npx @maverick-ai/cli init";
const COMMAND_AT = 40;

export const CtaScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${safe.x}px`,
        fontFamily: sans,
        color: colors.text,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
          scale: interpolate(frame, [0, 22], [0.8, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 14 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <MaverickMark height={92} />
        <Wordmark fontSize={84} />
      </div>

      <Reveal delay={12} style={{ marginTop: 70 }}>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.06 }}>
          {t.ctaTagline1}
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.06, color: colors.orange }}>
          {t.ctaTagline2}
        </div>
      </Reveal>

      <Reveal delay={30} style={{ marginTop: 76 }}>
        <div
          style={{
            minWidth: 820,
            padding: "30px 40px",
            borderRadius: 22,
            border: `1.5px solid ${colors.orange}`,
            backgroundColor: "rgba(14, 14, 14, 0.95)",
            boxShadow: `0 0 ${40 + Math.sin(frame / 10) * 14}px rgba(255, 107, 0, 0.28)`,
            fontFamily: mono,
            fontSize: 44,
            fontWeight: 500,
            textAlign: "left",
          }}
        >
          <span style={{ color: colors.orange }}>$ </span>
          {typed(COMMAND, frame, COMMAND_AT, 1.2)}
          <Cursor />
        </div>
      </Reveal>

      <Reveal delay={COMMAND_AT + 30} style={{ marginTop: 44 }}>
        <div style={{ fontSize: 34, fontWeight: 600, color: colors.text }}>{t.ctaFacts}</div>
        <div style={{ marginTop: 14, fontFamily: mono, fontSize: 26, color: colors.muted }}>
          github.com/jhonesgoncalves/maverick-ai-dev-stack
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
