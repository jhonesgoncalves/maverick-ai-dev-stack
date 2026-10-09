---
schema: maverick.subtasks/v1
nodes:
  - id: "01"
    file: task_01.md
  - id: "02"
    file: task_02.md
edges:
  - from: "01"
    to: "02"
---

# Subtasks — add-cursor-pagination

The frontmatter is the source of truth for dependencies and each task_NN.md for its status. Manage them with `maverick subtask`.

- [ ] 01 Keyset pagination in OrdersService — pending
- [ ] 02 Reject invalid cursors and document the contract — pending · after 01
