import React from 'react';
import { Box, Text } from 'ink';
import { logoGradient, symbols, theme, tone } from '../theme.js';

// The Maverick AI lockup in block letters: MAVERICK in the text colour, AI in brand orange.
const MAVERICK = [
  '███╗   ███╗ █████╗ ██╗   ██╗███████╗██████╗ ██╗ ██████╗██╗  ██╗',
  '████╗ ████║██╔══██╗██║   ██║██╔════╝██╔══██╗██║██╔════╝██║ ██╔╝',
  '██╔████╔██║███████║██║   ██║█████╗  ██████╔╝██║██║     █████╔╝ ',
  '██║╚██╔╝██║██╔══██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║██║     ██╔═██╗ ',
  '██║ ╚═╝ ██║██║  ██║ ╚████╔╝ ███████╗██║  ██║██║╚██████╗██║  ██╗',
  '╚═╝     ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝'
];
const AI = [
  ' █████╗ ██╗',
  '██╔══██╗██║',
  '███████║██║',
  '██╔══██║██║',
  '██║  ██║██║',
  '╚═╝  ╚═╝╚═╝'
];

export const LOGO_WIDTH = MAVERICK[0].length + 1 + AI[0].length;

/** The block lockup, or the one-line wordmark when space is tight. */
export function Brand({ compact = false, version }: { compact?: boolean; version?: string }) {
  const tagline = <Text color={tone('muted')} italic>Understand. Build. Debug. Ship.</Text>;
  const meta = <Text><Text color={tone('muted')}>DEVELOPER WORKSPACE</Text>{version ? <Text color={tone('subtle')}>  v{version}</Text> : null}</Text>;
  if (compact) return <Box gap={2}><Text bold><Text color={tone('text')}>MAVERICK</Text> <Text color={tone('brand')}>AI</Text></Text>{meta}{tagline}</Box>;
  return (
    <Box flexDirection="column">
      {MAVERICK.map((line, index) => (
        <Text key={index}>
          <Text color={tone('text')}>{line}</Text> <Text color={theme.plain ? undefined : logoGradient[index]}>{AI[index]}</Text>
        </Text>
      ))}
      <Box gap={2} marginTop={1}><Text color={tone('brand')}>{symbols.diamond}</Text>{meta}<Text color={tone('subtle')}>·</Text>{tagline}</Box>
    </Box>
  );
}
