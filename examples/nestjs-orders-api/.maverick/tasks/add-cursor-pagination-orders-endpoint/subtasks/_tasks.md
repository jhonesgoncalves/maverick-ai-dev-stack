---
schema: maverick.subtasks/v1
nodes:
  - id: "01"
    file: task_01.md
  - id: "02"
    file: task_02.md
  - id: "03"
    file: task_03.md
edges:
  - from: "01"
    to: "02"
  - from: "02"
    to: "03"
---

# Subtasks — add-cursor-pagination-orders-endpoint

The frontmatter is the source of truth for dependencies and each task_NN.md for its status. Manage them with `maverick subtask`.

- [x] 01 Cursor assinado e DTO de consulta — done
- [x] 02 Paginação por cursor no OrdersService — done · after 01
- [ ] 03 Contrato HTTP e documentação da API — pending · after 02
