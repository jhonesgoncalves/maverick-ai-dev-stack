import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Brand } from '../components/Brand.js';
import { WorkflowStepper } from '../components/WorkflowStepper.js';
const choices = ['Create a task', 'Continue a task', 'Review a change', 'Validate artifacts', 'Project doctor', 'Help'];
export function HomeScreen() { const [selected, setSelected] = useState(0); const { exit } = useApp(); useInput((input, key) => { if (input === 'q' || key.escape) exit(); if (key.upArrow) setSelected(v => Math.max(0, v - 1)); if (key.downArrow) setSelected(v => Math.min(choices.length - 1, v + 1)); }); return <Box flexDirection="column"><Brand /><Text>\n\nContext before code.\n</Text><WorkflowStepper /><Text>\nWhat do you want to do?\n</Text>{choices.map((choice, index) => <Text key={choice}>{index === selected ? '› ' : '  '}{choice}</Text>)}<Text dimColor>\n↑↓ navigate   enter select   q quit</Text></Box>; }
