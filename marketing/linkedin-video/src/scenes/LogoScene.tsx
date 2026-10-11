import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { MaverickMark, Wordmark } from "../components/Brand";
import { Reveal } from "../components/Reveal";
import { COPY, type SceneProps } from "../copy";
import { clamp, colors, safe, sans } from "../theme";

export const LogoScene: React.FC<SceneProps> = ({ lang }) => {
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
          position: "absolute",
          top: 160,
          left: 160,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 107, 0, 0.34), transparent 62%)",
          opacity: interpolate(frame, [0, 24, 120], [0, 1, 0.7], clamp),
          scale: interpolate(frame, [0, 120], [0.7, 1.1], clamp),
        }}
      />
      <div
        style={{
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
          scale: interpolate(frame, [0, 26], [0.55, 1], {
            ...clamp,
            easing: Easing.spring({ damping: 12 }),
            output: "perceptual-scale",
          }),
          rotate: interpolate(frame, [0, 26], ["-10deg", "0deg"], {
            ...clamp,
            easing: Easing.spring({ damping: 14 }),
          }),
        }}
      >
        <MaverickMark height={250} />
      </div>
      <Reveal delay={14} duration={20} style={{ marginTop: 56 }}>
        <Wordmark fontSize={124} />
      </Reveal>
      <Reveal delay={42} style={{ marginTop: 84 }}>
        <div style={{ fontSize: 50, fontWeight: 500, color: colors.muted, letterSpacing: "-0.02em" }}>
          {t.tagline1}
        </div>
      </Reveal>
      <Reveal delay={58} style={{ marginTop: 14 }}>
        <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.1 }}>
          {t.tagline2a}
          <br />
          <span style={{ color: colors.orange }}>{t.tagline2b}</span>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
