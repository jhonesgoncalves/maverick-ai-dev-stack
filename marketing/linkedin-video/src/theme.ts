import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Easing } from "remotion";

// Tokens from maverick-ai-brandkit/tokens/brand.css. Orange is an accent, not a wallpaper.
export const colors = {
  orange: "#FF6B00",
  orangeBright: "#FF8A1A",
  amber: "#FFB15A",
  accentBg: "#21130A",
  bg: "#070707",
  surface1: "#0E0E0E",
  surface2: "#151515",
  surface3: "#1C1C1C",
  border: "#292929",
  text: "#F7F7F5",
  muted: "#9B9B96",
  success: "#38C172",
  warning: "#F6AD55",
  danger: "#EF5350",
};

export const { fontFamily: sans } = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "latin-ext"],
});

export const { fontFamily: mono } = loadMono("normal", {
  weights: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
});

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

// Content stays inside this frame (1080×1350, LinkedIn 4:5).
export const safe = { x: 80, top: 150, bottom: 110 };
