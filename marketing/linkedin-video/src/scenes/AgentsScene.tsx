import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, mono, safe, sans } from "../theme";

// Agents with first-class support (site docs: "9 AI agents supported").
const AGENTS = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Gemini CLI",
  "Copilot",
  "Kiro",
  "OpenCode",
  "Antigravity",
  "Windsurf",
];
const PILLS_AT = 34;
const PILL_STAGGER = 5;
const FACTS_AT = PILLS_AT + AGENTS.length * PILL_STAGGER + 12;

export const AgentsScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `${safe.top}px ${safe.x}px ${safe.bottom}px`,
        fontFamily: sans,
        color: colors.text,
      }}
    >
      <Reveal>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: "-0.05em", whiteSpace: "pre-line", lineHeight: 1.04 }}>
          {t.agentsTitle}
        </div>
      </Reveal>
      <Reveal delay={12} style={{ marginTop: 26 }}>
        <div style={{ fontSize: 42, fontWeight: 500, whiteSpace: "pre-line", lineHeight: 1.3, color: colors.muted, letterSpacing: "-0.015em" }}>
          {t.agentsSub}
        </div>
      </Reveal>

      <div style={{ marginTop: 56, display: "flex", flexWrap: "wrap", gap: 16 }}>
        {AGENTS.map((agent, index) => {
          const at = PILLS_AT + index * PILL_STAGGER;
          return (
            <div
              key={agent}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 26px",
                borderRadius: 16,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface2,
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                opacity: interpolate(frame, [at, at + 6], [0, 1], clamp),
                scale: interpolate(frame, [at, at + 14], [0.6, 1], {
                  ...clamp,
                  easing: Easing.spring({ damping: 11 }),
                  output: "perceptual-scale",
                }),
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange }} />
              {agent}
            </div>
          );
        })}
      </div>

      <Reveal delay={FACTS_AT} distance={20} style={{ marginTop: 56, display: "flex", gap: 14 }}>
        {t.facts.map((fact) => (
          <div
            key={fact}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              fontFamily: mono,
              fontSize: 26,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface1,
            }}
          >
            <span style={{ color: colors.success }}>✓ </span>
            {fact}
          </div>
        ))}
      </Reveal>
    </AbsoluteFill>
  );
};
