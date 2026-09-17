import {
  stagesForPreset
} from "./chunk-YM2BQGIU.js";

// src/ui/screens/HomeScreen.tsx
import { useState } from "react";
import { Box as Box2, Text as Text3, useApp, useInput } from "ink";

// src/ui/components/Brand.tsx
import { Text } from "ink";

// src/ui/theme.ts
var theme = { brand: "#FF6A00" };

// src/ui/components/Brand.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Brand() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Text, { color: process.env.NO_COLOR ? void 0 : theme.brand, children: "\u2694 MAVERICK" }),
    /* @__PURE__ */ jsx(Text, { dimColor: true, children: "\\nAI DEV STACK" })
  ] });
}

// src/ui/components/WorkflowStepper.tsx
import { Box, Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function WorkflowStepper({ preset = "standard", activeStage }) {
  const stages = stagesForPreset(preset);
  return /* @__PURE__ */ jsx2(Box, { flexDirection: "column", children: stages.map((stage, index) => /* @__PURE__ */ jsxs2(Text2, { children: [
    String(index + 1).padStart(2, "0"),
    " ",
    stage === activeStage ? "\u25CF" : "\u25CB",
    " ",
    stage.toUpperCase()
  ] }, stage)) });
}

// src/ui/screens/HomeScreen.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var choices = ["Create a task", "Continue a task", "Review a change", "Validate artifacts", "Project doctor", "Help"];
function HomeScreen() {
  const [selected, setSelected] = useState(0);
  const { exit } = useApp();
  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (key.upArrow) setSelected((v) => Math.max(0, v - 1));
    if (key.downArrow) setSelected((v) => Math.min(choices.length - 1, v + 1));
  });
  return /* @__PURE__ */ jsxs3(Box2, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx3(Brand, {}),
    /* @__PURE__ */ jsx3(Text3, { children: "\\n\\nContext before code.\\n" }),
    /* @__PURE__ */ jsx3(WorkflowStepper, {}),
    /* @__PURE__ */ jsx3(Text3, { children: "\\nWhat do you want to do?\\n" }),
    choices.map((choice, index) => /* @__PURE__ */ jsxs3(Text3, { children: [
      index === selected ? "\u203A " : "  ",
      choice
    ] }, choice)),
    /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: "\\n\u2191\u2193 navigate   enter select   q quit" })
  ] });
}
export {
  HomeScreen
};
