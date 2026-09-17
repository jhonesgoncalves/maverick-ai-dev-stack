# Maverick UI Specification

## Homepage

Desktop: two-column hero. Copy left, terminal right. Mobile: copy then terminal.

### Hero

Kicker: `OPEN-SOURCE AI ENGINEERING WORKFLOW`

H1:

> Menos prompt solto.\nMais contexto, escopo e revisão.

Body:

> An open-source engineering workflow for building with AI without accepting code you don't understand.

Primary CTA: `Get Started`

Secondary CTA: `GitHub`

Show `npm` only when a real package URL exists.

## Section order

1. Hero
2. Why Maverick
3. Workflow
4. Quick Start
5. Task Brief
6. Context Pack
7. Verify & Review
8. Adapters
9. Agents / Playbooks
10. Maverick Lab
11. Security
12. Open source / Contributing

## Responsive

- 375px: single column, no horizontal workflow overflow.
- 768px: tablet layout, avoid stretched mobile cards.
- 1440px: max content width about 1200px.
- Docs reading width: 720–800px.

## Navigation

Top nav: Docs / CLI / Workflow / Adapters / Lab / GitHub.

Docs sidebar groups:

GET STARTED
CONCEPTS
WORKFLOW
CLI
ADAPTERS
MAVERICK LAB
REFERENCE
CONTRIBUTING

## Status labels

Use uppercase monospace tags:

`CORE` `STABLE` `EXPERIMENTAL` `ADAPTER` `LAB`

Always pair color with text.

## Motion

150–220ms only. No continuous motion. Respect `prefers-reduced-motion`.
