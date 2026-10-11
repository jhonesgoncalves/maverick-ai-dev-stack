"""Narrates one language of src/narration.json with Chatterbox Multilingual, cloning the
reference voice in local.chatterbox.reference (Ryan's English narration, so both versions
share one narrator).

    .venvs/chatterbox/bin/python scripts/tts_chatterbox.py pt [--force] [--base]

For Portuguese it loads Resemble AI's Brazilian Portuguese fine-tune
(ResembleAI/Chatterbox-Multilingual-pt-br); --base uses the general multilingual model.
Raw clips go to audio-src/voice-<lang>-<scene>.wav. Existing clips are kept unless --force.
"""

import json
import sys
from pathlib import Path

import torch
import torchaudio as ta
from chatterbox.models.s3gen import S3Gen
from chatterbox.models.t3 import T3
from chatterbox.models.t3.modules.t3_config import T3Config
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from huggingface_hub import snapshot_download
from safetensors.torch import load_file

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio-src"

args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
lang = args[0] if args else "pt"
force = "--force" in sys.argv
use_pack = lang == "pt" and "--base" not in sys.argv

narration = json.loads((ROOT / "src/narration.json").read_text())
config = narration["local"]["chatterbox"]
device = "mps" if torch.backends.mps.is_available() else "cpu"

model = ChatterboxMultilingualTTS.from_pretrained(device=device)
if use_pack:
    pack = Path(snapshot_download("ResembleAI/Chatterbox-Multilingual-pt-br"))
    t3 = T3(T3Config.multilingual())
    t3.load_state_dict(load_file(pack / "t3_pt_br.safetensors"))
    model.t3 = t3.to(device).eval()
    # The pack's s3gen_v3 may be newer than the installed package's S3Gen; keep the base
    # decoder unless the weights match exactly.
    s3gen = S3Gen()
    missing, unexpected = s3gen.load_state_dict(load_file(pack / "s3gen_v3.safetensors"), strict=False)
    if not missing and not unexpected:
        model.s3gen = s3gen.to(device).eval()
    print(f"loaded the pt-BR T3 fine-tune; s3gen_v3 {'used' if model.s3gen is s3gen else 'skipped'}", flush=True)

OUT.mkdir(exist_ok=True)
for scene, text in narration["lines"][lang].items():
    target = OUT / f"voice-{lang}-{scene}.wav"
    if target.exists() and not force:
        continue
    wav = model.generate(
        text,
        language_id=lang,
        audio_prompt_path=str(ROOT / config["reference"]),
        exaggeration=config["exaggeration"],
        cfg_weight=config["cfgWeight"],
    )
    ta.save(str(target), wav, model.sr)
    print(f"{lang} {scene}: {target.name}", flush=True)
