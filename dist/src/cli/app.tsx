#!/usr/bin/env node
import { main } from '../cli.js';
const args = process.argv.slice(2);
if (args.length === 0 && process.stdin.isTTY && !process.env.CI && !args.includes('--json')) {
  const [{ default: React }, { render }, { HomeScreen }] = await Promise.all([
    import('react'),
    import('ink'),
    import('../ui/screens/HomeScreen.js')
  ]);
  render(React.createElement(HomeScreen));
} else main(args).catch(error => { console.error(`maverick: ${error.message}`); process.exitCode = 1; });
