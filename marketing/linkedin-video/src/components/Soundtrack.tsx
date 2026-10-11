import { Audio } from "@remotion/media";
import type React from "react";
import { interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Lang } from "../copy";
import { clamp } from "../theme";
import { musicDrop, musicLoops, musicReady, ORDER, type SceneKey, sceneStarts, sfxReady, SWEEP, VOICE_LEAD, voiceFrames } from "../timeline";

type VoiceProps = {
  readonly lang: Lang;
  readonly scene: SceneKey;
};

// One narration clip, placed inside its scene's sequence.
export const Voice: React.FC<VoiceProps> = ({ lang, scene }) => {
  const { fps } = useVideoConfig();
  if (!voiceFrames(lang, scene)) return null;

  return (
    <Audio
      name={`Voice ${scene}`}
      src={staticFile(`audio/voice-${lang}-${scene}.mp3`)}
      from={VOICE_LEAD}
      premountFor={fps}
    />
  );
};

const MUSIC_LEVEL = 0.4;
const MUSIC_UNDER_VOICE = 0.13;
// Frame of the decision scene where "You do" lands (see DecisionScene).
const DROP_FRAME_IN_DECISION = 16;

type SoundtrackProps = {
  readonly lang: Lang;
  readonly total: number;
};

// Music that ducks under the narration, plus the whoosh and hit on the two light sweeps.
export const Soundtrack: React.FC<SoundtrackProps> = ({ lang, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const starts = sceneStarts(lang);

  // Start the track late enough that its drop lands on "You do".
  const trimBefore = musicDrop
    ? Math.max(0, Math.round(musicDrop * fps) - (starts.decision + DROP_FRAME_IN_DECISION))
    : 0;

  const ducking = Math.max(
    0,
    ...ORDER.map((scene) => {
      const spoken = voiceFrames(lang, scene);
      if (!spoken) return 0;
      const start = starts[scene] + VOICE_LEAD;
      return interpolate(frame, [start - 6, start, start + spoken, start + spoken + 12], [0, 1, 1, 0], clamp);
    }),
  );

  return (
    <>
      {musicReady ? (
        <Audio
          name="Music"
          src={staticFile("audio/music.mp3")}
          loop={musicLoops}
          trimBefore={trimBefore}
          volume={
            interpolate(frame, [0, 20, total - 45, total - 1], [0, 1, 1, 0], clamp) *
            interpolate(ducking, [0, 1], [MUSIC_LEVEL, MUSIC_UNDER_VOICE])
          }
        />
      ) : null}
      {sfxReady ? (
        <>
          <Audio name="Hit" src={staticFile("audio/sfx-hit.mp3")} from={starts.logo - 4} volume={0.55} premountFor={fps} />
          <Audio name="Whoosh" src={staticFile("audio/sfx-whoosh.mp3")} from={starts.logo - SWEEP / 2} volume={0.4} premountFor={fps} />
          <Audio name="Whoosh" src={staticFile("audio/sfx-whoosh.mp3")} from={starts.cta - SWEEP / 2} volume={0.4} premountFor={fps} />
        </>
      ) : null}
    </>
  );
};
