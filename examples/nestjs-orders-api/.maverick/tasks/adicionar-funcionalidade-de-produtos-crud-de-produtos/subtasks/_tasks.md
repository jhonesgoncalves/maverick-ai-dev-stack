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

# Subtasks — adicionar-funcionalidade-de-produtos-crud-de-produtos

The frontmatter is the source of truth for dependencies and each task_NN.md for its status. Manage them with `maverick subtask`.

- [x] 01 Domínio de produtos: repository, DTOs, config e service — done
- [x] 02 Rotas HTTP e módulo de produtos — done · after 01
- [x] 03 Pedidos inalterados e documentação da API — done · after 02
