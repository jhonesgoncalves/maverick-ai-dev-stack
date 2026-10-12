#!/usr/bin/env node
import {
  main
} from "./chunk-W7T7ENJL.js";
import "./chunk-KS7FBQ56.js";
import "./chunk-PUP4WTVD.js";
import "./chunk-FDZLEB4U.js";
import "./chunk-P3Q7POVR.js";
import "./chunk-2B5ZDJBT.js";
import {
  colorEnabled,
  style
} from "./chunk-EVJRL34C.js";
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
    import("./HomeScreen-RHVKGHHR.js"),
    import("./snapshot-O7Z3VUSJ.js")
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
