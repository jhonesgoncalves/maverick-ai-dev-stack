import React from 'react';
import { Box, Text } from 'ink';
import { symbols, tone } from '../theme.js';
import { WorkflowStepper } from './WorkflowStepper.js';

type Task = { slug: string; preset: string; stage: string; next: string };
export type Snapshot = {
  cwd: string; version: string; initialized: boolean; configError?: string;
  name: string; branch?: string; preset: string; presetName: string; tasks: Task[]; latest?: Task;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <Text><Text color={tone('muted')}>{label} </Text>{children}</Text>;
}

/** Project, branch, preset and the latest task's position in its workflow, in as few rows as the width allows. */
export function ProjectCard({ snapshot, width }: { snapshot: Snapshot; width: number }) {
  const { latest } = snapshot, narrow = width < 90;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tone('subtle')} paddingX={1} width={width}>
      <Box columnGap={2}>
        <Text bold color={tone('text')} wrap="truncate-end">{symbols.diamond} {snapshot.name}</Text>
        {snapshot.branch ? <Text color={tone('info')} wrap="truncate-end">{symbols.branch} {snapshot.branch}</Text> : null}
        <Field label="preset"><Text color={tone('accent')}>{snapshot.presetName}</Text></Field>
        {narrow ? null : <Field label="tasks"><Text color={tone('text')}>{snapshot.tasks.length}</Text></Field>}
      </Box>
      {snapshot.configError
        ? <Text color={tone('danger')}>{symbols.cross} {snapshot.configError}</Text>
        : !snapshot.initialized
          ? <Text color={tone('warning')}>Not initialized yet — run <Text bold>init</Text> to create .maverick/config.json</Text>
          : latest
            ? <>
                <Text wrap="truncate-end"><Text color={tone('muted')}>{narrow ? `tasks ${snapshot.tasks.length} · ` : ''}latest </Text><Text bold color={tone('text')}>{latest.slug}</Text><Text color={tone('muted')}>  {symbols.arrow} {latest.next}</Text></Text>
                <WorkflowStepper preset={latest.preset} activeStage={latest.stage} compact={narrow} />
              </>
            : <>
                <Text color={tone('muted')}>No tasks yet — pick <Text bold color={tone('text')}>task</Text> to start one.</Text>
                <WorkflowStepper preset={snapshot.preset} compact={narrow} />
              </>}
    </Box>
  );
}
