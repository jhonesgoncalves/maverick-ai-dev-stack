#!/usr/bin/env node
import {
  main
} from "./chunk-PHMLKXYN.js";
import "./chunk-YM2BQGIU.js";

// src/cli/app.tsx
var args = process.argv.slice(2);
if (args.length === 0 && process.stdin.isTTY && !process.env.CI && !args.includes("--json")) {
  const [{ default: React }, { render }, { HomeScreen }] = await Promise.all([
    import("react"),
    import("ink"),
    import("./HomeScreen-2IC6BDJX.js")
  ]);
  render(React.createElement(HomeScreen));
} else main(args).catch((error) => {
  console.error(`maverick: ${error.message}`);
  process.exitCode = 1;
});
