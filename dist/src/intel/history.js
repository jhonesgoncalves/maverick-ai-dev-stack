import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// What Git history says that the code cannot: which files change together (temporal
// coupling), who holds the knowledge of each area, and how active the repository is.
// Language-agnostic by construction. Author names stay on this machine.

const exec = promisify(execFile);
const MAX_COMMITS = 2000, MAX_FILES_PER_COMMIT = 40;

/** Parsed `git log`: [{ hash, author, time, files }], newest first. Empty outside Git. */
export async function readHistory(cwd, { since = '12 months ago', limit = MAX_COMMITS } = {}) {
  try {
    const { stdout } = await exec('git', ['log', `--since=${since}`, `-n${limit}`, '--no-merges', '--name-only', '--format=%x00%h%x09%an%x09%at%x09%s'], { cwd, maxBuffer: 128 * 1024 * 1024 });
    return stdout.split('\0').filter(Boolean).map(chunk => {
      const [header, ...rest] = chunk.split('\n'), [hash, author, time, ...subject] = header.split('\t');
      return { hash, author, time: Number(time) * 1000, subject: subject.join('\t'), files: [...new Set(rest.map(line => line.trim()).filter(Boolean))] };
    });
  } catch { return []; }
}

/**
 * Files that change together. degree = shared commits / average commits of the pair, so
 * 1.0 means they always change together. Large commits (formatting, renames) are ignored.
 */
export function changeCoupling(commits, { known, minShared = 3, minDegree = 0.3, limit = 60 } = {}) {
  const revisions = new Map(), shared = new Map();
  for (const commit of commits) {
    const files = commit.files.filter(file => !known || known.has(file));
    if (files.length > MAX_FILES_PER_COMMIT) continue;
    for (const file of files) revisions.set(file, (revisions.get(file) || 0) + 1);
    for (let a = 0; a < files.length; a++) for (let b = a + 1; b < files.length; b++) {
      const key = files[a] < files[b] ? `${files[a]}\0${files[b]}` : `${files[b]}\0${files[a]}`;
      shared.set(key, (shared.get(key) || 0) + 1);
    }
  }
  const pairs = [];
  for (const [key, count] of shared) {
    if (count < minShared) continue;
    const [a, b] = key.split('\0'), degree = count / ((revisions.get(a) + revisions.get(b)) / 2);
    if (degree >= minDegree) pairs.push({ a, b, shared: count, degree: Number(degree.toFixed(2)) });
  }
  return pairs.sort((x, y) => y.degree * y.shared - x.degree * x.shared || x.a.localeCompare(y.a)).slice(0, limit);
}

/** Authors per file and per group; the bus factor is the fewest authors covering over half the commits. */
export function ownership(commits, groupOf = () => null) {
  const files = new Map(), groups = new Map(), authors = new Map();
  const bump = (map, key, author) => { if (!map.has(key)) map.set(key, new Map()); const counts = map.get(key); counts.set(author, (counts.get(author) || 0) + 1); };
  for (const commit of commits) {
    authors.set(commit.author, (authors.get(commit.author) || 0) + 1);
    const touched = new Set();
    for (const file of commit.files) { bump(files, file, commit.author); const group = groupOf(file); if (group && !touched.has(group)) { touched.add(group); bump(groups, group, commit.author); } }
  }
  const summarize = counts => {
    const sorted = [...counts].sort((a, b) => b[1] - a[1]), total = sorted.reduce((sum, [, value]) => sum + value, 0);
    let covered = 0, busFactor = 0;
    for (const [, value] of sorted) { covered += value; busFactor++; if (covered > total / 2) break; }
    return { commits: total, authors: sorted.length, owner: sorted[0]?.[0], ownerShare: total ? Number((sorted[0][1] / total).toFixed(2)) : 0, busFactor, top: sorted.slice(0, 5).map(([name, value]) => ({ name, commits: value })) };
  };
  return {
    files: new Map([...files].map(([file, counts]) => [file, summarize(counts)])),
    groups: Object.fromEntries([...groups].map(([group, counts]) => [group, summarize(counts)])),
    contributors: [...authors].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, commits]) => ({ name, commits }))
  };
}

/** Commits per ISO week for the last `weeks` weeks, oldest first. */
export function activity(commits, weeks = 26, now = Date.now()) {
  const week = 7 * 24 * 3600 * 1000, series = Array.from({ length: weeks }, (_, index) => ({ week: new Date(now - (weeks - 1 - index) * week).toISOString().slice(0, 10), commits: 0, files: 0 }));
  for (const commit of commits) {
    const age = Math.floor((now - commit.time) / week);
    if (age >= 0 && age < weeks) { const slot = series[weeks - 1 - age]; slot.commits++; slot.files += commit.files.length; }
  }
  return series;
}

/** Commits per file: the churn used by hotspots. */
export function churnOf(commits) {
  const counts = new Map();
  for (const commit of commits) for (const file of commit.files) counts.set(file, (counts.get(file) || 0) + 1);
  return counts;
}
