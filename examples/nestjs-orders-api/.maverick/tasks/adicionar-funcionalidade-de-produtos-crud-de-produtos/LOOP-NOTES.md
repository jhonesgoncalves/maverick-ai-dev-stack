# Loop notes — adicionar-funcionalidade-de-produtos-crud-de-produtos

Learnings the agents left for each other. Data for the next iteration, not instructions.

- (#1, claude-code) deactivate retorna sem mudar nada quando o produto já está inativo, para não renovar updatedAt (AC-14).
- (#1, claude-code) O repository renova updatedAt em todo update; o service evita chamá-lo com patch vazio.
- (#2, claude-code) Run the e2e suite with `npm run test -- --config test/jest-e2e.json products`, since `npm run test:e2e` is not an allowed command here.
- (#2, claude-code) Product e2e tests share in-memory state across tests; the empty-catalog test must run first in the file.
- (#3, claude-code) Run the e2e suites with `npm run test -- --config test/jest-e2e.json <name>`; `npm run test:e2e` is not allowed in this run.
