import {
  auditIntegrity,
  backupProtected,
  checkProtected,
  lacksGitBaseline,
  restoreBackup
} from "./chunk-MYBR3ZVS.js";
import {
  loopSettings
} from "./chunk-CJM6UDEI.js";
import {
  commitTree,
  inPlace,
  repoInfo,
  resolveRef
} from "./chunk-7NWRWT3R.js";
import {
  detectStack
} from "./chunk-NBABBXKT.js";

// src/flows/guard.js
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
async function guardAgentRun({ cwd, taskDir, task, config, subtask, gates = [] }) {
  const scratch = await mkdtemp(join(tmpdir(), "maverick-fix-"));
  try {
    const info = await repoInfo(cwd);
    if (!info.repo || !info.head || info.operation || await lacksGitBaseline(cwd)) {
      const backup2 = await backupProtected({ cwd, taskDir, loopDir: scratch, inflight: scratch, subtask });
      return {
        async check() {
          const { findings } = await checkProtected(backup2);
          return { fatal: [], findings, blocking: findings.filter((item) => item.severity === "block"), rolledBack: null, diff: null };
        },
        close: () => rm(scratch, { recursive: true, force: true })
      };
    }
    const tree = inPlace({ cwd, task, indexFile: join(scratch, "index"), inflight: scratch });
    const before = await tree.snapshot(), commit = await commitTree(cwd, before, await resolveRef(cwd, "HEAD"), `maverick fix ${task}: before the agent run
`);
    const backup = await backupProtected({ cwd, taskDir, loopDir: scratch, inflight: scratch, subtask });
    const invariants = await tree.captureInvariants();
    return {
      /** `{ fatal, findings, blocking, rolledBack, diff }`: fatal means the agent moved HEAD or the branch, which only a human undoes. */
      async check({ claim = {} } = {}) {
        const guarded = await checkProtected(backup), invariant = await tree.checkInvariants(invariants);
        if (invariant.fatal.length) return { fatal: invariant.fatal, findings: [...guarded.findings, ...invariant.findings], blocking: [], rolledBack: null, diff: null };
        const after = await tree.snapshot(), diff = await tree.diff(before, after);
        const audit = await auditIntegrity(cwd, { base: before, head: after, diff, taskDir, subtask, settings: loopSettings(config, null, {}), config, stack: await detectStack(cwd), gates, claim });
        const findings = [...guarded.findings, ...invariant.findings, ...audit.findings], blocking = findings.filter((item) => item.severity === "block");
        let rolledBack = null;
        if (blocking.length) {
          rolledBack = await tree.rollback({ tree: before, commit });
          await restoreBackup(backup);
        }
        return { fatal: [], findings, blocking, rolledBack, diff: { files: diff.files.length, added: diff.added, deleted: diff.deleted } };
      },
      close: () => rm(scratch, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(scratch, { recursive: true, force: true });
    throw error;
  }
}

export {
  guardAgentRun
};
