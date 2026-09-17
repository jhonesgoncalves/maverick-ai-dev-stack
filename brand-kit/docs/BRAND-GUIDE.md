# Maverick AI Dev Stack — Brand Guide

## Brand idea

Maverick is the engineering workflow around AI-assisted development.

**Primary positioning**

> Menos prompt solto. Mais contexto, escopo e revisão.

**Brand principle**

> AI writes. Engineers decide.

Maverick must feel precise, technical, calm, premium, and independent from any AI vendor.

## Logo concept

The symbol is an angular **M** built from directional strokes. It should evoke code brackets, progression through a workflow, and a review gate without becoming a literal shield or AI icon.

### Logo files

- `logo-symbol.svg` — primary orange symbol on transparent background.
- `logo-symbol-on-dark.svg` — avatar / npm / GitHub icon.
- `logo-symbol-white.svg` — monochrome white variant.
- `logo-horizontal.svg` — horizontal lockup for dark backgrounds.
- `logo-horizontal-light.svg` — horizontal lockup for light backgrounds.
- `wordmark.svg` — text-only brand mark.
- `favicon.svg` — compact favicon.

## Clear space

Use at least **25% of the symbol width** as clear space around the logo. Do not place the mark tightly against cards, text, or browser edges.

## Minimum size

- Full horizontal mark: 180px CSS width minimum.
- Symbol: 24px minimum in UI.
- Favicon: use the dedicated favicon asset.

## Colors

| Token | Hex | Usage |
|---|---|---|
| Maverick Orange | `#FF6A00` | CTA, active state, signature accents |
| Orange Hover | `#FF7A1A` | hover |
| Background | `#090909` | primary dark background |
| Surface | `#121212` | cards / docs surfaces |
| Surface Raised | `#171717` | nested UI |
| Text | `#F5F5F5` | primary text |
| Muted | `#A3A3A3` | secondary text |
| Border | `#2A2A2A` | borders / dividers |

Orange is a signature accent, not a background paint bucket.

## Typography

Recommended:

- UI and headings: **Geist Sans**; fallback Inter/system-ui.
- Code and engineering labels: **Geist Mono**; fallback JetBrains Mono/ui-monospace.

Large headings should use slightly negative tracking. Engineering labels can use uppercase monospace and wider letter spacing.

## Visual grammar

The workflow is a core visual asset:

`BRIEF → CONTEXT → PLAN → BUILD → VERIFY → REVIEW → PR`

Use numbered labels when space allows:

- `01 / BRIEF`
- `02 / CONTEXT`
- `03 / PLAN`
- `04 / BUILD`
- `05 / VERIFY`
- `06 / REVIEW`
- `07 / PR`

`REVIEW` may receive stronger orange emphasis because human inspection is a central brand principle.

## UI components

### Cards

Dark surface, 1px border, 10–14px radius. Minimal shadow. Hover is a subtle border shift and at most 1–2px translation.

### Buttons

Primary: orange background, near-black text. Secondary: transparent/dark, neutral border, white text.

### Code blocks

Code is a first-class visual asset. Prefer high contrast and restrained syntax highlighting. Avoid rainbow-heavy themes.

### Terminal

A terminal mockup is preferred over generic AI artwork.

Example:

```text
$ npx maverick-ai init

⚔ MAVERICK

✓ project detected
✓ adapter: codex
✓ workflow initialized

Next:
  maverick task add-pagination
```

Only show commands/output actually supported by the product.

## Maverick Lab

Experiments should use:

- `LAB / 001`
- `QUESTION`
- `SETUP`
- `EVIDENCE`
- `OBSERVATION`
- `LIMITATION`

Never visually imply scientific certainty where the experiment is exploratory.

## Do

- use engineering evidence;
- use dark surfaces and whitespace;
- highlight decisions, review, and verification;
- keep vendor logos secondary;
- keep mobile layouts simple;
- use the symbol as a small signature, not wallpaper.

## Don't

- purple/blue AI gradients;
- robot heads;
- AI brains;
- neural-network wallpapers;
- crypto aesthetics;
- gaming-clan styling;
- giant glowing logos;
- excessive glassmorphism;
- animated particles;
- fake terminal commands;
- fake badges or metrics.

## GitHub usage

Use the horizontal logo or symbol near the top of README. Keep installation visible immediately. Avoid giant decorative banners.

## npm usage

Use `logo-symbol-on-dark.svg` or a PNG exported from it as package/avatar art. It must remain readable at 32px.

## Documentation usage

Dark by default. Orange active navigation. Reading width approximately 720–800px for long-form docs. Use the workflow component as a recurring navigation metaphor.

## CLI usage

CLI branding should be compact:

```text
⚔ MAVERICK
```

Respect `NO_COLOR`. Never rely on color alone to convey state.
