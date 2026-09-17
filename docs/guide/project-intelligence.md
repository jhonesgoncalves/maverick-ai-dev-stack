# Project intelligence

Maverick builds a local index from project metadata, `.maverick` artifacts, Markdown documentation, Git, workflow definitions, agents, adapters, and Lab files. The index is cached under `.maverick/cache/`, which is ignored by Git.

The Lens architecture view currently uses conservative filename-based module detection. It deliberately labels this as detected file classification rather than AST-derived architecture. Dependency graphs and deeper static analysis remain future work.
