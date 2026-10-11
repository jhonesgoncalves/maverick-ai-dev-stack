import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, mono, safe, sans } from "../theme";

const ROWS_AT = 18;
const ROW_STAGGER = 30;

export const CompareScene: React.FC<SceneProps> = ({ lang }) => {
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
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.06 }}>
          {t.compareTitle}
        </div>
      </Reveal>

      <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 26 }}>
        {t.compare.map((row, index) => {
          const at = ROWS_AT + index * ROW_STAGGER;
          const strike = interpolate(frame, [at + 12, at + 22], [0, 1], { ...clamp, easing: easeOut });
          const after = interpolate(frame, [at + 18, at + 30], [0, 1], { ...clamp, easing: easeOut });

          return (
            <Reveal key={row.after} delay={at}>
              <div
                style={{
                  padding: "28px 34px",
                  borderRadius: 22,
                  border: `1px solid ${colors.border}`,
                  backgroundColor: "rgba(14, 14, 14, 0.92)",
                }}
              >
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 22,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: colors.muted,
                  }}
                >
                  {row.label}
                </div>
                <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 26 }}>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 42,
                      fontWeight: 600,
                      color: interpolate(strike, [0, 1], [1, 0.45]) > 0.7 ? colors.text : colors.muted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.before}
                    <span
                      style={{
                        position: "absolute",
                        left: -4,
                        top: "52%",
                        height: 4,
                        width: `calc(${strike * 100}% + 8px)`,
                        borderRadius: 2,
                        backgroundColor: colors.danger,
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 40, color: colors.orange, opacity: after }}>→</span>
                  <span
                    style={{
                      padding: "10px 22px",
                      borderRadius: 12,
                      fontFamily: mono,
                      fontSize: 34,
                      fontWeight: 700,
                      color: colors.amber,
                      backgroundColor: colors.accentBg,
                      border: `1px solid ${colors.orange}`,
                      opacity: after,
                      translate: `${(1 - after) * 30}px 0px`,
                      boxShadow: "0 0 26px rgba(255, 107, 0, 0.2)",
                    }}
                  >
                    {row.after}
                  </span>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
