import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { Brand, LOGO_WIDTH } from '../components/Brand.js';
import { ProjectCard, type Snapshot } from '../components/ProjectCard.js';
import { entriesFor, launcherGroups, needsInput, prefill } from '../launcher.js';
import { commands, findCommand } from '../../commands/index.js';
import { splitCommand } from '../../core/util.js';
import { symbols, tone } from '../theme.js';

type Entry = { key: string; id: string; group: string; usage: string; description: string; aliases: string[]; label?: string; argv?: string[]; ready?: boolean };
type Row = { header: string } | { entry: Entry; index: number };

function Hints({ items }: { items: [string, string][] }) {
  return <Box columnGap={2} flexWrap="wrap">{items.map(([key, label]) => <Text key={key}><Text color={tone('accent')} bold>{key}</Text><Text color={tone('muted')}> {label}</Text></Text>)}</Box>;
}

function Cursor() { return <Text inverse> </Text>; }

/** The interactive launcher: search or browse every command, then run it with pre-filled arguments. */
export function HomeScreen({ snapshot, onRun }: { snapshot: Snapshot; onRun: (argv: string[]) => void }) {
  const { exit } = useApp(), { stdout } = useStdout();
  const columns = stdout.columns || 80, rows = stdout.rows || 30;
  const compact = columns < LOGO_WIDTH + 4 || rows < 34, width = Math.min(columns - 2, 96);
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null), [input, setInput] = useState(''), [completion, setCompletion] = useState(0);
  const [launch, setLaunch] = useState<string[] | null>(null);

  const entries: Entry[] = useMemo(() => entriesFor(snapshot, query), [snapshot, query]);
  const current = entries[Math.min(selected, entries.length - 1)];
  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => { if (launch) { onRun(launch); exit(); } }, [launch]);

  const listRows: Row[] = useMemo(() => {
    if (query.trim()) return entries.map((entry, index) => ({ entry, index }));
    return launcherGroups.flatMap(group => {
      const members = entries.map((entry, index) => ({ entry, index })).filter(row => row.entry.group === group.id);
      return members.length ? [{ header: group.title }, ...members] : [];
    });
  }, [entries, query]);

  const run = (entry: Entry, extra?: string[]) => setLaunch([entry.id, ...(extra ?? entry.argv ?? prefill(findCommand(entry.id), snapshot))]);
  const edit = (entry: Entry) => { setEditing(entry); setCompletion(0); setInput((entry.argv ?? prefill(findCommand(entry.id), snapshot)).join(' ')); };
  const jumpGroup = (step: number) => {
    const starts = listRows.flatMap((row, at) => 'header' in row && 'entry' in (listRows[at + 1] || {}) ? [(listRows[at + 1] as { index: number }).index] : []);
    if (!starts.length) return;
    const now = starts.filter(start => start <= selected).length - 1;
    setSelected(starts[(now + step + starts.length) % starts.length]);
  };

  useInput((char, key) => {
    if (launch) return;
    if (editing) {
      if (key.escape) return setEditing(null);
      if (key.return) { try { return run(editing, splitCommand(input)); } catch { return; } }
      if (key.backspace || key.delete) { setCompletion(0); return setInput(value => value.slice(0, -1)); }
      if (key.tab && snapshot.tasks.length) {
        const parts = input.split(' '), last = parts.pop() || '';
        const base = completion ? parts.concat('') : parts.concat(last);
        const pool = snapshot.tasks.map(task => task.slug).filter(slug => !completion ? slug.startsWith(last) : true);
        if (!pool.length) return;
        setInput([...base.slice(0, -1), pool[completion % pool.length]].join(' '));
        return setCompletion(value => value + 1);
      }
      if (char && !key.ctrl && !key.meta) { setCompletion(0); setInput(value => value + char); }
      return;
    }
    if (key.escape) return query ? setQuery('') : exit();
    if (key.upArrow) return setSelected(value => (value - 1 + entries.length) % Math.max(1, entries.length));
    if (key.downArrow) return setSelected(value => (value + 1) % Math.max(1, entries.length));
    if (key.pageUp) return setSelected(value => Math.max(0, value - 8));
    if (key.pageDown) return setSelected(value => Math.min(entries.length - 1, value + 8));
    if (key.tab) return jumpGroup(key.shift ? -1 : 1);
    if (!current) { if (key.backspace || key.delete) setQuery(value => value.slice(0, -1)); else if (char && !key.ctrl && !key.meta) setQuery(value => value + char); return; }
    if (key.return) return current.ready || (!current.argv && !needsInput(findCommand(current.id), snapshot)) ? run(current) : edit(current);
    if (key.rightArrow) return edit(current);
    if (key.backspace || key.delete) return setQuery(value => value.slice(0, -1));
    if (char === 'q' && !query) return exit();
    if (char && !key.ctrl && !key.meta && (char !== ' ' || query)) setQuery(value => value + char);
  });

  if (launch) return <Text><Text color={tone('brand')}>{symbols.pointer}</Text><Text color={tone('muted')}> maverick </Text><Text bold>{launch.join(' ')}</Text></Text>;

  // Rows taken by the logo, project card, search, details and hints.
  // Short terminals drop the details box so the command list keeps most of the screen.
  const details = rows >= 40, card = snapshot.initialized && !snapshot.configError ? 5 : 4;
  const fixed = (compact ? 1 : 8) + 1 + card + 2 + 1 + (details ? 5 : 0) + 2 + 2;
  const capacity = Math.max(6, rows - fixed);
  const focus = Math.max(0, listRows.findIndex(row => 'entry' in row && row.index === selected));
  const start = Math.min(Math.max(0, focus - Math.floor(capacity / 2)), Math.max(0, listRows.length - capacity));
  const visible = listRows.slice(start, start + capacity);
  const countEntries = (list: Row[]) => list.filter(row => 'entry' in row).length;
  const entriesAbove = countEntries(listRows.slice(0, start)), entriesBelow = countEntries(listRows.slice(start + capacity));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Brand compact={compact} version={snapshot.version} />
      <Box marginTop={1}><ProjectCard snapshot={snapshot} width={width} /></Box>

      {editing ? (
        <Box flexDirection="column" marginTop={1} width={width}>
          <Box borderStyle="round" borderColor={tone('brand')} paddingX={1}>
            <Text color={tone('brand')}>{symbols.pointer} </Text><Text color={tone('muted')}>maverick </Text><Text bold>{editing.id} </Text><Text>{input}</Text><Cursor />
          </Box>
          <Box flexDirection="column" paddingX={2}>
            <Text><Text color={tone('muted')}>usage  </Text><Text color={tone('text')}>maverick {editing.usage}</Text></Text>
            <Text color={tone('muted')}>{editing.description}</Text>
            {snapshot.tasks.length ? <Text wrap="truncate-end"><Text color={tone('muted')}>tasks  </Text><Text color={tone('info')}>{snapshot.tasks.slice(0, 6).map(task => task.slug).join('  ')}</Text></Text> : null}
          </Box>
          <Box marginTop={1} paddingX={1}><Hints items={[['enter', 'run'], ['tab', 'complete task'], ['esc', 'back']]} /></Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1} width={width}>
          <Box paddingX={1}>
            <Text color={tone(query ? 'brand' : 'muted')}>{symbols.search} </Text>
            {query ? <><Text bold>{query}</Text><Cursor /><Text color={tone('muted')}>  {entries.length} match{entries.length === 1 ? '' : 'es'}</Text></> : <><Cursor /><Text color={tone('subtle')}> type to search {commands.length} commands</Text></>}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            {start > 0 ? <Text color={tone('subtle')}>   ↑ {entriesAbove} more</Text> : null}
            {visible.map((row, at) => 'header' in row
              ? <Box key={`h-${row.header}`} marginTop={at === 0 ? 0 : 1} paddingX={1}><Text bold color={tone('accent')}>{row.header.toUpperCase()}</Text></Box>
              : <Row key={row.entry.key} entry={row.entry} active={row.index === selected} width={width} />)}
            {start + capacity < listRows.length ? <Text color={tone('subtle')}>   ↓ {entriesBelow} more</Text> : null}
            {!entries.length ? <Box paddingX={1}><Text color={tone('warning')}>No command matches “{query}”. </Text><Text color={tone('muted')}>esc to clear</Text></Box> : null}
          </Box>
          {current && details ? (
            <Box marginTop={1} borderStyle="round" borderColor={tone('subtle')} paddingX={1} flexDirection="column">
              <Text wrap="truncate-end"><Text color={tone('brand')}>$ </Text><Text color={tone('muted')}>maverick </Text><Text bold>{current.argv ? [current.id, ...current.argv].join(' ') : current.usage}</Text></Text>
              <Text color={tone('muted')} wrap="truncate-end">{current.description}{current.aliases.length ? `  ·  alias: ${current.aliases.join(', ')}` : ''}</Text>
            </Box>
          ) : null}
          <Box marginTop={1} paddingX={1}><Hints items={[['↑↓', 'move'], ['tab', 'next group'], ['enter', 'run'], ['→', 'edit args'], ['esc', query ? 'clear' : 'quit']]} /></Box>
        </Box>
      )}
    </Box>
  );
}

function Row({ entry, active, width }: { entry: Entry; active: boolean; width: number }) {
  const name = entry.label || entry.id, column = 22;
  return (
    <Box paddingX={1} width={width} backgroundColor={active ? tone('selection') : undefined}>
      <Box width={2} flexShrink={0}><Text color={tone('brand')}>{active ? symbols.pointer : ' '}</Text></Box>
      <Box width={column} flexShrink={0}><Text bold={active} color={tone('text')} wrap="truncate-end">{name}</Text></Box>
      <Text color={tone(active ? 'text' : 'muted')} wrap="truncate-end">{entry.description}</Text>
    </Box>
  );
}
