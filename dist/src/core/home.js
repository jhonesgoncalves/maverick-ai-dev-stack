import { homedir } from 'node:os';
import { basename, join, relative, resolve, isAbsolute } from 'node:path';
import { sha256 } from '../capabilities/model.js';

// Maverick's private directory, outside every repository: `$MAVERICK_HOME`, or ~/.maverick.
// What lives here is out of an agent's working tree by construction: loop worktrees, the
// sealed-test vault and the reports a loop keeps from the agent that is being judged.

export function maverickHome() { return process.env.MAVERICK_HOME || join(homedir(), '.maverick'); }

/** A stable directory name for one project: its folder name plus a short hash of its path. */
export function repoKey(root) { return `${basename(root)}-${sha256(resolve(root)).slice(0, 8)}`; }

/** A path under the private directory for one project, e.g. `homePath(cwd, 'vault', task)`. */
export function homePath(root, area, ...parts) { return join(maverickHome(), area, repoKey(root), ...parts); }

/** True when either path contains the other: a private directory must never sit inside a work tree. */
export function overlaps(a, b) {
  const inside = (outer, inner) => { const path = relative(resolve(outer), resolve(inner)); return path === '' || (!path.startsWith('..') && !isAbsolute(path)); };
  return inside(a, b) || inside(b, a);
}
