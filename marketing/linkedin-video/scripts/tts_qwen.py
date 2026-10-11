"""Narrates one language of src/narration.json with Qwen3-TTS through mlx-audio.

    .venvs/mlx/bin/python scripts/tts_qwen.py en [--force]

Raw clips go to audio-src/voice-<lang>-<scene>.wav; scripts/generate-audio.mjs tightens
them into public/audio/. Existing clips are kept unless --force is passed.
"""

import json
import sys
from pathlib import Path

from mlx_audio.tts.generate import generate_audio
from mlx_audio.tts.utils import load_model

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio-src"
LANGUAGES = {"en": "English", "pt": "Portuguese"}

args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
lang = args[0] if args else "en"
force = "--force" in sys.argv

narration = json.loads((ROOT / "src/narration.json").read_text())
config = narration["local"]["qwen"]
OUT.mkdir(exist_ok=True)

model = load_model(model_path=config["model"])
for scene, text in narration["lines"][lang].items():
    target = OUT / f"voice-{lang}-{scene}.wav"
    if target.exists() and not force:
        continue
    generate_audio(
        text=text,
        model=model,
        voice=config["voice"],
        instruct=config["instruct"],
        lang_code=LANGUAGES[lang],
        output_path=str(OUT),
        file_prefix=f"voice-{lang}-{scene}",
        audio_format="wav",
        verbose=False,
    )
    # mlx-audio numbers its output segments; each line is a single segment.
    (OUT / f"voice-{lang}-{scene}_000.wav").rename(target)
    print(f"{lang} {scene}: {target.name}", flush=True)
