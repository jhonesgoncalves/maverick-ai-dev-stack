#!/usr/bin/env node
import {
  main
} from "./chunk-XZFR5DYE.js";
import "./chunk-JNI3YSKA.js";
import "./chunk-KCWDTZSZ.js";
import {
  colorEnabled,
  style
} from "./chunk-TWL7K2MM.js";
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
    import("./HomeScreen-BEXLXZUQ.js"),
    import("./snapshot-SX4LEOXA.js")
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
