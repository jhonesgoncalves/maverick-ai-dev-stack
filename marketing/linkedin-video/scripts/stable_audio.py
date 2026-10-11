"""Generates the background music and the sound effects locally with Stable Audio 3.

    set -a; . ./.env; set +a; .venvs/sa3/bin/python scripts/stable_audio.py [music] [sfx] [--force]

Uses the Small-Music and Small-SFX models, which are gated on Hugging Face: accept their terms
and put a read token in .env as HF_TOKEN. Both are under the Stability AI Community License
(free commercial use below $1M annual revenue, with registration). Writes audio-src/music.wav
and audio-src/sfx-<name>.wav; scripts/prepare-audio.mjs encodes them for the video.
"""

import json
import sys
from pathlib import Path

import torchaudio
from stable_audio_3 import StableAudioModel

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio-src"

args = [arg for arg in sys.argv[1:] if not arg.startswith("--")] or ["music", "sfx"]
force = "--force" in sys.argv
narration = json.loads((ROOT / "src/narration.json").read_text())
OUT.mkdir(exist_ok=True)


def render(model, target, prompt, seconds, seed=-1, negative_prompt=None):
    if target.exists() and not force:
        print(f"{target.name} exists; pass --force to generate it again")
        return
    audio = model.generate(prompt=prompt, negative_prompt=negative_prompt, duration=seconds, seed=seed)
    torchaudio.save(str(target), audio[0].cpu(), model.model.sample_rate)
    print(f"{target.name}: {audio.shape[-1] / model.model.sample_rate:.1f}s", flush=True)


if "music" in args:
    music = narration["music"]
    render(
        StableAudioModel.from_pretrained("small-music"),
        OUT / "music.wav",
        music["prompt"],
        music["seconds"],
        music.get("seed", -1),
        music.get("negativePrompt"),
    )

if "sfx" in args:
    model = StableAudioModel.from_pretrained("small-sfx")
    for name, effect in narration["sfx"].items():
        render(model, OUT / f"sfx-{name}.wav", effect["text"], effect["seconds"], effect.get("seed", -1))
