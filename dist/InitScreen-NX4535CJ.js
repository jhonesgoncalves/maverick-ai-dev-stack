import {
  answersFrom,
  summarize,
  toggle,
  toggleAll,
  validate
} from "./chunk-XR5H6DQ6.js";
import {
  symbols,
  tone
} from "./chunk-COP4LJYD.js";
import "./chunk-DSSJQNFU.js";

// src/ui/screens/InitScreen.tsx
import { useState } from "react";
import { Box, Text, render, useApp, useInput } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
function Hints({ items }) {
  return /* @__PURE__ */ jsx(Box, { columnGap: 2, flexWrap: "wrap", children: items.map(([key, label]) => /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsx(Text, { color: tone("accent"), bold: true, children: key }),
    /* @__PURE__ */ jsxs(Text, { color: tone("muted"), children: [
      " ",
      label
    ] })
  ] }, key)) });
}
var start = (step, value) => step.kind === "select" ? Math.max(0, step.options.findIndex((option) => option.value === value)) : 0;
function InitScreen({ steps, detected, onDone }) {
  const { exit } = useApp();
  const [index, setIndex] = useState(0), [error, setError] = useState(null);
  const [values, setValues] = useState(() => Object.fromEntries(steps.map((step2) => [step2.id, step2.value])));
  const [cursor, setCursor] = useState(() => start(steps[0], steps[0].value));
  const [done, setDone] = useState(null);
  const reviewing = index === steps.length, step = steps[index];
  const finish = (answers) => {
    setDone(answers ? "saved" : "cancelled");
    onDone(answers);
    setTimeout(exit, 0);
  };
  const go = (to) => {
    setError(null);
    setIndex(to);
    if (to < steps.length) setCursor(start(steps[to], values[steps[to].id]));
  };
  const set = (value) => {
    setError(null);
    setValues((current) => ({ ...current, [step.id]: value }));
  };
  const next = () => {
    const problem = validate(step, values[step.id]);
    if (problem) return setError(problem);
    go(index + 1);
  };
  useInput((char, key) => {
    if (done) return;
    if (key.ctrl && char === "c") return finish(null);
    if (key.escape) return index > 0 ? go(index - 1) : finish(null);
    if (reviewing) {
      if (key.return) finish(answersFrom(steps, values));
      return;
    }
    if (step.kind === "text") {
      const text = String(values[step.id] ?? "");
      if (key.return) return next();
      if (key.backspace || key.delete) return set(text.slice(0, -1));
      if (key.ctrl && char === "u") return set("");
      if (char && !key.ctrl && !key.meta && !key.tab) set(text + char.replace(/[\r\n]+/g, " "));
      return;
    }
    const options = step.options, count = options.length;
    if (key.upArrow || char === "k") return setCursor((value) => (value - 1 + count) % count);
    if (key.downArrow || char === "j" || key.tab) return setCursor((value) => (value + 1) % count);
    if (step.kind === "select") {
      if (key.return) {
        set(options[cursor].value);
        go(index + 1);
      }
      return;
    }
    const selected = values[step.id];
    if (char === " ") return set(toggle(step, selected, options[cursor].value));
    if (char === "a") return set(toggleAll(step, selected));
    if (key.return) next();
  });
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, children: [
    /* @__PURE__ */ jsxs(Box, { gap: 2, marginBottom: 1, children: [
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        /* @__PURE__ */ jsx(Text, { color: tone("text"), children: "MAVERICK" }),
        " ",
        /* @__PURE__ */ jsx(Text, { color: tone("brand"), children: "AI" })
      ] }),
      /* @__PURE__ */ jsx(Text, { color: tone("muted"), children: "INIT" }),
      detected ? /* @__PURE__ */ jsxs(Text, { color: tone("subtle"), children: [
        "detected ",
        detected
      ] }) : null
    ] }),
    steps.slice(0, index).map((item) => /* @__PURE__ */ jsxs(Text, { wrap: "truncate-end", children: [
      /* @__PURE__ */ jsxs(Text, { color: tone("success"), children: [
        symbols.check,
        " "
      ] }),
      /* @__PURE__ */ jsxs(Text, { color: tone("muted"), children: [
        item.title,
        "  "
      ] }),
      /* @__PURE__ */ jsx(Text, { color: tone("text"), children: summarize(item, values[item.id]) })
    ] }, item.id)),
    done ? /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: tone(done === "saved" ? "success" : "warning"), children: done === "saved" ? `${symbols.check} Setting up the project\u2026` : `${symbols.cross} Cancelled. Nothing was written.` }) }) : reviewing ? /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsxs(Text, { color: tone("brand"), children: [
          symbols.diamond,
          " "
        ] }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Write the configuration and install the flow skills?" })
      ] }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, paddingX: 2, children: /* @__PURE__ */ jsx(Hints, { items: [["enter", "confirm"], ["esc", "back"]] }) })
    ] }) : /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: index ? 1 : 0, children: [
      /* @__PURE__ */ jsxs(Text, { children: [
        /* @__PURE__ */ jsxs(Text, { color: tone("brand"), children: [
          symbols.diamond,
          " "
        ] }),
        /* @__PURE__ */ jsx(Text, { bold: true, children: step.title }),
        /* @__PURE__ */ jsxs(Text, { color: tone("subtle"), children: [
          "  ",
          index + 1,
          "/",
          steps.length
        ] })
      ] }),
      step.hint ? /* @__PURE__ */ jsx(Box, { paddingX: 2, children: /* @__PURE__ */ jsx(Text, { color: tone("muted"), children: step.hint }) }) : null,
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", paddingX: 2, marginTop: step.kind === "text" ? 0 : 1, children: step.kind === "text" ? /* @__PURE__ */ jsx(TextField, { value: String(values[step.id] ?? ""), placeholder: step.placeholder }) : step.options.map((option, at) => /* @__PURE__ */ jsx(
        OptionRow,
        {
          option,
          active: at === cursor,
          multi: step.kind === "multi",
          width: Math.max(...step.options.map((item) => item.label.length)) + 3,
          checked: step.kind === "multi" ? values[step.id].includes(option.value) : values[step.id] === option.value
        },
        option.value
      )) }),
      error ? /* @__PURE__ */ jsx(Box, { paddingX: 2, children: /* @__PURE__ */ jsx(Text, { color: tone("warning"), children: error }) }) : null,
      /* @__PURE__ */ jsx(Box, { marginTop: 1, paddingX: 2, children: /* @__PURE__ */ jsx(Hints, { items: step.kind === "text" ? [["enter", "next"], ["ctrl+u", "clear"], ["esc", index ? "back" : "cancel"]] : step.kind === "multi" ? [["\u2191\u2193", "move"], ["space", "toggle"], ["a", "all"], ["enter", "confirm"], ["esc", index ? "back" : "cancel"]] : [["\u2191\u2193", "move"], ["enter", "select"], ["esc", index ? "back" : "cancel"]] }) })
    ] })
  ] });
}
function TextField({ value, placeholder }) {
  return /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: tone("brand"), paddingX: 1, children: [
    /* @__PURE__ */ jsxs(Text, { color: tone("brand"), children: [
      symbols.pointer,
      " "
    ] }),
    value ? /* @__PURE__ */ jsx(Text, { children: value }) : null,
    /* @__PURE__ */ jsx(Text, { inverse: true, children: " " }),
    !value && placeholder ? /* @__PURE__ */ jsxs(Text, { color: tone("subtle"), children: [
      " ",
      placeholder
    ] }) : null
  ] });
}
function OptionRow({ option, active, multi, checked, width }) {
  const mark = multi ? checked ? "\u25FC" : "\u25FB" : checked ? symbols.dot : symbols.ring;
  return /* @__PURE__ */ jsxs(Box, { backgroundColor: active ? tone("selection") : void 0, children: [
    /* @__PURE__ */ jsx(Box, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx(Text, { color: tone("brand"), children: active ? symbols.pointer : " " }) }),
    /* @__PURE__ */ jsx(Box, { width: 2, flexShrink: 0, children: /* @__PURE__ */ jsx(Text, { color: tone(checked ? "brand" : "subtle"), children: mark }) }),
    /* @__PURE__ */ jsx(Box, { width, flexShrink: 0, children: /* @__PURE__ */ jsx(Text, { bold: active, color: tone(checked || active ? "text" : "muted"), wrap: "truncate-end", children: option.label }) }),
    option.hint ? /* @__PURE__ */ jsx(Text, { color: tone("subtle"), wrap: "truncate-end", children: option.hint }) : null,
    option.tag ? /* @__PURE__ */ jsxs(Text, { color: tone("success"), children: [
      "  ",
      option.tag
    ] }) : null
  ] });
}
async function runInitWizard(props) {
  let result = null;
  const app = render(/* @__PURE__ */ jsx(InitScreen, { ...props, onDone: (answers) => {
    result = answers;
  } }), { exitOnCtrlC: false });
  await app.waitUntilExit();
  return result;
}
export {
  InitScreen,
  runInitWizard
};
