import type React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Kicker } from "../components/Chrome";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, easeOut, mono, safe, sans } from "../theme";

const SHOT_LENGTH = 70;
const CROSSFADE = 14;
const FRAME_WIDTH = 920;
const SCREEN_HEIGHT = 560;
const IMAGE_WIDTH = 1500; // the 2880×1800 screenshots, scaled so their text stays legible

// Each shot pans across the part of the screenshot worth reading.
const SHOTS = [
  { file: "screens/lens-task.png", from: [-250, -50], to: [-262, -200], zoom: [1, 1.03] },
  { file: "screens/lens-gates.png", from: [-250, -270], to: [-255, -377], zoom: [1, 1.02] },
  { file: "screens/devtools-overview.png", from: [-250, -50], to: [-245, -110], zoom: [1, 1.08] },
] as const;

export const LensScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();
  const tilt = interpolate(frame, [0, 30], [16, 0], { ...clamp, easing: easeOut });
  // The chip switches halfway through each crossfade.
  const active = Math.max(
    0,
    Math.min(SHOTS.length - 1, Math.floor((frame - CROSSFADE / 2) / (SHOT_LENGTH - CROSSFADE))),
  );

  return (
    <AbsoluteFill
      style={{
        padding: `${safe.top}px ${safe.x}px ${safe.bottom}px`,
        fontFamily: sans,
        color: colors.text,
      }}
    >
      <Kicker>03 · LENS</Kicker>
      <Reveal delay={4} style={{ marginTop: 22 }}>
        <div style={{ fontSize: 74, fontWeight: 800, letterSpacing: "-0.05em", whiteSpace: "pre-line", lineHeight: 1.05 }}>
          {t.lensTitle}
        </div>
      </Reveal>

      <div style={{ marginTop: 44, perspective: 1600 }}>
        <div
          style={{
            width: FRAME_WIDTH,
            borderRadius: 22,
            border: `1px solid ${colors.border}`,
            backgroundColor: colors.surface1,
            overflow: "hidden",
            boxShadow: "0 50px 140px rgba(0, 0, 0, 0.7), 0 0 60px rgba(255, 107, 0, 0.08)",
            transform: `rotateX(${tilt}deg)`,
            transformOrigin: "center bottom",
            opacity: interpolate(frame, [0, 14], [0, 1], clamp),
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 56,
              padding: "0 24px",
              borderBottom: `1px solid ${colors.border}`,
              backgroundColor: colors.surface2,
            }}
          >
            {[0, 1, 2].map((dot) => (
              <div key={dot} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#2F2F2F" }} />
            ))}
            <div
              style={{
                marginLeft: 16,
                flex: 1,
                padding: "6px 16px",
                borderRadius: 8,
                backgroundColor: colors.surface1,
                fontFamily: mono,
                fontSize: 20,
                color: colors.muted,
              }}
            >
              <span style={{ color: colors.success }}>●</span> 127.0.0.1:4173
            </div>
          </div>
          <div style={{ position: "relative", height: SCREEN_HEIGHT, overflow: "hidden" }}>
            {SHOTS.map((shot, index) => {
              const start = index * (SHOT_LENGTH - CROSSFADE);
              const end = start + SHOT_LENGTH;
              const opacity =
                index === 0
                  ? interpolate(frame, [end - CROSSFADE, end], [1, 0], clamp)
                  : index === SHOTS.length - 1
                    ? interpolate(frame, [start, start + CROSSFADE], [0, 1], clamp)
                    : interpolate(frame, [start, start + CROSSFADE, end - CROSSFADE, end], [0, 1, 1, 0], clamp);
              const progress = interpolate(frame, [start, index === SHOTS.length - 1 ? start + SHOT_LENGTH + 30 : end], [0, 1], {
                ...clamp,
                easing: easeOut,
              });

              return (
                <Img
                  key={shot.file}
                  src={staticFile(shot.file)}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: IMAGE_WIDTH,
                    opacity,
                    translate: `${interpolate(progress, [0, 1], [shot.from[0], shot.to[0]])}px ${interpolate(
                      progress,
                      [0, 1],
                      [shot.from[1], shot.to[1]],
                    )}px`,
                    scale: `${interpolate(progress, [0, 1], [shot.zoom[0], shot.zoom[1]])}`,
                    transformOrigin: "40% 30%",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 30, display: "flex", gap: 12 }}>
        {t.lensShots.map((label, index) => (
          <div
            key={label}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 600,
              border: `1px solid ${index === active ? colors.orange : colors.border}`,
              color: index === active ? colors.amber : colors.muted,
              backgroundColor: index === active ? colors.accentBg : "transparent",
              opacity: interpolate(frame, [16, 26], [0, 1], clamp),
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <Reveal delay={40} style={{ marginTop: 30 }}>
        <div style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.3, color: colors.muted, letterSpacing: "-0.015em" }}>
          {t.lensCaption}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
