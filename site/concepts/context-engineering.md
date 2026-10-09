# Context engineering

<p class="mv-kicker">CONCEPT · WHAT THE AGENT NEEDS TO SEE</p>

Context is the smallest set of real information an agent needs to make a change well: the files it will touch and why, the tests next to them, the modules where a change ripples, the commands that prove it works, and the paths it must leave alone. Context engineering is choosing that set on purpose instead of hoping the agent finds it.

<ConceptMap current="context-engineering" />

## Too little, too much

Both failure modes are common, and they fail differently:

<div class="mv-anatomy">
  <div class="bad"><b>Too little</b><span>The agent guesses. It invents a <code>utils/pagination.ts</code> next to the one you already have, edits the controller when the logic lives in the service, and runs <code>npm test</code> in a repo that uses <code>pnpm</code>.</span></div>
  <div class="bad"><b>Too much</b><span>The whole repository is pasted in. Signal drowns in noise, cost and latency climb, and secrets or customer data end up in a prompt they never needed to be in.</span></div>
  <div class="good"><b>Grounded</b><span>Six ranked files with the reason for each, three nearby tests, one shared module flagged as risky, the real verify commands and a do-not-touch list.</span></div>
  <div class="good"><b>Bounded</b><span>Generated folders and lockfiles are excluded up front, so the agent cannot "fix" <code>dist/</code> or hand-edit <code>package-lock.json</code>.</span></div>
</div>

## How Maverick grounds a change

When you run `maverick new "<idea>"`, Maverick grounds the idea **locally and deterministically** before any agent sees it. No model is involved, so the same idea in the same repository always gives the same context.

<ol class="mv-steps">
  <li><h3>Extract terms</h3><p>The idea is folded (accents removed), split, stripped of English and Portuguese stopwords and stemmed: "Adicionar paginação na rota de orders" and "Add pagination to the orders route" land on the same terms.</p></li>
  <li><h3>Score every source file</h3><p>A term in the <b>file name</b> weighs 6, in the <b>path</b> 3, and each <b>mention</b> in the source 0.5. Rare terms count more than common ones (IDF), and the score is multiplied by how many different terms matched, so a file that matches "orders" <i>and</i> "pagination" beats one that mentions "orders" forty times.</p></li>
  <li><h3>Cut the long tail</h3><p>Only files within reach of the best match (at least 12% of its score) are kept, up to eight. Each comes with up to three reasons.</p></li>
  <li><h3>Walk the import graph</h3><p>For each relevant file: tests within two hops that exercise it, the modules it imports, matching routes and entry points, and whether it is <b>shared</b> (five or more importers, or a hub), where a change ripples.</p></li>
  <li><h3>Add the guardrails</h3><p>The verification commands detected for your stack, the project's instruction files (<code>CLAUDE.md</code>, <code>AGENTS.md</code>…), and a do-not-touch list of generated folders and lockfiles.</p></li>
</ol>

## Try it: ground an idea

This is a browser-sized version of the same algorithm, over a small NestJS-style sample repository. Type your own idea or pick an example and watch the ranking change.

<GroundingDemo />

## What the agent receives

Every stage skill reads its context from the CLI, so the workflow and the context live in one place:

```bash
maverick instructions add-cursor-pagination-orders-endpoint techspec --json
```

```json
{
  "task": "add-cursor-pagination-orders-endpoint",
  "workflow": "standard",
  "stage": "techspec",
  "skill": "maverick-new",
  "focus": { "id": "techspec", "skill": "maverick-techspec", "path": ".maverick/tasks/add-cursor-pagination-orders-endpoint/TECHSPEC.md" },
  "upstream": [".maverick/tasks/add-cursor-pagination-orders-endpoint/PRD.md"],
  "grounding": {
    "terms": ["cursor", "pagina", "order", "endpoi"],
    "relevant": [
      { "path": "src/orders/orders.controller.ts", "score": 41.2,
        "reasons": ["name matches \"order\"", "mentions \"endpoi\" 2×"],
        "fanIn": 1, "dependents": 3, "tests": ["test/orders.e2e-spec.ts"], "commits": 14 }
    ],
    "tests": ["test/orders.e2e-spec.ts", "src/common/pagination.spec.ts"],
    "shared": [{ "path": "src/common/pagination.ts", "importers": 6 }],
    "routes": [{ "method": "GET", "path": "/orders", "file": "src/orders/orders.controller.ts" }],
    "commands": [{ "name": "test", "command": "npm test", "cwd": "." }],
    "doNotTouch": ["dist/", "package-lock.json"]
  },
  "findings": [],
  "authoring": { "context": "Public API is versioned under /v2." },
  "validate": "maverick validate add-cursor-pagination-orders-endpoint --stage techspec"
}
```

The output also lists the required headings for the stage, the earlier artifacts to read first (`upstream`), the current validation findings, your project rules (`authoring`), the language rule and the task progress. The agent starts reading at the top of `relevant`, extends the listed tests, and treats `shared` files as places where a small change has a large blast radius.

## Your own context

Grounding finds what the code says. Some things only your team knows. Put them in `.maverick/config.json` and every stage skill receives them:

```json
{
  "authoring": {
    "context": "Public API is versioned under /v2. Money is stored in integer cents.",
    "rules": {
      "PRD": ["Every user story names its persona"],
      "TECHSPEC": ["Every endpoint change lists its error codes"]
    }
  }
}
```

Keep this short. It is read on every stage, so every line costs attention. Put conventions that apply to all agent work, not only Maverick tasks, in your adapter's instruction file instead: see [Adapters](/integrations/claude-code).

## Common mistakes

- **Pasting the whole repository.** More context is not better context. It is slower, costlier and leaks more.
- **Pasting secrets or production data** to "help the agent understand". Use a fixture or a description of the shape.
- **Grounding once and never again.** If the PRD shifts to another module, re-run `maverick new <slug>` or read `maverick instructions` again: the grounding follows the task.
- **Ignoring the shared list.** A change to a file with nine importers deserves its own test plan entry and a look at `maverick impact <path>`.
- **Writing rules nobody can check.** "Write clean code" is noise. "Every endpoint change lists its error codes" can be reviewed.

## Checklist

- [ ] The relevant files are ordered, and each has a reason
- [ ] Nearby tests are named, so the agent extends them instead of inventing new ones
- [ ] Shared modules are flagged as risky
- [ ] Verification commands are the real ones for this stack
- [ ] Do-not-touch boundaries are named
- [ ] No secret, credential or personal data is in any prompt

## Commands

| Command | Does |
|---|---|
| `maverick new "<idea>"` | Grounds the idea and opens the agent with it |
| `maverick instructions <task> [stage] --json` | Returns the grounding, artifacts and findings a skill reads |
| `maverick stack` | Shows the detected languages, frameworks and verification commands |
| `maverick impact <path>` | Lists direct and transitive dependents, tests and routes of a file |
| `maverick graph` · `maverick hotspots` | The import graph and the files that change most |

## Next

<div class="mv-cards">
  <a href="./brief"><b>Task brief →</b><span>Use the grounded context to write a PRD with checkable criteria.</span></a>
  <a href="../lens/devtools"><b>Lens devtools</b><span>See the import graph, hotspots and impact visually.</span></a>
</div>
