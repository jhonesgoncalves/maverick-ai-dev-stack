#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { HomeScreen } from '../ui/screens/HomeScreen.js';
import { main } from '../cli.js';
const args = process.argv.slice(2);
if (args.length === 0 && process.stdin.isTTY && !process.env.CI && !args.includes('--json')) render(<HomeScreen />);
else main(args).catch(error => { console.error(`maverick: ${error.message}`); process.exitCode = 1; });
