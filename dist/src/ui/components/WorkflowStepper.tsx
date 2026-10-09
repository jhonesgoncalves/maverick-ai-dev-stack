import React from 'react';
import { Box, Text } from 'ink';
import { stagesForPreset } from '../../core/presets.js';
import { symbols, tone } from '../theme.js';

/** The preset's stages as a horizontal pipeline; stages before `activeStage` read as done. */
export function WorkflowStepper({ preset = 'standard', activeStage, compact = false }: { preset?: string; activeStage?: string; compact?: boolean }) {
  const stages: string[] = stagesForPreset(preset), active = activeStage ? stages.indexOf(activeStage) : -1;
  return (
    <Box flexWrap="wrap">
      {stages.map((stage, index) => {
        const done = index < active, current = index === active;
        const mark = done ? symbols.check : current ? symbols.dot : symbols.ring;
        return (
          <Text key={stage}>
            <Text color={tone(done ? 'success' : current ? 'brand' : 'subtle')}>{mark} </Text>
            <Text bold={current} color={tone(current ? 'text' : done ? 'muted' : 'subtle')}>{stage.toUpperCase()}</Text>
            {index < stages.length - 1 ? <Text color={tone('subtle')}>{compact ? '  ' : ' ── '}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
