// src/ui/theme.ts
var plain = Boolean(process.env.NO_COLOR);
var palette = {
  brand: "#FF6B00",
  accent: "#FFB15A",
  text: "#F7F7F5",
  muted: "#9B9B96",
  subtle: "#5A5A56",
  success: "#38C172",
  warning: "#F6AD55",
  danger: "#EF5350",
  info: "#58A6FF",
  selection: "#21130A"
};
function tone(name) {
  return plain ? void 0 : palette[name];
}
var logoGradient = ["#FFB02E", "#FF9A19", "#FF8A1A", "#FF7A00", "#FF6B00", "#E85D00"];
var theme = { ...palette, plain };
var symbols = {
  pointer: "\u276F",
  dot: "\u25CF",
  ring: "\u25CB",
  check: "\u2714",
  cross: "\u2716",
  branch: "\u2387",
  diamond: "\u25C6",
  search: "\u2315",
  arrow: "\u2192",
  ellipsis: "\u2026"
};

export {
  tone,
  logoGradient,
  theme,
  symbols
};
