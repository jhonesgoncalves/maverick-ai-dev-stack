const plain = Boolean(process.env.NO_COLOR);

// Maverick AI brand tokens (maverick-ai-brandkit/tokens/brand.json). Orange is an accent;
// status colours keep their semantic meaning.
const palette = {
  brand: '#FF6B00',
  accent: '#FFB15A',
  text: '#F7F7F5',
  muted: '#9B9B96',
  subtle: '#5A5A56',
  success: '#38C172',
  warning: '#F6AD55',
  danger: '#EF5350',
  info: '#58A6FF',
  selection: '#21130A'
} as const;

export type Tone = keyof typeof palette;

/** Ink colour props for a tone; undefined under NO_COLOR so the terminal default is used. */
export function tone(name: Tone): string | undefined { return plain ? undefined : palette[name]; }

/** The mark's orange ramp, top to bottom, for the "AI" rows of the block logo. */
export const logoGradient = ['#FFB02E', '#FF9A19', '#FF8A1A', '#FF7A00', '#FF6B00', '#E85D00'];

export const theme = { ...palette, plain } as const;

export const symbols = {
  pointer: '❯', dot: '●', ring: '○', check: '✔', cross: '✖', branch: '⎇', diamond: '◆', search: '⌕', arrow: '→', ellipsis: '…'
} as const;
