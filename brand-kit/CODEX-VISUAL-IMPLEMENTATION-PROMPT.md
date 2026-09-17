# Codex prompt — apply Maverick brand

You are in the root of the Maverick AI Dev Stack repository.

A complete brand kit has been provided in a folder named `brand-kit/` (or equivalent). Treat the SVG logo files, `BRAND-GUIDE.md`, `UI-SPEC.md`, `design-tokens.css`, and `theme.css` as the source of truth for visual implementation.

## Mission

Apply the Maverick visual identity consistently across:

- documentation site;
- homepage;
- GitHub README;
- favicons and OpenGraph assets;
- CLI output;
- examples where branding is appropriate.

Do not redesign the logo unless an implementation limitation requires an adaptation. Preserve the provided symbol geometry and colors.

## Required actions

1. Copy or move brand assets into the repository's canonical assets directory.
2. Integrate design tokens into the docs/site theme.
3. Use the primary dark theme by default.
4. Implement the homepage described in `UI-SPEC.md`.
5. Build a reusable workflow component for:
   `BRIEF → CONTEXT → PLAN → BUILD → VERIFY → REVIEW → PR`.
6. Build a reusable terminal component using only real supported CLI commands.
7. Add favicon from the provided `favicon.svg`.
8. Add the horizontal brand mark to README without making it oversized.
9. Ensure CLI respects `NO_COLOR` and does not depend on orange to communicate status.
10. Verify 375px, 768px, and 1440px layouts.
11. Respect `prefers-reduced-motion`.
12. Use accessible contrast and visible keyboard focus.

## Visual constraints

Do not use:

- purple AI gradients;
- robot or brain icons;
- neural-network backgrounds;
- cyberpunk styling;
- excessive glassmorphism;
- background particles;
- fake terminal output;
- fake product metrics;
- fake npm/GitHub badges.

## Palette

Use exact tokens from `styles/design-tokens.css`.

Primary orange: `#FF6A00`.
Primary background: `#090909`.

Orange is an accent, not the dominant page background.

## Typography

Prefer Geist Sans and Geist Mono if already easy to load. Otherwise use the fallback stacks specified in the brand kit. Do not add a heavy font pipeline only for branding.

## Deliverable

When finished, create `docs/internal/VISUAL-IMPLEMENTATION-REPORT.md` containing:

- files changed;
- theme architecture;
- assets used;
- responsive decisions;
- accessibility decisions;
- remaining manual brand tasks;
- screenshots that should be manually reviewed after deploy.

Then run the site's build and existing quality checks. Do not publish, push, or deploy externally unless explicitly instructed.
