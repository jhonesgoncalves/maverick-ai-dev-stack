#!/usr/bin/env node
import {
  main
} from "./chunk-DUDIC5TR.js";
import "./chunk-F6R5K573.js";
import "./chunk-RKGCT5G5.js";
import {
  colorEnabled,
  style
} from "./chunk-YKOOPOXS.js";
import "./chunk-DSSJQNFU.js";

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
    import("./HomeScreen-43CIH24F.js"),
    import("./snapshot-MCXBCN3Y.js")
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
