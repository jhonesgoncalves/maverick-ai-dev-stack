import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectStack } from '../core/stack.js';
import { lacksGitBaseline } from '../core/project-tools.js';
import { commitTree, inPlace, repoInfo, resolveRef } from '../loop/git.js';
import { backupProtected, checkProtected, restoreBackup } from '../loop/guards.js';
import { auditIntegrity } from '../loop/integrity.js';
import { loopSettings } from '../loop/model.js';

// A `flow run --agent` fix gets the guarantees of a loop iteration. Before the agent runs, the
// working tree is snapshotted through a private index (a restore point), the files that define
// the task and its checks are backed up, and HEAD, the branch, the index and the stash are
// recorded. After it, protected files are put back, the git state is checked, and the fix's
// own diff is audited by the integrity guard; a blocking finding rolls the fix back.

/**
 * Opens the guard for one agent run; `check()` after the run, `close()` always. Outside git
 * (or before the first commit) only the protected files are backed up and restored.
 */
export async function guardAgentRun({ cwd, taskDir, task, config, subtask, gates = [] }) {
  const scratch = await mkdtemp(join(tmpdir(), 'maverick-fix-'));
  try {
    const info = await repoInfo(cwd);
    if (!info.repo || !info.head || info.operation || await lacksGitBaseline(cwd)) {
      const backup = await backupProtected({ cwd, taskDir, loopDir: scratch, inflight: scratch, subtask });
      return {
        async check() { const { findings } = await checkProtected(backup); return { fatal: [], findings, blocking: findings.filter(item => item.severity === 'block'), rolledBack: null, diff: null }; },
        close: () => rm(scratch, { recursive: true, force: true })
      };
    }
    const tree = inPlace({ cwd, task, indexFile: join(scratch, 'index'), inflight: scratch });
    const before = await tree.snapshot(), commit = await commitTree(cwd, before, await resolveRef(cwd, 'HEAD'), `maverick fix ${task}: before the agent run\n`);
    const backup = await backupProtected({ cwd, taskDir, loopDir: scratch, inflight: scratch, subtask });
    const invariants = await tree.captureInvariants();
    return {
      /** `{ fatal, findings, blocking, rolledBack, diff }`: fatal means the agent moved HEAD or the branch, which only a human undoes. */
      async check({ claim = {} } = {}) {
        const guarded = await checkProtected(backup), invariant = await tree.checkInvariants(invariants);
        if (invariant.fatal.length) return { fatal: invariant.fatal, findings: [...guarded.findings, ...invariant.findings], blocking: [], rolledBack: null, diff: null };
        const after = await tree.snapshot(), diff = await tree.diff(before, after);
        const audit = await auditIntegrity(cwd, { base: before, head: after, diff, taskDir, subtask, settings: loopSettings(config, null, {}), config, stack: await detectStack(cwd), gates, claim });
        const findings = [...guarded.findings, ...invariant.findings, ...audit.findings], blocking = findings.filter(item => item.severity === 'block');
        let rolledBack = null;
        if (blocking.length) { rolledBack = await tree.rollback({ tree: before, commit }); await restoreBackup(backup); }
        return { fatal: [], findings, blocking, rolledBack, diff: { files: diff.files.length, added: diff.added, deleted: diff.deleted } };
      },
      close: () => rm(scratch, { recursive: true, force: true })
    };
  } catch (error) { await rm(scratch, { recursive: true, force: true }); throw error; }
}
