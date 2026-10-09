#!/usr/bin/env node
import { main } from '../cli.js';
import { colorEnabled, style } from '../core/style.js';

const args = process.argv.slice(2);

function fail(error: Error) {
  const color = colorEnabled(process.stderr);
  console.error(color ? `${style.red('✖', process.stderr)} ${style.bold('maverick:', process.stderr)} ${error.message}` : `maverick: ${error.message}`);
  if (color && /unknown command/.test(error.message)) console.error(style.gray('  Run maverick help to see every command, or maverick with no arguments for the launcher.', process.stderr));
  process.exitCode = 1;
}

async function launcher() {
  const [{ default: React }, { render }, { HomeScreen }, { projectSnapshot }] = await Promise.all([
    import('react'),
    import('ink'),
    import('../ui/screens/HomeScreen.js'),
    import('../ui/snapshot.js')
  ]);
  let chosen: string[] | undefined;
  const app = render(React.createElement(HomeScreen, { snapshot: await projectSnapshot(), onRun: (argv: string[]) => { chosen = argv; } }));
  await app.waitUntilExit();
  if (chosen) await main(chosen);
}

if (args.length === 0 && process.stdin.isTTY && process.stdout.isTTY && !process.env.CI) launcher().catch(fail);
else main(args).catch(fail);
