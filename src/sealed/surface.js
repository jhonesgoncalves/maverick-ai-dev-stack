import { sectionBody } from '../core/util.js';
import { extractImports, isLocalImport, languageForPath } from '../core/imports.js';

/** A static lint of imports; ambiguous dynamic access is explicitly left for the suite reviewer. */
export function lintSurface(bundle, { surface, spec = '', techspec = '', resolveImport }) {
  const contract = surface === 'techspec' ? sectionBody(techspec, 'Interfaces and Data') : sectionBody(spec, 'Contracts');
  const findings = [], identifiers = new Set(contract.match(/[a-zA-Z_$][\w$]*/g) || []);
  for (const file of bundle.files.filter(file => file.role === 'test')) {
    const language = languageForPath(file.path);
    const imports = extractImports(language, file.content);
    for (const path of imports) {
      const project = /^(?:\.|\/|@\/|~\/)|(?:^|\/)src\//.test(path) || isLocalImport(language, path) || Boolean(resolveImport?.(language, path, file.path).length);
      if (!project) continue;
      if (surface === 'boundary') findings.push({ file: file.path, severity: 'block', kind: 'surface-import', message: `Boundary tests cannot import project code (${path}).` });
      else {
        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const named = file.content.match(new RegExp(`import\\s*\\{([^}]+)\\}[^;]*?from\\s*['"]${escaped}['"]`)) || (language === 'Python' && file.content.match(new RegExp(`from\\s+${escaped}\\s+import\\s+([^\\n]+)`)));
        if (named) for (const entry of named[1].split(',')) {
          const symbol = entry.trim().split(/\s+as\s+/)[0];
          if (!identifiers.has(symbol)) findings.push({ file: file.path, severity: 'block', kind: 'surface-symbol', message: `${symbol} is absent from the ${surface} contract.` });
        }
        else findings.push({ file: file.path, severity: 'warn', kind: 'surface-unverified', message: `Review the interface accessed through ${path}; static lint could not prove it belongs to the selected surface.` });
      }
    }
    if (surface === 'boundary' && /(?:readFile\w*|open|read_text)\s*\(\s*['"](?:\.\.\/|\.\/)?src\//.test(file.content)) findings.push({ file: file.path, severity: 'block', kind: 'surface-file-access', message: 'Boundary tests cannot read source files directly.' });
    if (/\b(?:eval|exec)\s*\(|\bimport\s*\([^'"]/.test(file.content)) findings.push({ file: file.path, severity: 'warn', kind: 'surface-dynamic', message: 'Dynamic execution requires a surface review.' });
  }
  return { ok: !findings.some(f => f.severity === 'block'), findings };
}

/** Scan tool invocations, not prompts mentioning the vault as a prohibition. */
export function scanVaultAccess(transcript, vault) {
  const findings = [];
  for (const line of String(transcript).split('\n').filter(Boolean)) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'tool') continue;
    const text = JSON.stringify(event);
    if (text.includes(vault) || /(?:\.maverick\/vault|suite\.enc|MAVERICK_SEAL_KEY|seal\s+status[^\n]*--reveal)/.test(text)) findings.push({ severity: 'block', kind: 'vault-access', source: 'transcript', message: 'A builder tool invocation attempted to access the sealed-test vault.' });
  }
  return findings;
}
