import manifest from "./audio-manifest.json";
import type { Lang } from "./copy";

export const FPS = 30;

// Minimum length of each scene, set by its animation. A longer voiceover line stretches it.
export const SCENES = {
  hook: 180,
  question: 120,
  logo: 120,
  plan: 210,
  gates: 195,
  decision: 90,
  compare: 165,
  lens: 195,
  agents: 150,
  cta: 165,
};

export type SceneKey = keyof typeof SCENES;

export const ORDER: SceneKey[] = ["hook", "question", "logo", "plan", "gates", "decision", "compare", "lens", "agents", "cta"];

// Overlap of the transition after each scene. Light-sweep cuts (question → logo, agents → cta)
// do not overlap, so they are 0.
export const TRANSITIONS: Record<SceneKey, number> = {
  hook: 12,
  question: 0,
  logo: 16,
  plan: 16,
  gates: 10,
  decision: 16,
  compare: 14,
  lens: 16,
  agents: 0,
  cta: 0,
};

export const SWEEP = 30;

// The voiceover starts this many frames into a scene and leaves this much room before the next.
export const VOICE_LEAD = 8;
const VOICE_TAIL = 14;

const voice = manifest.voice as Record<Lang, Partial<Record<SceneKey, number>>>;
const music = manifest.music as { seconds: number; loop: boolean; drop?: number | null } | null;
export const musicReady = Boolean(music);
export const musicLoops = music?.loop ?? false;
export const musicDrop = music?.drop ?? null;
export const sfxReady = manifest.sfx;

export const voiceFrames = (lang: Lang, scene: SceneKey) => {
  const seconds = voice[lang][scene];
  return seconds ? Math.ceil(seconds * FPS) : 0;
};

export const sceneDurations = (lang: Lang) =>
  Object.fromEntries(
    ORDER.map((scene) => {
      const spoken = voiceFrames(lang, scene);
      return [scene, Math.max(SCENES[scene], spoken ? VOICE_LEAD + spoken + VOICE_TAIL + TRANSITIONS[scene] : 0)];
    }),
  ) as Record<SceneKey, number>;

// Frame at which each scene starts in the full video.
export const sceneStarts = (lang: Lang) => {
  const durations = sceneDurations(lang);
  const starts = {} as Record<SceneKey, number>;
  let cursor = 0;
  for (const scene of ORDER) {
    starts[scene] = cursor;
    cursor += durations[scene] - TRANSITIONS[scene];
  }
  return starts;
};

export const promoDuration = (lang: Lang) => {
  const durations = sceneDurations(lang);
  return ORDER.reduce((total, scene) => total + durations[scene] - TRANSITIONS[scene], 0);
};

export const hasVoice = (lang: Lang) => ORDER.some((scene) => voiceFrames(lang, scene) > 0);
