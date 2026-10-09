# Project intelligence

Maverick builds a local index from project metadata, `.maverick` artifacts, Markdown documentation, Git, workflow definitions, agents, adapters, and Lab files. The index is cached under `.maverick/cache/`, which is ignored by Git.

On top of it, the architecture analysis resolves static imports to real files per language, extracts entry points (HTTP routes, pages, GraphQL, gRPC, message consumers, scheduled jobs) from code, file-system routing and API contracts, infers components from the folder layout, and reads integrations, configuration and Git history. It is static and dependency-free: nothing is executed, and every result names the files behind it.

| Command | Output |
|---|---|
| `maverick graph` | Import graph, cycles, hubs and the size-normalised health score |
| `maverick coupling` | Components with Ca, Ce, instability, abstractness, distance, cycles and boundary rules |
| `maverick routes` | Entry points in any stack, with guards, duplicates and contract drift |
| `maverick hotspots` | Files ranked by churn, dependents and size |
| `maverick impact <path>` | Transitive dependents, affected entry points and tests to run |
| `maverick audit` | Ranked findings with evidence and suggested actions |
| `maverick lens` | All of the above in Lens Devtools |

See the [Devtools guide](../../site/lens/devtools.md) for supported languages and frameworks, the metric definitions and the `architecture` configuration.
