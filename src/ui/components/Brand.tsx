import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';
export function Brand() { return <><Text color={process.env.NO_COLOR ? undefined : theme.brand}>⚔ MAVERICK</Text><Text dimColor>\nAI DEV STACK</Text></>; }
