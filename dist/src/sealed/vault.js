import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homePath, maverickHome } from '../core/home.js';
import { exists, splitCommand } from '../core/util.js';
import { executeCommand } from '../core/project-tools.js';

// The vault keeps sealed suites, their results and the sealer's transcript out of the work
// tree, encrypted: `$MAVERICK_HOME/vault/<project>/<task>/<sealId>/`. AES-256-GCM with a random
// 12-byte IV per file and the file's role and seal id as associated data, so a file moved from
// one seal or role to another fails to open, as does any edited byte.
//
// What this protects against is an agent coming across the tests: in a prompt, a report, a
// grep of the project, a transcript, git history. An agent with a full shell under the same
// user can read the key file; real secrecy needs operating-system isolation (another user, a
// container), which Maverick documents as an opt-in recipe and never claims to provide.

const MAGIC = Buffer.from('MVS1');
const ALGORITHM = 'aes-256-gcm';

export const vaultRoot = (cwd, task) => homePath(cwd, 'vault', task);

/**
 * The vault key, 32 bytes: `sealed.encryption.key` = `file` (created once, 0600, under
 * $MAVERICK_HOME/keys), `env` (MAVERICK_SEAL_KEY, base64 or hex) or `command` (prints the key).
 */
export async function vaultKey(settings = {}, cwd = process.cwd()) {
  const source = settings.encryption?.key || 'file';
  if (source === 'env') return decodeKey(process.env.MAVERICK_SEAL_KEY, 'MAVERICK_SEAL_KEY');
  if (source === 'command') {
    if (!settings.encryption?.command) throw new Error('sealed.encryption.command is required when the key comes from a command');
    splitCommand(settings.encryption.command);
    const result = await executeCommand(cwd, settings.encryption.command, '', 4096, { timeoutMs: 30000 });
    if (!result.ok) throw new Error(`the vault key command failed: ${result.output.trim().split('\n').at(-1)}`);
    return decodeKey(result.output.trim(), 'the vault key command');
  }
  const path = join(maverickHome(), 'keys', 'vault.key');
  if (!await exists(path)) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    await chmod(path, 0o600);
  }
  return decodeKey((await readFile(path, 'utf8')).trim(), path);
}

function decodeKey(text, where) {
  if (!text) throw new Error(`${where} is not set`);
  const key = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64');
  if (key.length !== 32) throw new Error(`${where} must hold a 32-byte key (base64 or 64 hex characters)`);
  return key;
}

/** Encrypts `data` (string or Buffer) bound to `aad`: MAGIC · IV · tag · ciphertext. */
export function encrypt(key, data, aad) {
  const iv = randomBytes(12), cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(String(data))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Decrypts what `encrypt` wrote; throws when the file was changed, moved or opened with another key. */
export function decrypt(key, blob, aad) {
  if (!Buffer.isBuffer(blob) || blob.length < 32 || !blob.subarray(0, 4).equals(MAGIC)) throw new Error('not a Maverick vault file');
  try {
    const decipher = createDecipheriv(ALGORITHM, key, blob.subarray(4, 16));
    decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(blob.subarray(16, 32));
    return Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]);
  } catch { throw new Error('the vault file was tampered with, or the vault key changed'); }
}

export async function writeVaultFile(path, key, data, aad) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, encrypt(key, data, aad), { mode: 0o600 });
}

export async function readVaultFile(path, key, aad) { return decrypt(key, await readFile(path), aad); }

export const readVaultJson = async (path, key, aad) => JSON.parse((await readVaultFile(path, key, aad)).toString('utf8'));
