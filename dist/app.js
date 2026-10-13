#!/usr/bin/env node
import {
  main
} from "./chunk-KLRW2J5D.js";
import "./chunk-CAKACX3K.js";
import "./chunk-SXR3DEER.js";
import "./chunk-VZF7QBRD.js";
import "./chunk-YS6LRZVS.js";
import "./chunk-MXEATQKY.js";
import "./chunk-PXT62BYS.js";
import {
  colorEnabled,
  style
} from "./chunk-RXZYNRDJ.js";
import "./chunk-5ZWVM3IA.js";
import "./chunk-YL4AI5AN.js";

// src/cli/app.tsx
var args = process.argv.slice(2);
function fail(error) {
  const color = colorEnabled(process.stderr);
  console.error(color ? `${style.red("\u2716", process.stderr)} ${style.bold("maverick:", process.stderr)} ${error.message}` : `maverick: ${error.message}`);
  if (color && /unknown command/.test(error.message)) console.error(style.gray("  Run maverick help to see every command, or maverick with no arguments for the launcher.", process.stderr));
  process.exitCode = 1;
}
async function launcher() {
  const [{ default: React }, { render }, { HomeScreen }, { projectSnapshot }] = await Promise.all([
    import("react"),
    import("ink"),
    import("./HomeScreen-Z6LMM5IP.js"),
    import("./snapshot-CYTFCQZO.js")
  ]);
  let chosen;
  const app = render(React.createElement(HomeScreen, { snapshot: await projectSnapshot(), onRun: (argv) => {
    chosen = argv;
  } }));
  await app.waitUntilExit();
  if (chosen) await main(chosen);
}
if (args.length === 0 && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI) launcher().catch(fail);
else main(args).catch(fail);
