import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, safe, sans } from "../theme";

export const DecisionScene: React.FC<SceneProps> = ({ lang }) => {
  const t = COPY[lang];
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        padding: `0 ${safe.x}px`,
        fontFamily: sans,
        color: colors.text,
        gap: 20,
      }}
    >
      <Reveal>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1.08, color: colors.muted }}>
          {t.decision1}
        </div>
      </Reveal>
      <div
        style={{
          fontSize: 124,
          fontWeight: 800,
          letterSpacing: "-0.055em",
          lineHeight: 1.02,
          whiteSpace: "pre-line",
          color: colors.orange,
          opacity: interpolate(frame, [16, 24], [0, 1], clamp),
          scale: interpolate(frame, [16, 34], [1.25, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 14 }),
            output: "perceptual-scale",
          }),
          transformOrigin: "left center",
          textShadow: "0 0 60px rgba(255, 107, 0, 0.35)",
        }}
      >
        {t.decision2}
      </div>
    </AbsoluteFill>
  );
};
