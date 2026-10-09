# Task format

Each `subtasks/task_NN.md` keeps the frontmatter written by `maverick subtask add` (`title`, `status`, `type`, `complexity`). Dependencies live only in `subtasks/_tasks.md`; manage them with `--after`. `_tasks.md` lists every task as a checklist item that Maverick checks when the task is done.

**Acceptance Criteria, Steps and Verification are checklists.** Every criterion, step and test is one `- [ ]` item. The build checks each item (`- [x]`) as soon as it is done, and `maverick subtask set <slug> <id> done` refuses while any item is still open. Write items that can be checked one at a time: one concrete change per step, one test per verification item. Files stays a plain list: it names what changes, not work to do.

The body looks like this:

~~~markdown
# Keyset pagination in OrdersService

## Goal
`OrdersService.findAll` returns one page of orders and a `nextCursor`. The call without a query keeps its array shape.

## Acceptance Criteria
- [ ] AC-01: Given 3 orders, when `limit=2` is requested, then 2 orders and a `nextCursor` are returned
- [ ] AC-02: the last page has no `nextCursor`
- [ ] AC-04: without parameters, the response is unchanged

## Files
- `src/orders/orders.service.ts:42-61` — keyset query ordered by (`createdAt`, `id`)
- `src/orders/cursor.ts` — decode the cursor (created in task 01)
- `test/orders.service.spec.ts` — UT-01, UT-02

## Steps
- [ ] Add an overload `findAll(accountId, query)` next to the current signature.
- [ ] Build the keyset `where` clause from the decoded cursor.
- [ ] Fetch `limit + 1` rows to know whether there is a next page.

## Verification
```bash
npm test -- orders.service
```
- [ ] UT-01: 3 orders and `limit=2` return 2 items and a `nextCursor`
- [ ] UT-02: the last page returns no `nextCursor`
~~~

## Rules

- **checked:** the graph in `_tasks.md` is valid and acyclic, and every node has its file.
- **checked:** every task references the `AC-NN` it satisfies, and only ids that PRD.md defines.
- **checked (strict):** every criterion is covered by at least one task.
- **checked (strict):** every task has a `## Verification` section.
- **checked (strict):** every file in `## Files` exists, unless its line says `(new)` or an earlier task creates it.
- **checked:** no TODO, TBD or FILL ME remains.
- **checked (strict):** Steps and Verification are `- [ ]` checklists.
- **checked:** a task marked `done` has no unchecked item; `subtask set … done` refuses it too.
- Order the items as they will be done: steps top to bottom, with a step's test right after it when it is written test-first.
- Keep 3 to 7 tasks for a typical feature. Split only at a dependency, parallelisation or domain boundary.
