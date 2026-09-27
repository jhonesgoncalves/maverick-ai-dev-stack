---
name: preflight
description: Reads a task's TASK.md and CONTEXT.md without editing and reports understanding, gaps, files to inspect and risks. Use before implementing a Maverick task.
version: 1.0.0
argument-hint: <task-slug>
tags: [maverick, planning]
---

Preflight the Maverick task `{{ARGUMENTS}}`. Read `.maverick/tasks/{{ARGUMENTS}}/TASK.md` and `CONTEXT.md` only. Do not edit anything yet.

Return:
1. your understanding in at most 5 bullets;
2. missing information that would change the implementation;
3. the exact files you need to inspect next and why;
4. risks and assumptions;
5. whether the task is small enough to execute safely.

If the task conflicts with Out of Scope or Do Not Touch, stop and say so.
