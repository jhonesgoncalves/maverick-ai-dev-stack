import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Cursor, Kicker, Terminal, typed } from "../components/Chrome";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, mono, safe, sans } from "../theme";

const COMMAND = 'npx @maverick-ai/cli new\n  "Add cursor pagination to the orders endpoint"';
const TYPE_AT = 16;
const OUTPUT_AT = 66;
const STAGES_AT = 128;
const STAGE_STAGGER = 7;
const CAPTION_AT = 150;

// Real output of `maverick new` on examples/nestjs-orders-api (scripts/readme-demo.mjs).
const OUTPUT: React.ReactNode[] = [
  <>
    <span style={{ color: colors.success }}>✓</span> task created:{" "}
    <span style={{ color: colors.amber }}>add-cursor-pagination-orders-endpoint</span>
  </>,
  <>
    <span style={{ color: colors.muted }}>  Workflow:</span> Spec Driven
  </>,
  <>
    <span style={{ color: colors.muted }}>  Pipeline:</span> [PRD] → SPEC → TECHSPEC → TASKS
  </>,
  <>
    <span style={{ color: colors.muted }}>  Grounded in:</span> src/orders/orders.service.ts{" "}
    <span style={{ color: colors.muted }}>(+5)</span>
  </>,
  <>
    <span style={{ color: colors.orange }}>▶</span> opening Claude Code…
  </>,
];

const STAGES = [
  ["PRD", "SPEC", "TECHSPEC", "TASKS"],
  ["BUILD", "REVIEW", "SHIP"],
];

export const PlanScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();
  const command = typed(COMMAND, frame, TYPE_AT, 1.6);
  const typing = command.length < COMMAND.length;

  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top}px ${safe.x}px ${safe.bottom}px`,
        fontFamily: sans,
        color: colors.text,
      }}
    >
      <Kicker>01 · PLAN</Kicker>
      <Reveal delay={4} style={{ marginTop: 22 }}>
        <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.04 }}>
          {t.planTitle}
        </div>
      </Reveal>

      <Reveal delay={8} style={{ marginTop: 44 }}>
        <Terminal title="zsh — orders-api" style={{ minHeight: 412 }}>
          <span style={{ color: colors.orange }}>$ </span>
          {command}
          {typing || frame < OUTPUT_AT ? <Cursor /> : null}
          {frame >= OUTPUT_AT ? "\n" : null}
          {OUTPUT.map((line, index) => {
            const at = OUTPUT_AT + index * 9;
            if (frame < at) return null;
            return (
              <div
                key={index}
                style={{
                  opacity: interpolate(frame, [at, at + 6], [0, 1], clamp),
                  translate: `0px ${interpolate(frame, [at, at + 6], [10, 0], clamp)}px`,
                }}
              >
                {line}
              </div>
            );
          })}
        </Terminal>
      </Reveal>

      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 16 }}>
        {STAGES.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {row.map((stage, index) => {
              const order = rowIndex * STAGES[0].length + index;
              const at = STAGES_AT + order * STAGE_STAGGER;
              const on = interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: easeOut });
              return (
                <div key={stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {index > 0 ? (
                    <span style={{ fontFamily: mono, fontSize: 26, color: on > 0.5 ? colors.orange : colors.border }}>→</span>
                  ) : null}
                  <div
                    style={{
                      padding: "12px 20px",
                      borderRadius: 12,
                      fontFamily: mono,
                      fontSize: 25,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      border: `1px solid ${on > 0.5 ? colors.orange : colors.border}`,
                      backgroundColor: on > 0.5 ? colors.accentBg : colors.surface1,
                      color: on > 0.5 ? colors.amber : colors.muted,
                      opacity: interpolate(frame, [STAGES_AT - 12, STAGES_AT - 4], [0, 1], clamp),
                      scale: `${1 + Math.sin(on * Math.PI) * 0.08}`,
                      boxShadow: on > 0.5 ? "0 0 26px rgba(255, 107, 0, 0.25)" : "none",
                    }}
                  >
                    {on > 0.5 ? "✓ " : ""}
                    {stage}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Reveal delay={CAPTION_AT} style={{ marginTop: 40 }}>
        <div style={{ fontSize: 42, fontWeight: 500, lineHeight: 1.3, color: colors.muted, letterSpacing: "-0.015em" }}>
          {t.planOut}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
