import React, { useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { answersFrom, summarize, toggle, toggleAll, validate } from '../init-wizard.js';
import { symbols, tone } from '../theme.js';

type Option = { value: string; label: string; hint?: string; tag?: string };
type Step = { id: string; kind: 'text' | 'select' | 'multi'; title: string; hint?: string; placeholder?: string; required?: boolean; min?: number; options?: Option[]; value: string | string[] };
type Values = Record<string, string | string[]>;
type Props = { steps: Step[]; detected?: string; onDone: (answers: Values | null) => void };

function Hints({ items }: { items: [string, string][] }) {
  return <Box columnGap={2} flexWrap="wrap">{items.map(([key, label]) => <Text key={key}><Text color={tone('accent')} bold>{key}</Text><Text color={tone('muted')}> {label}</Text></Text>)}</Box>;
}

const start = (step: Step, value: Values[string]) => (step.kind === 'select' ? Math.max(0, step.options!.findIndex(option => option.value === value)) : 0);

/** The `maverick init` interview: one step at a time, finished steps collapse to their answer. */
export function InitScreen({ steps, detected, onDone }: Props) {
  const { exit } = useApp();
  const [index, setIndex] = useState(0), [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Values>(() => Object.fromEntries(steps.map(step => [step.id, step.value])));
  const [cursor, setCursor] = useState(() => start(steps[0], steps[0].value));
  const [done, setDone] = useState<'saved' | 'cancelled' | null>(null);
  const reviewing = index === steps.length, step = steps[index];

  const finish = (answers: Values | null) => { setDone(answers ? 'saved' : 'cancelled'); onDone(answers); setTimeout(exit, 0); };
  const go = (to: number) => { setError(null); setIndex(to); if (to < steps.length) setCursor(start(steps[to], values[steps[to].id])); };
  const set = (value: Values[string]) => { setError(null); setValues(current => ({ ...current, [step.id]: value })); };
  const next = () => { const problem = validate(step, values[step.id]); if (problem) return setError(problem); go(index + 1); };

  useInput((char, key) => {
    if (done) return;
    if (key.ctrl && char === 'c') return finish(null);
    if (key.escape) return index > 0 ? go(index - 1) : finish(null);
    if (reviewing) { if (key.return) finish(answersFrom(steps, values)); return; }
    if (step.kind === 'text') {
      const text = String(values[step.id] ?? '');
      if (key.return) return next();
      if (key.backspace || key.delete) return set(text.slice(0, -1));
      if (key.ctrl && char === 'u') return set('');
      if (char && !key.ctrl && !key.meta && !key.tab) set(text + char.replace(/[\r\n]+/g, ' '));
      return;
    }
    const options = step.options!, count = options.length;
    if (key.upArrow || char === 'k') return setCursor(value => (value - 1 + count) % count);
    if (key.downArrow || char === 'j' || key.tab) return setCursor(value => (value + 1) % count);
    if (step.kind === 'select') { if (key.return) { set(options[cursor].value); go(index + 1); } return; }
    const selected = values[step.id] as string[];
    if (char === ' ') return set(toggle(step, selected, options[cursor].value));
    if (char === 'a') return set(toggleAll(step, selected));
    if (key.return) next();
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box gap={2} marginBottom={1}>
        <Text bold><Text color={tone('text')}>MAVERICK</Text> <Text color={tone('brand')}>AI</Text></Text>
        <Text color={tone('muted')}>INIT</Text>
        {detected ? <Text color={tone('subtle')}>detected {detected}</Text> : null}
      </Box>

      {steps.slice(0, index).map(item => (
        <Text key={item.id} wrap="truncate-end">
          <Text color={tone('success')}>{symbols.check} </Text><Text color={tone('muted')}>{item.title}  </Text><Text color={tone('text')}>{summarize(item, values[item.id])}</Text>
        </Text>
      ))}

      {done ? (
        <Box marginTop={1}><Text color={tone(done === 'saved' ? 'success' : 'warning')}>{done === 'saved' ? `${symbols.check} Setting up the project…` : `${symbols.cross} Cancelled. Nothing was written.`}</Text></Box>
      ) : reviewing ? (
        <Box flexDirection="column" marginTop={1}>
          <Text><Text color={tone('brand')}>{symbols.diamond} </Text><Text bold>Write the configuration and install the flow skills?</Text></Text>
          <Box marginTop={1} paddingX={2}><Hints items={[['enter', 'confirm'], ['esc', 'back']]} /></Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={index ? 1 : 0}>
          <Text>
            <Text color={tone('brand')}>{symbols.diamond} </Text><Text bold>{step.title}</Text>
            <Text color={tone('subtle')}>  {index + 1}/{steps.length}</Text>
          </Text>
          {step.hint ? <Box paddingX={2}><Text color={tone('muted')}>{step.hint}</Text></Box> : null}
          <Box flexDirection="column" paddingX={2} marginTop={step.kind === 'text' ? 0 : 1}>
            {step.kind === 'text' ? <TextField value={String(values[step.id] ?? '')} placeholder={step.placeholder} /> : (
              step.options!.map((option, at) => (
                <OptionRow key={option.value} option={option} active={at === cursor} multi={step.kind === 'multi'} width={Math.max(...step.options!.map(item => item.label.length)) + 3}
                  checked={step.kind === 'multi' ? (values[step.id] as string[]).includes(option.value) : values[step.id] === option.value} />
              ))
            )}
          </Box>
          {error ? <Box paddingX={2}><Text color={tone('warning')}>{error}</Text></Box> : null}
          <Box marginTop={1} paddingX={2}>
            <Hints items={step.kind === 'text' ? [['enter', 'next'], ['ctrl+u', 'clear'], ['esc', index ? 'back' : 'cancel']]
              : step.kind === 'multi' ? [['↑↓', 'move'], ['space', 'toggle'], ['a', 'all'], ['enter', 'confirm'], ['esc', index ? 'back' : 'cancel']]
                : [['↑↓', 'move'], ['enter', 'select'], ['esc', index ? 'back' : 'cancel']]} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

function TextField({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <Box borderStyle="round" borderColor={tone('brand')} paddingX={1}>
      <Text color={tone('brand')}>{symbols.pointer} </Text>
      {value ? <Text>{value}</Text> : null}<Text inverse> </Text>
      {!value && placeholder ? <Text color={tone('subtle')}> {placeholder}</Text> : null}
    </Box>
  );
}

function OptionRow({ option, active, multi, checked, width }: { option: Option; active: boolean; multi: boolean; checked: boolean; width: number }) {
  const mark = multi ? (checked ? '◼' : '◻') : checked ? symbols.dot : symbols.ring;
  return (
    <Box backgroundColor={active ? tone('selection') : undefined}>
      <Box width={2} flexShrink={0}><Text color={tone('brand')}>{active ? symbols.pointer : ' '}</Text></Box>
      <Box width={2} flexShrink={0}><Text color={tone(checked ? 'brand' : 'subtle')}>{mark}</Text></Box>
      <Box width={width} flexShrink={0}><Text bold={active} color={tone(checked || active ? 'text' : 'muted')} wrap="truncate-end">{option.label}</Text></Box>
      {option.hint ? <Text color={tone('subtle')} wrap="truncate-end">{option.hint}</Text> : null}
      {option.tag ? <Text color={tone('success')}>  {option.tag}</Text> : null}
    </Box>
  );
}

/** Runs the wizard and resolves with the answers, or null when the user cancels. */
export async function runInitWizard(props: Omit<Props, 'onDone'>): Promise<Values | null> {
  let result: Values | null = null;
  const app = render(<InitScreen {...props} onDone={answers => { result = answers; }} />, { exitOnCtrlC: false });
  await app.waitUntilExit();
  return result;
}
