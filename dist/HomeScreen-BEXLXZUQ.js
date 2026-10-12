import {
  logoGradient,
  symbols,
  theme,
  tone
} from "./chunk-COP4LJYD.js";
import {
  GROUPS,
  commands,
  findCommand
} from "./chunk-KCWDTZSZ.js";
import {
  splitCommand,
  stagesForPreset
} from "./chunk-TWL7K2MM.js";
import "./chunk-DSSJQNFU.js";

// src/ui/screens/HomeScreen.tsx
import { useEffect, useMemo, useState } from "react";
import { Box as Box4, Text as Text4, useApp, useInput, useStdout } from "ink";

// src/ui/components/Brand.tsx
import { Box, Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
var MAVERICK = [
  "\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557",
  "\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551 \u2588\u2588\u2554\u255D",
  "\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2554\u255D ",
  "\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2588\u2588\u2557 ",
  "\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2557",
  "\u255A\u2550\u255D     \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D"
];
var AI = [
  " \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557",
  "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551",
  "\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551",
  "\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551",
  "\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D"
];
var LOGO_WIDTH = MAVERICK[0].length + 1 + AI[0].length;
function Brand({ compact = false, version }) {
  const tagline = /* @__PURE__ */ jsx(Text, { color: tone("muted"), italic: true, children: "Understand. Build. Debug. Ship." });
  const meta = /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsx(Text, { color: tone("muted"), children: "DEVELOPER WORKSPACE" }),
    version ? /* @__PURE__ */ jsxs(Text, { color: tone("subtle"), children: [
      "  v",
      version
    ] }) : null
  ] });
  if (compact) return /* @__PURE__ */ jsxs(Box, { gap: 2, children: [
    /* @__PURE__ */ jsxs(Text, { bold: true, children: [
      /* @__PURE__ */ jsx(Text, { color: tone("text"), children: "MAVERICK" }),
      " ",
      /* @__PURE__ */ jsx(Text, { color: tone("brand"), children: "AI" })
    ] }),
    meta,
    tagline
  ] });
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    MAVERICK.map((line, index) => /* @__PURE__ */ jsxs(Text, { children: [
      /* @__PURE__ */ jsx(Text, { color: tone("text"), children: line }),
      " ",
      /* @__PURE__ */ jsx(Text, { color: theme.plain ? void 0 : logoGradient[index], children: AI[index] })
    ] }, index)),
    /* @__PURE__ */ jsxs(Box, { gap: 2, marginTop: 1, children: [
      /* @__PURE__ */ jsx(Text, { color: tone("brand"), children: symbols.diamond }),
      meta,
      /* @__PURE__ */ jsx(Text, { color: tone("subtle"), children: "\xB7" }),
      tagline
    ] })
  ] });
}

// src/ui/components/ProjectCard.tsx
import { Box as Box3, Text as Text3 } from "ink";

// src/ui/components/WorkflowStepper.tsx
import { Box as Box2, Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function WorkflowStepper({ preset = "standard", activeStage, compact = false }) {
  const stages = stagesForPreset(preset), active = activeStage ? stages.indexOf(activeStage) : -1;
  return /* @__PURE__ */ jsx2(Box2, { flexWrap: "wrap", children: stages.map((stage, index) => {
    const done = index < active, current = index === active;
    const mark = done ? symbols.check : current ? symbols.dot : symbols.ring;
    return /* @__PURE__ */ jsxs2(Text2, { children: [
      /* @__PURE__ */ jsxs2(Text2, { color: tone(done ? "success" : current ? "brand" : "subtle"), children: [
        mark,
        " "
      ] }),
      /* @__PURE__ */ jsx2(Text2, { bold: current, color: tone(current ? "text" : done ? "muted" : "subtle"), children: stage.toUpperCase() }),
      index < stages.length - 1 ? /* @__PURE__ */ jsx2(Text2, { color: tone("subtle"), children: compact ? "  " : " \u2500\u2500 " }) : null
    ] }, stage);
  }) });
}

// src/ui/components/ProjectCard.tsx
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function Field({ label, children }) {
  return /* @__PURE__ */ jsxs3(Text3, { children: [
    /* @__PURE__ */ jsxs3(Text3, { color: tone("muted"), children: [
      label,
      " "
    ] }),
    children
  ] });
}
function ProjectCard({ snapshot, width }) {
  const { latest } = snapshot, narrow = width < 90;
  return /* @__PURE__ */ jsxs3(Box3, { flexDirection: "column", borderStyle: "round", borderColor: tone("subtle"), paddingX: 1, width, children: [
    /* @__PURE__ */ jsxs3(Box3, { columnGap: 2, children: [
      /* @__PURE__ */ jsxs3(Text3, { bold: true, color: tone("text"), wrap: "truncate-end", children: [
        symbols.diamond,
        " ",
        snapshot.name
      ] }),
      snapshot.branch ? /* @__PURE__ */ jsxs3(Text3, { color: tone("info"), wrap: "truncate-end", children: [
        symbols.branch,
        " ",
        snapshot.branch
      ] }) : null,
      /* @__PURE__ */ jsx3(Field, { label: "preset", children: /* @__PURE__ */ jsx3(Text3, { color: tone("accent"), children: snapshot.presetName }) }),
      narrow ? null : /* @__PURE__ */ jsx3(Field, { label: "tasks", children: /* @__PURE__ */ jsx3(Text3, { color: tone("text"), children: snapshot.tasks.length }) })
    ] }),
    snapshot.configError ? /* @__PURE__ */ jsxs3(Text3, { color: tone("danger"), children: [
      symbols.cross,
      " ",
      snapshot.configError
    ] }) : !snapshot.initialized ? /* @__PURE__ */ jsxs3(Text3, { color: tone("warning"), children: [
      "Not initialized yet \u2014 run ",
      /* @__PURE__ */ jsx3(Text3, { bold: true, children: "init" }),
      " to create .maverick/config.json"
    ] }) : latest ? /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsxs3(Text3, { wrap: "truncate-end", children: [
        /* @__PURE__ */ jsxs3(Text3, { color: tone("muted"), children: [
          narrow ? `tasks ${snapshot.tasks.length} \xB7 ` : "",
          "latest "
        ] }),
        /* @__PURE__ */ jsx3(Text3, { bold: true, color: tone("text"), children: latest.slug }),
        /* @__PURE__ */ jsxs3(Text3, { color: tone("muted"), children: [
          "  ",
          symbols.arrow,
          " ",
          latest.next
        ] })
      ] }),
      /* @__PURE__ */ jsx3(WorkflowStepper, { preset: latest.preset, activeStage: latest.stage, compact: narrow })
    ] }) : /* @__PURE__ */ jsxs3(Fragment, { children: [
      /* @__PURE__ */ jsxs3(Text3, { color: tone("muted"), children: [
        "No tasks yet \u2014 pick ",
        /* @__PURE__ */ jsx3(Text3, { bold: true, color: tone("text"), children: "task" }),
        " to start one."
      ] }),
      /* @__PURE__ */ jsx3(WorkflowStepper, { preset: snapshot.preset, compact: narrow })
    ] })
  ] });
}

// src/ui/launcher.js
function prefill(command, snapshot = {}) {
  const args = [];
  for (const token of command.usage.split(" ").slice(1)) {
    if (token.startsWith("[")) break;
    if (token.includes("|") && !args.length) {
      const options = token.split("|");
      args.push(options.find((item) => ["list", "show"].includes(item)) || options[0]);
      continue;
    }
    if (token === "<task>" && snapshot.latest) {
      args.push(snapshot.latest.slug);
      continue;
    }
    if (token.startsWith("<")) break;
    if (token.startsWith("--") && !token.includes("<")) args.push(token);
  }
  return args;
}
function needsInput(command, snapshot = {}) {
  const required = command.usage.split(" ").slice(1).filter((token) => token.startsWith("<"));
  return required.some((token) => token !== "<task>" || !snapshot.latest) || command.usage.split(" ")[1]?.includes("|");
}
function entry(command, extra = {}) {
  return { key: `${extra.group || command.group}:${command.id}:${(extra.argv || []).join(" ")}`, id: command.id, group: command.group, usage: command.usage, description: command.description, aliases: command.aliases.filter((alias) => !alias.startsWith("-")), ...extra };
}
function latestSteps({ slug, stage }) {
  if (["prd", "spec", "techspec", "tasks"].includes(stage)) return [["new", [slug]], ["instructions", [slug]]];
  if (stage === "build") return [["subtask", ["next", slug]], ["verify", [slug]]];
  if (stage === "security") return [["security", [slug]], ["review", [slug, "--diff"]]];
  if (stage === "pr") return [["flow", ["run", "pr", slug]], ["done", [slug]]];
  if (stage === "done") return [["reopen", [slug]]];
  return [["verify", [slug]], ["review", [slug, "--diff"]], ["readiness", [slug]]];
}
function suggestions(snapshot = {}) {
  const pick = (id, argv, label) => ({ id, argv, label });
  const list = !snapshot.initialized ? [pick("init", [], "init"), pick("new", [], 'new "<idea>"'), pick("doctor", [], "doctor"), pick("stack", [], "stack")] : !snapshot.latest ? [pick("new", [], 'new "<idea>"'), pick("map", [], "map"), pick("stack", [], "stack"), pick("doctor", [], "doctor")] : [...latestSteps(snapshot.latest).map(([id, argv]) => pick(id, argv, `${id} ${argv.join(" ")}`)), pick("status", [], "status"), pick("new", [], 'new "<idea>"')];
  return list.map((item) => entry(findCommand(item.id), { group: "suggested", label: item.label, argv: item.argv, ready: item.id !== "new" || item.argv.length > 0 }));
}
var SUGGESTED = { id: "suggested", title: "Suggested" };
var launcherGroups = [SUGGESTED, ...GROUPS];
function score(item, query) {
  const haystack = [item.id, ...item.aliases].join(" "), q = query.toLowerCase();
  if (item.id.startsWith(q)) return 3;
  if (haystack.includes(q)) return 2;
  if (item.description.toLowerCase().includes(q)) return 1;
  let at = 0;
  for (const char of q) {
    at = item.id.indexOf(char, at) + 1;
    if (!at) return 0;
  }
  return 0.5;
}
function entriesFor(snapshot, query = "") {
  if (!query.trim()) return [...suggestions(snapshot), ...GROUPS.flatMap((group) => group.commands.map((id) => entry(findCommand(id))))];
  return commands.map((command) => ({ item: entry(command), rank: score(entry(command), query.trim()) })).filter((result) => result.rank > 0).sort((a, b) => b.rank - a.rank || a.item.id.localeCompare(b.item.id)).map((result) => result.item);
}

// src/ui/screens/HomeScreen.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function Hints({ items }) {
  return /* @__PURE__ */ jsx4(Box4, { columnGap: 2, flexWrap: "wrap", children: items.map(([key, label]) => /* @__PURE__ */ jsxs4(Text4, { children: [
    /* @__PURE__ */ jsx4(Text4, { color: tone("accent"), bold: true, children: key }),
    /* @__PURE__ */ jsxs4(Text4, { color: tone("muted"), children: [
      " ",
      label
    ] })
  ] }, key)) });
}
function Cursor() {
  return /* @__PURE__ */ jsx4(Text4, { inverse: true, children: " " });
}
function HomeScreen({ snapshot, onRun }) {
  const { exit } = useApp(), { stdout } = useStdout();
  const columns = stdout.columns || 80, rows = stdout.rows || 30;
  const compact = columns < LOGO_WIDTH + 4 || rows < 34, width = Math.min(columns - 2, 96);
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(null), [input, setInput] = useState(""), [completion, setCompletion] = useState(0);
  const [launch, setLaunch] = useState(null);
  const entries = useMemo(() => entriesFor(snapshot, query), [snapshot, query]);
  const current = entries[Math.min(selected, entries.length - 1)];
  useEffect(() => {
    setSelected(0);
  }, [query]);
  useEffect(() => {
    if (launch) {
      onRun(launch);
      exit();
    }
  }, [launch]);
  const listRows = useMemo(() => {
    if (query.trim()) return entries.map((entry2, index) => ({ entry: entry2, index }));
    return launcherGroups.flatMap((group) => {
      const members = entries.map((entry2, index) => ({ entry: entry2, index })).filter((row) => row.entry.group === group.id);
      return members.length ? [{ header: group.title }, ...members] : [];
    });
  }, [entries, query]);
  const run = (entry2, extra) => setLaunch([entry2.id, ...extra ?? entry2.argv ?? prefill(findCommand(entry2.id), snapshot)]);
  const edit = (entry2) => {
    setEditing(entry2);
    setCompletion(0);
    setInput((entry2.argv ?? prefill(findCommand(entry2.id), snapshot)).join(" "));
  };
  const jumpGroup = (step) => {
    const starts = listRows.flatMap((row, at) => "header" in row && "entry" in (listRows[at + 1] || {}) ? [listRows[at + 1].index] : []);
    if (!starts.length) return;
    const now = starts.filter((start2) => start2 <= selected).length - 1;
    setSelected(starts[(now + step + starts.length) % starts.length]);
  };
  useInput((char, key) => {
    if (launch) return;
    if (editing) {
      if (key.escape) return setEditing(null);
      if (key.return) {
        try {
          return run(editing, splitCommand(input));
        } catch {
          return;
        }
      }
      if (key.backspace || key.delete) {
        setCompletion(0);
        return setInput((value) => value.slice(0, -1));
      }
      if (key.tab && snapshot.tasks.length) {
        const parts = input.split(" "), last = parts.pop() || "";
        const base = completion ? parts.concat("") : parts.concat(last);
        const pool = snapshot.tasks.map((task) => task.slug).filter((slug) => !completion ? slug.startsWith(last) : true);
        if (!pool.length) return;
        setInput([...base.slice(0, -1), pool[completion % pool.length]].join(" "));
        return setCompletion((value) => value + 1);
      }
      if (char && !key.ctrl && !key.meta) {
        setCompletion(0);
        setInput((value) => value + char);
      }
      return;
    }
    if (key.escape) return query ? setQuery("") : exit();
    if (key.upArrow) return setSelected((value) => (value - 1 + entries.length) % Math.max(1, entries.length));
    if (key.downArrow) return setSelected((value) => (value + 1) % Math.max(1, entries.length));
    if (key.pageUp) return setSelected((value) => Math.max(0, value - 8));
    if (key.pageDown) return setSelected((value) => Math.min(entries.length - 1, value + 8));
    if (key.tab) return jumpGroup(key.shift ? -1 : 1);
    if (!current) {
      if (key.backspace || key.delete) setQuery((value) => value.slice(0, -1));
      else if (char && !key.ctrl && !key.meta) setQuery((value) => value + char);
      return;
    }
    if (key.return) return current.ready || !current.argv && !needsInput(findCommand(current.id), snapshot) ? run(current) : edit(current);
    if (key.rightArrow) return edit(current);
    if (key.backspace || key.delete) return setQuery((value) => value.slice(0, -1));
    if (char === "q" && !query) return exit();
    if (char && !key.ctrl && !key.meta && (char !== " " || query)) setQuery((value) => value + char);
  });
  if (launch) return /* @__PURE__ */ jsxs4(Text4, { children: [
    /* @__PURE__ */ jsx4(Text4, { color: tone("brand"), children: symbols.pointer }),
    /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: " maverick " }),
    /* @__PURE__ */ jsx4(Text4, { bold: true, children: launch.join(" ") })
  ] });
  const details = rows >= 40, card = snapshot.initialized && !snapshot.configError ? 5 : 4;
  const fixed = (compact ? 1 : 8) + 1 + card + 2 + 1 + (details ? 5 : 0) + 2 + 2;
  const capacity = Math.max(6, rows - fixed);
  const focus = Math.max(0, listRows.findIndex((row) => "entry" in row && row.index === selected));
  const start = Math.min(Math.max(0, focus - Math.floor(capacity / 2)), Math.max(0, listRows.length - capacity));
  const visible = listRows.slice(start, start + capacity);
  const countEntries = (list) => list.filter((row) => "entry" in row).length;
  const entriesAbove = countEntries(listRows.slice(0, start)), entriesBelow = countEntries(listRows.slice(start + capacity));
  return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsx4(Brand, { compact, version: snapshot.version }),
    /* @__PURE__ */ jsx4(Box4, { marginTop: 1, children: /* @__PURE__ */ jsx4(ProjectCard, { snapshot, width }) }),
    editing ? /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginTop: 1, width, children: [
      /* @__PURE__ */ jsxs4(Box4, { borderStyle: "round", borderColor: tone("brand"), paddingX: 1, children: [
        /* @__PURE__ */ jsxs4(Text4, { color: tone("brand"), children: [
          symbols.pointer,
          " "
        ] }),
        /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: "maverick " }),
        /* @__PURE__ */ jsxs4(Text4, { bold: true, children: [
          editing.id,
          " "
        ] }),
        /* @__PURE__ */ jsx4(Text4, { children: input }),
        /* @__PURE__ */ jsx4(Cursor, {})
      ] }),
      /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", paddingX: 2, children: [
        /* @__PURE__ */ jsxs4(Text4, { children: [
          /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: "usage  " }),
          /* @__PURE__ */ jsxs4(Text4, { color: tone("text"), children: [
            "maverick ",
            editing.usage
          ] })
        ] }),
        /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: editing.description }),
        snapshot.tasks.length ? /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: "tasks  " }),
          /* @__PURE__ */ jsx4(Text4, { color: tone("info"), children: snapshot.tasks.slice(0, 6).map((task) => task.slug).join("  ") })
        ] }) : null
      ] }),
      /* @__PURE__ */ jsx4(Box4, { marginTop: 1, paddingX: 1, children: /* @__PURE__ */ jsx4(Hints, { items: [["enter", "run"], ["tab", "complete task"], ["esc", "back"]] }) })
    ] }) : /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginTop: 1, width, children: [
      /* @__PURE__ */ jsxs4(Box4, { paddingX: 1, children: [
        /* @__PURE__ */ jsxs4(Text4, { color: tone(query ? "brand" : "muted"), children: [
          symbols.search,
          " "
        ] }),
        query ? /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx4(Text4, { bold: true, children: query }),
          /* @__PURE__ */ jsx4(Cursor, {}),
          /* @__PURE__ */ jsxs4(Text4, { color: tone("muted"), children: [
            "  ",
            entries.length,
            " match",
            entries.length === 1 ? "" : "es"
          ] })
        ] }) : /* @__PURE__ */ jsxs4(Fragment2, { children: [
          /* @__PURE__ */ jsx4(Cursor, {}),
          /* @__PURE__ */ jsxs4(Text4, { color: tone("subtle"), children: [
            " type to search ",
            commands.length,
            " commands"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", marginTop: 1, children: [
        start > 0 ? /* @__PURE__ */ jsxs4(Text4, { color: tone("subtle"), children: [
          "   \u2191 ",
          entriesAbove,
          " more"
        ] }) : null,
        visible.map((row, at) => "header" in row ? /* @__PURE__ */ jsx4(Box4, { marginTop: at === 0 ? 0 : 1, paddingX: 1, children: /* @__PURE__ */ jsx4(Text4, { bold: true, color: tone("accent"), children: row.header.toUpperCase() }) }, `h-${row.header}`) : /* @__PURE__ */ jsx4(Row, { entry: row.entry, active: row.index === selected, width }, row.entry.key)),
        start + capacity < listRows.length ? /* @__PURE__ */ jsxs4(Text4, { color: tone("subtle"), children: [
          "   \u2193 ",
          entriesBelow,
          " more"
        ] }) : null,
        !entries.length ? /* @__PURE__ */ jsxs4(Box4, { paddingX: 1, children: [
          /* @__PURE__ */ jsxs4(Text4, { color: tone("warning"), children: [
            "No command matches \u201C",
            query,
            "\u201D. "
          ] }),
          /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: "esc to clear" })
        ] }) : null
      ] }),
      current && details ? /* @__PURE__ */ jsxs4(Box4, { marginTop: 1, borderStyle: "round", borderColor: tone("subtle"), paddingX: 1, flexDirection: "column", children: [
        /* @__PURE__ */ jsxs4(Text4, { wrap: "truncate-end", children: [
          /* @__PURE__ */ jsx4(Text4, { color: tone("brand"), children: "$ " }),
          /* @__PURE__ */ jsx4(Text4, { color: tone("muted"), children: "maverick " }),
          /* @__PURE__ */ jsx4(Text4, { bold: true, children: current.argv ? [current.id, ...current.argv].join(" ") : current.usage })
        ] }),
        /* @__PURE__ */ jsxs4(Text4, { color: tone("muted"), wrap: "truncate-end", children: [
          current.description,
          current.aliases.length ? `  \xB7  alias: ${current.aliases.join(", ")}` : ""
        ] })
      ] }) : null,
      /* @__PURE__ */ jsx4(Box4, { marginTop: 1, paddingX: 1, children: /* @__PURE__ */ jsx4(Hints, { items: [["\u2191\u2193", "move"], ["tab", "next group"], ["enter", "run"], ["\u2192", "edit args"], ["esc", query ? "clear" : "quit"]] }) })
    ] })
  ] });
}
function Row({ entry: entry2, active, width }) {
  const name = entry2.label || entry2.id, column = 22;
  return /* @__PURE__ */ jsxs4(Box4, { paddingX: 1, width, backgroundColor: active ? tone("selection") : void 0, children: [
    /* @__PURE__ */ jsx4(Box4, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx4(Text4, { color: tone("brand"), children: active ? symbols.pointer : " " }) }),
    /* @__PURE__ */ jsx4(Box4, { width: column, flexShrink: 0, children: /* @__PURE__ */ jsx4(Text4, { bold: active, color: tone("text"), wrap: "truncate-end", children: name }) }),
    /* @__PURE__ */ jsx4(Text4, { color: tone(active ? "text" : "muted"), wrap: "truncate-end", children: entry2.description })
  ] });
}
export {
  HomeScreen
};
