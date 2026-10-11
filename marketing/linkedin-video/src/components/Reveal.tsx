import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { clamp, easeOut } from "../theme";

type RevealProps = {
  readonly delay?: number;
  readonly duration?: number;
  readonly distance?: number;
  readonly style?: React.CSSProperties;
  readonly children: React.ReactNode;
};

// Fade, rise and unblur: the entrance every text block in the video uses.
export const Reveal: React.FC<RevealProps> = ({
  delay = 0,
  duration = 18,
  distance = 36,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <div
      style={{
        opacity: progress,
        translate: `0px ${(1 - progress) * distance}px`,
        filter: `blur(${(1 - progress) * 10}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
