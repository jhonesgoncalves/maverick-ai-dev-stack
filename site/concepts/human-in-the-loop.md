# Human in the loop

<p class="mv-kicker">CONCEPT · WHO DECIDES, AND WITH WHAT POWER</p>

The human owns authorization, design trade-offs, execution permissions, the review decision and the merge. AI proposes; it does not assume accountability. In Maverick this is not a guideline, it is built into the tool: approval gates the agent cannot pass on its own, a trust list, a permission ceiling, hooks that can veto a run, and no command that merges.

<ConceptMap current="human-in-the-loop" />

## The decisions that stay human

| Moment | The human decides | How Maverick enforces it |
|---|---|---|
| Between planning stages | Whether the PRD, spec or task graph is right before the next stage starts | Every stage skill asks before moving on |
| Behavior spec (spec-driven) | Whether the behavior is what we want, before any design | `- [x] Spec approved` in `SPEC.md`, or `maverick flow approve spec <task> spec-approval` |
| Each subtask | Whether to continue to the next subtask | `maverick-build` asks after every subtask |
| Review | Approve, approve with follow-up, or request changes | Only a checked box in `REVIEW.md` or `flow approve` passes the `human-review` gate, unless you turn on auto-approval for the flow |
| Merge | Whether this goes in | Maverick has no merge command. `maverick-ship` commits, pushes or opens a PR only when you ask |
| Agent power | Which agents may run here, and how much they may do | `runtime.trusted`, `runtime.maxPermission`, hooks |

## Why it matters

Agents are getting better at doing the work. They are not getting better at *owning* it. When an agent changes the payment flow, someone must be able to say why it was safe, and that person must have actually decided. Two failure modes make that impossible:

<div class="mv-anatomy">
  <div class="bad"><b>Rubber stamp</b><span>The human is technically in the loop but approves whatever arrives, because there is too much of it, or because the agent already said it was fine.</span></div>
  <div class="bad"><b>Ambient power</b><span>The agent runs with full shell access "because the task looked routine", so the routine task can also delete files, push branches and call the network.</span></div>
  <div class="good"><b>Few, real decisions</b><span>Maverick asks at the joints where a decision changes the outcome, and does the bookkeeping in between, so each decision gets attention.</span></div>
  <div class="good"><b>Least privilege by default</b><span>The default ceiling is <code>edit</code>. Raising it is a reviewed change to a committed config file, not a flag.</span></div>
</div>

## Headless agents

When an agent runs headlessly (`maverick agent run`, `maverick generate`, `flow run --agent`), there is no person watching each step, so the guardrails move into configuration:

```bash
maverick agent list                    # installed providers, trust and supported permissions
maverick agent trust claude-code       # asks for confirmation, writes runtime.trusted
maverick agent run add-orders-pagination --subtask next --permission edit
maverick agent runs add-orders-pagination   # every run, recorded as JSONL under the task
```

Every run is resolved through the same checks, in this order:

<ol class="mv-steps">
  <li><h3>Is the provider trusted here?</h3><p>Only providers in <code>runtime.trusted</code> can run. Trust is per repository, asked for interactively, and written to <code>.maverick/config.json</code> so it is reviewed and committed like code.</p></li>
  <li><h3>Is the permission under the ceiling?</h3><p>Permission comes from the flag, then a matching route, then the stage default. A flag can lower it but never raise it above <code>runtime.maxPermission</code> (default <code>edit</code>).</p></li>
  <li><h3>Can this provider honor it?</h3><p>Some CLIs cannot enforce a level. Cursor applies edits only with a flag that also allows shell commands, so Maverick refuses <code>edit</code> for it rather than silently granting more.</p></li>
  <li><h3>Do the hooks allow it?</h3><p>A <code>before-agent-run</code> hook receives the run as JSON. Exit 0 allows it (and may append to the prompt), exit 2 denies it with a reason, and any other failure also denies: blocking hooks fail closed.</p></li>
</ol>

## Try it: resolve a run

Change the provider, the ceiling, the requested permission and the hook. The message is the one Maverick prints.

<PermissionResolver />

## The permission levels

| Level | The agent may | Use for |
|---|---|---|
| `read-only` | Read and plan; write nothing | Generating the PRD, TECHSPEC and tasks (`maverick generate` always runs read-only), reviews |
| `edit` | Edit files in the repository | Building a subtask, fixing checks |
| `full` | Edit and run shell commands without asking | Only in a sandbox or container you would be comfortable throwing away |

## Configuration

```json
{
  "runtime": {
    "trusted": ["claude-code", "codex"],
    "maxPermission": "edit",
    "default": { "provider": "claude-code" },
    "stages": { "review": { "provider": "codex", "permission": "read-only" } },
    "routes": [{ "match": { "type": "frontend" }, "provider": "claude-code", "effort": "high" }]
  },
  "hooks": [
    { "event": "before-agent-run", "run": "node scripts/deny-payments.mjs" },
    { "event": "after-agent-run", "run": "node scripts/notify.mjs" }
  ]
}
```

Hooks run for `before-agent-run` (blocking), `after-agent-run` and `after-flow-run` (observing: a failure is reported as a warning). A typical `before-agent-run` hook denies runs that would touch a sensitive area without a human pairing session:

```js
// scripts/deny-payments.mjs: exit 2 denies the run, stderr is the reason
const run = JSON.parse(await new Response(process.stdin).text());
if (JSON.stringify(run).includes('src/payments/')) {
  console.error('touches src/payments/; needs a human pairing session');
  process.exit(2);
}
```

For team-wide rules on the diff itself, `maverick policy init` writes `.maverick/policy.json`: a maximum number of changed files, and sensitive paths that require the strict workflow. `maverick policy check <task>` enforces it.

## Common mistakes

- **Giving an agent broad permissions** because a task appears routine. Routine tasks are where nobody is watching.
- **Trusting a provider in a repository you have not read.** Trust means "this CLI may run with my user account here".
- **Raising `maxPermission` to unblock one run.** Lower the request or change the provider instead; the ceiling is for every run after this one too.
- **Approving to keep the flow moving.** "Request changes" is a valid, useful outcome.
- **Letting the agent record the decision.** The review skill never checks the Decision box. Do not ask it to.

## Checklist

- [ ] Only providers you have reviewed are in `runtime.trusted`
- [ ] `runtime.maxPermission` is `edit` or lower, unless runs happen in a disposable sandbox
- [ ] Planning and review stages run `read-only`
- [ ] Sensitive areas have a `before-agent-run` hook or a policy rule
- [ ] Spec approval and the review decision were made by a person
- [ ] A person opens and merges the PR

## Commands

| Command | Does |
|---|---|
| `maverick agent list` | Shows providers, whether installed and trusted, and supported permissions |
| `maverick agent trust <provider>` · `untrust` | Adds or removes a provider from `runtime.trusted`, after confirmation |
| `maverick agent stage [<stage>]` | Shows or edits the provider, model and effort per workflow stage |
| `maverick agent run <task> --subtask next` | Runs a trusted agent on the next ready subtask, within the ceiling |
| `maverick agent runs <task>` | Lists recorded runs with provider, status and duration |
| `maverick flow approve <flow> <task> <gate>` | Records a human approval for an approval gate |
| `maverick flow auto-approve <flow> on\|off` | Lets a flow approve its own pending gates once every blocking check passes (opt-in, marked as auto-approved) |
| `maverick policy init` · `check <task>` | Creates and enforces team rules on the diff |

## Next

<div class="mv-cards">
  <a href="../integrations/claude-code"><b>Choose an adapter →</b><span>Install the flow skills in Claude Code, Codex, Cursor or any agent.</span></a>
  <a href="../security"><b>Security model</b><span>What Maverick reads, writes and runs, and what it never does.</span></a>
</div>
