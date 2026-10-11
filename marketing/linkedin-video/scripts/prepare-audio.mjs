// Turns the locally generated audio in audio-src/ into the files the video plays (public/audio/)
// and records their lengths in src/audio-manifest.json, which the timeline uses to size each scene.
//
//   node scripts/prepare-audio.mjs
//
// Generate audio-src/ first (see README): tts_qwen.py (English), tts_chatterbox.py (Portuguese)
// and stable_audio.py (music and sound effects). Needs ffmpeg and ffprobe on the PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve("audio-src");
const OUT = path.resolve("public/audio");
const MANIFEST = path.resolve("src/audio-manifest.json");
const narration = JSON.parse(readFileSync(path.resolve("src/narration.json"), "utf8"));
const PAUSE = 0.28; // longest pause kept between sentences, in seconds

const durationOf = (file) =>
  Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      encoding: "utf8",
    }),
  );

const encode = (input, output, filter = "anull") =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-af", filter, "-ar", "48000", "-b:a", "192k", output]);

// Narration and effects are levelled so the two TTS engines sit at the same loudness.
const VOICE_LOUDNESS = "loudnorm=I=-16:TP=-1.5:LRA=11";
const SFX_LOUDNESS = "loudnorm=I=-18:TP=-1.5:LRA=11";

// Shortens pauses longer than PAUSE, drops leading and trailing silence and levels the clip.
const tighten = (input, output, duration) => {
  const { stderr } = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", input, "-af", "silencedetect=noise=-40dB:d=0.2", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((match) => Number(match[1]));
  const cuts = starts
    .map((start, index) => {
      const end = ends[index] ?? duration;
      if (start <= 0.01) return [0, Math.max(0, end - 0.04)];
      if (end >= duration - 0.01) return [start + 0.08, duration];
      return end - start > PAUSE ? [start + PAUSE / 2, end - PAUSE / 2] : null;
    })
    .filter(Boolean);
  encode(
    input,
    output,
    cuts.length
      ? `aselect='not(${cuts.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+")})',asetpts=N/SR/TB,${VOICE_LOUDNESS}`
      : VOICE_LOUDNESS,
  );
};

mkdirSync(OUT, { recursive: true });
const manifest = { voice: { pt: {}, en: {} }, music: null, sfx: false };
const missing = [];

for (const lang of ["pt", "en"]) {
  for (const scene of Object.keys(narration.lines[lang])) {
    const raw = path.join(SRC, `voice-${lang}-${scene}.wav`);
    if (!existsSync(raw)) {
      missing.push(path.relative(process.cwd(), raw));
      continue;
    }
    const file = path.join(OUT, `voice-${lang}-${scene}.mp3`);
    tighten(raw, file, durationOf(raw));
    manifest.voice[lang][scene] = durationOf(file);
  }
  console.log(`voice ${lang}: ${Object.values(manifest.voice[lang]).reduce((a, b) => a + b, 0).toFixed(1)}s`);
}

// The end of the first break in the middle of the track, where the beat drops back in.
// The video lines it up with the "You do" moment.
const findDrop = (file, duration) => {
  const { stderr } = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.4", "-f", "null", "-"], {
    encoding: "utf8",
  });
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((match) => Number(match[1]));
  return ends.find((end) => end > 10 && end < duration - 10) ?? null;
};

const music = path.join(SRC, "music.wav");
if (existsSync(music)) {
  encode(music, path.join(OUT, "music.mp3"));
  const seconds = durationOf(path.join(OUT, "music.mp3"));
  manifest.music = { seconds, loop: false, drop: findDrop(music, seconds) };
  console.log(`music: ${seconds}s, drop at ${manifest.music.drop ?? "none"}s`);
} else {
  missing.push(path.relative(process.cwd(), music));
}

const effects = Object.keys(narration.sfx).map((name) => [name, path.join(SRC, `sfx-${name}.wav`)]);
for (const [name, raw] of effects) {
  if (existsSync(raw)) encode(raw, path.join(OUT, `sfx-${name}.mp3`), SFX_LOUDNESS);
  else missing.push(path.relative(process.cwd(), raw));
}
manifest.sfx = effects.every(([, raw]) => existsSync(raw));

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
if (missing.length) console.warn(`not generated yet, left out of the video:\n  ${missing.join("\n  ")}`);
