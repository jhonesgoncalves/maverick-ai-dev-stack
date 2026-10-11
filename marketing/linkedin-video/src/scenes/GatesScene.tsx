import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Cursor, Kicker, typed } from "../components/Chrome";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, mono, safe, sans } from "../theme";

// The seven gates of the built-in `ship` flow, in order.
const GATES = ["artifacts", "checks", "scope", "security", "dependencies", "diff-review", "human-review"];
const COMMAND = "maverick flow run ship add-cursor-pagination…";
const ROWS_AT = 40;
const ROW_STAGGER = 12;
const CHECK_TIME = 7;
const OUTCOME_AT = ROWS_AT + GATES.length * ROW_STAGGER + 14;

type Status = "run" | "pass" | "wait";

const STATUS_STYLE: Record<Status, { label: string; color: string; bg: string }> = {
  run: { label: "···", color: colors.muted, bg: "rgba(155, 155, 150, 0.1)" },
  pass: { label: "PASS", color: colors.success, bg: "rgba(56, 193, 114, 0.13)" },
  wait: { label: "WAIT", color: colors.orange, bg: "rgba(255, 107, 0, 0.14)" },
};

export const GatesScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const command = typed(COMMAND, frame, 10, 1.8);

  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top}px ${safe.x}px ${safe.bottom}px`,
        fontFamily: sans,
        color: colors.text,
      }}
    >
      <Kicker>02 · PROVE</Kicker>
      <Reveal delay={4} style={{ marginTop: 22 }}>
        <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1.04 }}>
          {t.gatesTitle}
        </div>
      </Reveal>
      <div style={{ marginTop: 30, fontFamily: mono, fontSize: 26, color: colors.text, height: 40 }}>
        <span style={{ color: colors.orange }}>$ </span>
        {command}
        {frame < ROWS_AT ? <Cursor /> : null}
      </div>

      <div
        style={{
          marginTop: 24,
          borderRadius: 22,
          border: `1px solid ${colors.border}`,
          backgroundColor: "rgba(14, 14, 14, 0.92)",
          boxShadow: "0 40px 120px rgba(0, 0, 0, 0.6)",
          overflow: "hidden",
          opacity: interpolate(frame, [ROWS_AT - 14, ROWS_AT - 4], [0, 1], clamp),
        }}
      >
        {GATES.map((gate, index) => {
          const at = ROWS_AT + index * ROW_STAGGER;
          const isHuman = gate === "human-review";
          const status: Status = frame < at + CHECK_TIME ? "run" : isHuman ? "wait" : "pass";
          const style = STATUS_STYLE[status];
          const rowIn = interpolate(frame, [at - 4, at + 4], [0, 1], { ...clamp, easing: easeOut });
          const settle = interpolate(frame, [at + CHECK_TIME, at + CHECK_TIME + 8], [0, 1], clamp);
          const pulse = isHuman && status === "wait" ? 0.55 + 0.45 * Math.abs(Math.sin((frame - at) / 9)) : 1;

          return (
            <div
              key={gate}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "0 28px",
                height: 98,
                borderTop: index === 0 ? "none" : `1px solid ${colors.border}`,
                opacity: interpolate(rowIn, [0, 1], [0.15, 1]),
                backgroundColor: isHuman && status === "wait" ? "rgba(255, 107, 0, 0.06)" : "transparent",
              }}
            >
              <div
                style={{
                  width: 118,
                  textAlign: "center",
                  padding: "8px 0",
                  borderRadius: 10,
                  fontFamily: mono,
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: style.color,
                  backgroundColor: style.bg,
                  border: `1px solid ${style.color}55`,
                  scale: `${status === "run" ? 1 : 1 + Math.sin(settle * Math.PI) * 0.14}`,
                  opacity: pulse,
                }}
              >
                {style.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontFamily: mono, fontSize: 31, fontWeight: 700 }}>{gate}</div>
                <div style={{ fontSize: 25, color: colors.muted, fontWeight: 500 }}>{t.gates[index]}</div>
              </div>
            </div>
          );
        })}
      </div>

      {GATES.filter((gate) => gate !== "human-review").map((gate, index) => (
        <Audio
          key={gate}
          name={`Click ${gate}`}
          src={staticFile("audio/sfx/mouse-click.wav")}
          from={ROWS_AT + index * ROW_STAGGER + CHECK_TIME}
          volume={0.22}
          premountFor={fps}
        />
      ))}

      <Reveal delay={OUTCOME_AT} distance={18} style={{ marginTop: 30 }}>
        <div style={{ fontFamily: mono, fontSize: 28, color: colors.muted }}>
          Outcome: <span style={{ color: colors.orange, fontWeight: 700 }}>AWAITING-APPROVAL</span>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
