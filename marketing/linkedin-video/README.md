# Maverick AI LinkedIn promo

A 50-second promo for the LinkedIn feed, built with [Remotion](https://www.remotion.dev). It is 1080×1350 (4:5) at 30 fps, with Portuguese and English versions rendered from the same scenes.

| Scene | What it shows |
| --- | --- |
| Hook | An agent's 1,200-line diff with a touched auth guard, a new dependency and "all tests pass" |
| Question | "Would you merge it?", then "AI made diffs cheap. Trust got expensive." |
| Logo | Maverick AI and the tagline |
| Plan | `maverick new` in a terminal and the PRD → SPEC → TECHSPEC → TASKS → BUILD → REVIEW → SHIP stages |
| Gates | The seven gates of the `ship` flow, ending in AWAITING-APPROVAL |
| Decision | "Maverick never merges. You do." |
| Compare | Prompt → diff vs. Maverick: PRD.md, EVIDENCE.md, REVIEW.md |
| Lens | Lens screenshots from `site/public/screens/` |
| Agents | The nine supported agents, local only, no telemetry, MIT |
| CTA | `npx @maverick-ai/cli init` and the repository URL |

All on-screen text lives in [src/copy.ts](src/copy.ts). Colours and fonts follow `maverick-ai-brandkit/`, and they are set in [src/theme.ts](src/theme.ts).

## Audio

Everything is generated locally, with open models whose licenses allow commercial use. The narration script, voice settings and music prompt are in [src/narration.json](src/narration.json).

| Part | Model | License |
| --- | --- | --- |
| English narration | [Qwen3-TTS 1.7B CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice), speaker Ryan, via [mlx-audio](https://github.com/Blaizzy/mlx-audio) | Apache-2.0 |
| Portuguese narration | [Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox) with the [pt-BR fine-tune](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br), cloning Ryan from `audio-src/reference-ryan.wav` | MIT |
| Music, logo hit, whoosh | [Stable Audio 3](https://github.com/Stability-AI/stable-audio-3) Small-Music and Small-SFX | [Stability AI Community License](https://stability.ai/community-license-agreement) |
| Gate clicks | Remotion sound-effect library | |

The Stable Audio 3 models are gated: accept their terms on Hugging Face ([music](https://huggingface.co/stabilityai/stable-audio-3-small-music), [sfx](https://huggingface.co/stabilityai/stable-audio-3-small-sfx)) and put a read token in `.env` as `HF_TOKEN=...`. Commercial use is free below $1M annual revenue once you [register with Stability](https://stability.ai/community-license).

Set up the three Python environments once (Python 3.11, Apple Silicon):

```bash
python3.11 -m venv .venvs/mlx && .venvs/mlx/bin/pip install --pre mlx-audio
```

```bash
python3.11 -m venv .venvs/chatterbox && .venvs/chatterbox/bin/pip install chatterbox-tts
```

```bash
python3.11 -m venv .venvs/sa3 && .venvs/sa3/bin/pip install "git+https://github.com/Stability-AI/stable-audio-3"
```

Then generate the raw audio into `audio-src/` and prepare it for the video:

```bash
.venvs/mlx/bin/python scripts/tts_qwen.py en
```

```bash
.venvs/chatterbox/bin/python scripts/tts_chatterbox.py pt
```

```bash
set -a; . ./.env; set +a; .venvs/sa3/bin/python scripts/stable_audio.py
```

```bash
node scripts/prepare-audio.mjs
```

`prepare-audio.mjs` shortens the pauses in the narration, writes `public/audio/`, and records each clip's length in `src/audio-manifest.json`. Scenes stretch to fit their narration, and the music ducks while the voice speaks. Every generator keeps existing files; pass `--force` to generate them again.

## Commands

```bash
npm install
```

```bash
npm run dev
```

The second command opens Remotion Studio, which has the full videos (`MaverickPromo-PT`, `MaverickPromo-EN`) and each scene on its own under *Scenes*.

Render both videos and their covers:

```bash
npx remotion render MaverickPromo-PT out/maverick-ai-linkedin-pt.mp4 --props='{"lang":"pt"}' --crf=16
```

```bash
npx remotion render MaverickPromo-EN out/maverick-ai-linkedin-en.mp4 --props='{"lang":"en"}' --crf=16
```

```bash
npx remotion still MaverickPromo-PT out/maverick-ai-linkedin-pt-cover.png --frame=160 --props='{"lang":"pt"}'
```

Render review frames of individual scenes into `out/stills/`:

```bash
node scripts/stills.mjs en Hook:165 Gates:185 Lens:110
```

## Agent skills

The official [Remotion agent skills](https://github.com/remotion-dev/skills) go in `.claude/skills/`, where Claude Code loads them automatically for files in this folder. That repository has no license file, so the skills are git-ignored rather than committed. Install them in this folder with:

```bash
npx skills add remotion-dev/skills
```

## License

Remotion is free for individuals and companies with up to three people. Larger companies need a [company license](https://www.remotion.pro/license).
