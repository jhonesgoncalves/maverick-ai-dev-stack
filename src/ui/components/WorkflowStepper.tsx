import React from 'react';
import { Box, Text } from 'ink';
import { stagesForPreset } from '../../core/presets.js';

export function WorkflowStepper({ preset = 'standard', activeStage }: { preset?: string; activeStage?: string }) {
  const stages = stagesForPreset(preset);
  return <Box flexDirection="column">{stages.map((stage: string, index: number) => <Text key={stage}>{String(index + 1).padStart(2, '0')} {stage === activeStage ? '●' : '○'} {stage.toUpperCase()}</Text>)}</Box>;
}
