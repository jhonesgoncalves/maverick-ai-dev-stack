import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Reveal } from "../components/Reveal";
import { Cursor, typed } from "../components/Chrome";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, mono, safe, sans } from "../theme";

type DiffFile = {
  readonly path: string;
  readonly add: number;
  readonly del: number;
  readonly flag?: "danger" | "warning";
};

// 8 visible files + 6 more = 14 files, 1,184 insertions, 16 deletions.
const FILES: DiffFile[] = [
  { path: "src/orders/orders.service.ts", add: 318, del: 6 },
  { path: "src/orders/orders.controller.ts", add: 212, del: 4 },
  { path: "test/orders.e2e-spec.ts", add: 187, del: 0 },
  { path: "src/common/pagination/cursor.ts", add: 141, del: 0 },
  { path: "src/orders/orders.repository.ts", add: 102, del: 0 },
  { path: "src/orders/dto/list-orders.dto.ts", add: 96, del: 0 },
  { path: "src/auth/auth.guard.ts", add: 38, del: 5, flag: "danger" },
  { path: "package.json", add: 3, del: 1, flag: "warning" },
];

const ROWS_START = 20;
const ROW_STAGGER = 5;
const FLAG_AT = 96;
const QUOTE_AT = 124;

export const HookScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();
  const counter = interpolate(frame, [ROWS_START, ROWS_START + 60], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top - 30}px ${safe.x}px ${safe.bottom}px`,
        fontFamily: sans,
        color: colors.text,
      }}
    >
      <Reveal>
        <div style={{ fontSize: 74, fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.05 }}>
          {t.hookLine1}
        </div>
      </Reveal>
      <Reveal delay={7}>
        <div
          style={{
            fontSize: 118,
            fontWeight: 800,
            letterSpacing: "-0.05em",
            lineHeight: 1.05,
            color: colors.orange,
          }}
        >
          {t.hookLine2}
        </div>
      </Reveal>

      <Reveal delay={12} style={{ marginTop: 48 }}>
        <div
          style={{
            borderRadius: 22,
            border: `1px solid ${colors.border}`,
            backgroundColor: "rgba(14, 14, 14, 0.92)",
            boxShadow: "0 40px 120px rgba(0, 0, 0, 0.6)",
            overflow: "hidden",
            fontFamily: mono,
          }}
        >
          <div
            style={{
              padding: "20px 30px",
              borderBottom: `1px solid ${colors.border}`,
              backgroundColor: colors.surface2,
              fontSize: 25,
              color: colors.muted,
            }}
          >
            <span style={{ color: colors.orange }}>$ </span>
            <span style={{ color: colors.text }}>{typed("git diff --stat", frame, 12, 1.2)}</span>
            {frame < ROWS_START + 10 ? <Cursor /> : null}
          </div>
          <div style={{ padding: "10px 0" }}>
            {FILES.map((file, index) => {
              const appear = ROWS_START + index * ROW_STAGGER;
              const rowIn = interpolate(frame, [appear, appear + 8], [0, 1], {
                ...clamp,
                easing: easeOut,
              });
              const flagIn = file.flag
                ? interpolate(
                    frame,
                    [FLAG_AT + (file.flag === "warning" ? 8 : 0), FLAG_AT + (file.flag === "warning" ? 18 : 10)],
                    [0, 1],
                    { ...clamp, easing: easeOut },
                  )
                : 0;
              const flagColor = file.flag === "danger" ? colors.danger : colors.warning;
              const plus = Math.max(1, Math.round(file.add / 30));

              return (
                <div
                  key={file.path}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    height: 56,
                    padding: "0 30px",
                    fontSize: 24,
                    opacity: rowIn,
                    translate: `${(1 - rowIn) * -30}px 0px`,
                    backgroundColor: file.flag
                      ? `rgba(${file.flag === "danger" ? "239, 83, 80" : "246, 173, 85"}, ${0.12 * flagIn})`
                      : "transparent",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 8,
                      bottom: 8,
                      width: 5,
                      borderRadius: 3,
                      backgroundColor: flagColor,
                      opacity: flagIn,
                    }}
                  />
                  <div style={{ flex: 1, color: colors.text, whiteSpace: "nowrap" }}>{file.path}</div>
                  <div style={{ position: "relative", width: 300, textAlign: "right" }}>
                    <span style={{ opacity: 1 - flagIn, whiteSpace: "nowrap" }}>
                      <span style={{ color: colors.muted }}>{file.add + file.del} </span>
                      <span style={{ color: colors.success }}>{"+".repeat(Math.min(plus, 11))}</span>
                      <span style={{ color: colors.danger }}>{file.del > 0 ? "-" : ""}</span>
                    </span>
                    {file.flag ? (
                      <span
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "50%",
                          translate: `0px -50%`,
                          scale: `${0.8 + 0.2 * flagIn}`,
                          opacity: flagIn,
                          padding: "5px 14px",
                          borderRadius: 8,
                          border: `1px solid ${flagColor}`,
                          color: flagColor,
                          fontFamily: sans,
                          fontSize: 23,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {file.flag === "danger" ? `⚠ ${t.authTouched}` : t.newDependency}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                padding: "8px 30px 4px",
                fontSize: 24,
                color: colors.muted,
                opacity: interpolate(frame, [ROWS_START + 42, ROWS_START + 50], [0, 1], clamp),
              }}
            >
              {t.moreFiles}
            </div>
          </div>
          <div
            style={{
              padding: "18px 30px",
              borderTop: `1px solid ${colors.border}`,
              fontSize: 24,
              color: colors.muted,
            }}
          >
            14 files changed,{" "}
            <span style={{ color: colors.success }}>{Math.round(1184 * counter)} insertions(+)</span>,{" "}
            <span style={{ color: colors.danger }}>{Math.round(16 * counter)} deletions(-)</span>
          </div>
        </div>
      </Reveal>

      <Reveal delay={QUOTE_AT} distance={24} style={{ marginTop: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: colors.success }}>✓</span>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
            {t.allTestsPass}
          </span>
        </div>
        <div style={{ marginTop: 6, paddingLeft: 62, fontSize: 30, color: colors.muted, fontWeight: 500 }}>
          — {t.quoteBy}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
