#!/usr/bin/env node
import {
  main
} from "./chunk-ZTZU47DN.js";
import "./chunk-XFU6F3IL.js";
import "./chunk-P3HZXI5Z.js";
import "./chunk-5QOS2D55.js";
import "./chunk-ONE7H2FR.js";
import "./chunk-MYBR3ZVS.js";
import "./chunk-CJM6UDEI.js";
import "./chunk-MV66CFUZ.js";
import "./chunk-7NWRWT3R.js";
import {
  colorEnabled,
  style
} from "./chunk-NBABBXKT.js";
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
    import("./HomeScreen-IMVTUTDW.js"),
    import("./snapshot-H5BZJPWB.js")
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
