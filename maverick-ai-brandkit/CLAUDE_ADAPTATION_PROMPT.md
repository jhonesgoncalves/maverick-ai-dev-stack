# Prompt for Claude Code — Apply Maverick AI Brand

You are adapting an existing software project to the **Maverick AI** brand.

The `maverick-ai-brandkit/` directory is the source of truth for visual identity. Before editing anything, inspect:

- `BRAND_GUIDELINES.md`
- `tokens/brand.css`
- `tokens/brand.json`
- `assets/logo/svg/`
- `components/MaverickLogo.tsx`
- the existing project structure, framework, design system and theme implementation.

## Objective
Rebrand the current product as **Maverick AI**, a premium AI-powered developer workspace and devtools product. Preserve existing functionality and architecture while making the experience visually coherent with the supplied brand.

## Required changes
1. Replace old product names, logos and generic placeholders in user-facing UI with `Maverick AI` / `Maverick` where appropriate.
2. Use `assets/logo/svg/maverick-ai-logo-dark.svg` on dark navigation/marketing surfaces and the standalone mark in compact locations.
3. Update favicon/app icon using the mark supplied in the brand kit.
4. Apply the brand tokens globally rather than scattering raw hex values throughout components.
5. Make the default product UI dark-first:
   - background `#070707`
   - surfaces `#0E0E0E` and `#151515`
   - border `#292929`
   - text `#F7F7F5`
   - muted text `#9B9B96`
   - primary orange `#FF6B00`
6. Orange is an accent. Use it for the primary CTA, active navigation state, focus/selection, important graph edges, badges and restrained highlights. Do not turn large UI areas orange.
7. Keep semantic success/warning/error colors distinct.
8. Prefer Inter/Geist for UI and JetBrains Mono/Geist Mono for technical/code areas if those fonts are already available. Do not add proprietary font files.
9. Update page metadata/title/theme-color and any PWA manifest that already exists.
10. Update empty states, login/onboarding, top bar/sidebar, buttons, cards, tabs, forms, command palette and developer dashboards so they feel like one product.
11. If the project has architecture graphs, traces, agents, tasks, logs or terminal surfaces, prioritize information density and readability over decoration.
12. Use subtle orange glow only where it adds hierarchy. Avoid excessive neon/cyberpunk effects.
13. Do not copy Compozy assets, layout, icons or proprietary visual elements. The direction is black/orange premium developer tooling, but Maverick AI must remain visually original.

## Engineering constraints
- First inspect the current stack and reuse its component primitives/design system.
- Do not rewrite working components only to change appearance.
- Do not rename internal APIs, package names, environment variables, database identifiers or public contracts unless they are explicitly branding-only.
- Keep responsive behavior and accessibility.
- Preserve keyboard navigation and focus states.
- Ensure sufficient contrast.
- Avoid new dependencies unless genuinely necessary.
- If Tailwind is present, merge the supplied tokens into the existing theme instead of replacing the config wholesale.
- If CSS variables are present, map Maverick variables to existing semantic variables.

## Validation
After the changes:
1. run formatting/linting;
2. run typecheck;
3. run tests if present;
4. run the production build;
5. fix regressions introduced by the rebrand.

## Deliverable
At the end, provide:
- concise summary of the visual changes;
- list of major files changed;
- any places where old branding intentionally remains and why;
- commands used to validate the project;
- screenshots or preview instructions if the environment supports them.

Do not stop after changing only the logo. The goal is a coherent **Maverick AI product identity** across the application while preserving the product's functionality.
