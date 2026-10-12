# Loops

`#/loops` follows every [loop](/concepts/loop-engineering) of the project: the ones Lens shows you and the ones started with `maverick loop run` in a terminal, in CI or by your agent. Lens never runs a loop itself; it reads the loop's state as it changes and updates the page live.

## The list

Each row is one loop: its task and id, the iteration it is on against the iteration budget, how many iterations were kept, the checkpoint's gates and failing checks, the subtasks done, the cost so far and its status. A spinner marks a loop that is running. Filter by **Running**, **Needs you** (stalled, disputed, waiting on a decision, or stopped on an integrity violation) and **Finished**. The sidebar badge counts the loops that need you, or else the ones running.

A loop that needs you also appears first in the [Inbox](/lens/inbox-and-tasks), with an **Open loop** action.

## A loop's page

Address: `#/loops/<task>/<loop id>`.

- **Header.** The mode (in place or worktree), the oracle flow, the outcome and its reason, and **Stop** while the loop runs.
- **Key figures.** Iterations against the budget (kept and rolled back), the checkpoint's gates and failing checks, the cost and time spent, and subtasks done.
- **Ratchet.** Failing checks per iteration, lower is better. The orange step line is the checkpoint each iteration had to beat; a green dot was kept, a red cross was rolled back, a hollow circle was aborted, and a diamond above marks an escalation. Hover a mark for the iteration, the agent and the first reason.
- **Iterations.** One row per iteration, newest first: the subtask, the agent and its reasoning effort, the escalation step, the decision, the measured score, integrity findings, the judge's verdict, cost and time, and a link to the agent's transcript. Open a row for the reasons, every finding with the line that triggered it, the gates, the judge's issues, any dispute, and what the agent said, marked as advisory.
- **Budget.** Iterations, time and cost against their limits. The tick on each bar is the forecast after the next iteration; it turns red when the next iteration would cross the limit, which is when the loop stops before starting it.
- **Escalation.** The diagnosis, the agents tried and the ladder, while the loop is escalated or waits for you.
- **Next commands.** The commands that fit the outcome, to copy: resume with a note, raise a budget, verify the record.
- **Ledger.** Lens checks the hash chain and every checkpoint ref when the page opens; **Verify again** repeats it.
- **Guardrails.** The integrity level, the blast radius, the protected paths, whether a judge decides subtasks, the loop's branch for a worktree loop, and the digest of the oracle set.

## Stopping a loop

**Stop** writes the same request as `maverick loop stop <task>`. The running loop, in whatever process it runs, polls for it: the agent run is aborted, its changes are rolled back to the last checkpoint, and the loop ends as `aborted`. Run `maverick loop run <task>` to continue from there.

## API

The page uses `GET /api/loops`, `GET /api/loop`, `GET /api/loop/ledger` and `POST /api/loops/stop`, plus the `loop` and `loop-end` events; see the [HTTP API](/lens/api#loops).
