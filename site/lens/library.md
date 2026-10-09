# Library and changes

The **Library** section is a reader for the documents in your repository; **Changes** shows what Git sees right now. Both are read-only.

## Specs

`#/specs` lists every `PRD.md`, `SPEC.md` and `TECHSPEC.md` found in the repository, titled by their task folder and tagged by type. A spec that still contains placeholder markers is tagged *draft*; the rest are *documented*.

## Docs

`#/docs` lists the project's Markdown and text documentation — `.md`, `.mdx` and `.txt` files outside the task folders. Files whose path looks like an architecture decision record (`ADR-001…`, `adr_12…` or a path mentioning *architecture decision*) are tagged **ADR**; everything else is **DOC**.

## Lab

`#/lab` appears in the sidebar only when the repository has a `lab/` folder. It lists the Lab's experiment and measurement files; see [Maverick Lab](/lab/introduction).

## Reading documents

All three views share the same layout: a searchable list on the left and a reader on the right.

- **Search** matches the title, the path and the full text of each document. Each Library view keeps its own query.
- **Select** a document to read it; its address is `#/<view>?path=<file>`, so links to a document can be shared.
- **Copy path** copies the repository-relative path for your editor or agent.

The reader renders headings, lists, task lists, tables, quotes, code blocks and links. Text is escaped before it is formatted, so HTML inside a document is shown as text, never run. Front matter is hidden.

Lens indexes up to eight folder levels deep and skips dependency, build and cache folders. See [Troubleshooting](./troubleshooting.md#what-lens-ignores).

## Changes

`#/changes` shows the current branch:

- **Working tree** — every file `git status --short` reports, with its status code. When some of them are source files the analysis knows, **Impact of all** opens [Devtools Impact](./devtools.md#impact) with all of them selected — the quickest way to see what your uncommitted work could break and which tests to run.
- **Recent commits** — the last five commits on the branch.

When there is nothing to commit, the view says so. Outside a Git repository, the branch reads *not a Git repository* and both lists are empty.
