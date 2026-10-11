import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, safe, sans } from "../theme";

const QUESTION_OUT = 46;
const PROBLEM_AT = 54;

export const QuestionScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();
  const questionOut = interpolate(frame, [QUESTION_OUT, QUESTION_OUT + 10], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <AbsoluteFill style={{ fontFamily: sans, color: colors.text }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: `0 ${safe.x}px`,
          opacity: 1 - questionOut,
          translate: `0px ${questionOut * -60}px`,
          filter: `blur(${questionOut * 12}px)`,
        }}
      >
        <Reveal duration={14}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1.04,
              textAlign: "center",
            }}
          >
            {t.question}
          </div>
        </Reveal>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: `0 ${safe.x}px`,
          gap: 18,
        }}
      >
        <Reveal delay={PROBLEM_AT}>
          <div style={{ fontSize: 86, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 1.06, color: colors.muted }}>
            {t.problem1}
          </div>
        </Reveal>
        <Reveal delay={PROBLEM_AT + 16}>
          <div style={{ fontSize: 86, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.06 }}>
            {t.problem2a}
            <span style={{ color: colors.orange }}>{t.problem2b}</span>
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
