import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executeCommand, findReferences, gitDiff, inspectProject, lacksGitBaseline, writeEvidence } from '../core/project-tools.js';
import { selectVerificationCommands } from '../core/stack.js';
import { getTask } from '../core/tasks.js';
import { buildGraph, createResolver, impactOf } from '../intel/graph.js';
import { extractRoutes } from '../intel/routes.js';
import { brand, changedFilesFromDiff, exists, output, packageRoot, pretty, readJson, readText, rel, sectionBody } from '../core/util.js';
import { acIds, pathReferences } from '../core/quality.js';
import { heading, projectLanguage } from '../core/language.js';
import { loadGraph } from '../subtasks/graph.js';

// Dependency files across ecosystems, matched against changed paths.
const LOCKFILE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|uv\.lock|pdm\.lock|Pipfile\.lock|requirements[\w.-]*\.txt|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock|mix\.lock|pubspec\.lock|packages\.lock\.json|gradle\.lockfile|Package\.resolved)$/;
const MANIFEST = /(?:^|\/)(?:package\.json|pyproject\.toml|Pipfile|setup\.py|setup\.cfg|go\.mod|Cargo\.toml|Gemfile|composer\.json|mix\.exs|pubspec\.yaml|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.(?:csproj|fsproj|vbproj)|Directory\.Packages\.props|Package\.swift)$/;

async function verifyTask(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  const map = await inspectProject(cwd);
  const selected = selectVerificationCommands(map.stack, config);
  if (!selected.length) throw new Error('no verification commands detected; run maverick stack, or declare verification.commands in .maverick/config.json');
  const results = [];
  for (const item of selected) results.push(await executeCommand(cwd, item.command, item.cwd));
  const evidence = await writeEvidence(dir, slug, results);
  const payload = { ok: results.every(result => result.ok), results: results.map((result, index) => ({ command: result.command, kind: selected[index].kind, source: selected[index].source, ok: result.ok, code: result.code })), evidence: rel(cwd, evidence) };
  if (options.json) output(JSON.stringify(payload, null, 2));
  else { output(`${brand()} / VERIFY`); results.forEach(result => output(`${result.ok ? 'PASS' : 'FAIL'} ${result.command}`)); output(`Evidence: ${payload.evidence}`); }
  if (!payload.ok) throw new Error('verification failed');
}

async function reviewDiff(cwd, slug, options = {}) {
  const { dir, preset, config } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || 'HEAD'), files = changedFilesFromDiff(diff), findings = [];
  if (await lacksGitBaseline(cwd)) findings.push('No git baseline: git tracks no file in this project; commit it before the task starts so the diff shows only the task.');
  else if (!diff) findings.push('No git diff found against the selected base.');
  if (files.some(file => /(^|\/)(\.env|secrets?|credentials?)/i.test(file))) findings.push('Security: sensitive-looking path changed; confirm secrets and PII were not included.');
  if (files.some(file => LOCKFILE.test(file))) findings.push('Dependencies: lockfile changed; review new packages, licenses, and vulnerabilities.');
  if (preset.strict && !await exists(join(dir, 'EVIDENCE.md'))) findings.push('Strict workflow: test evidence is missing; run maverick verify first.');
  // Blast radius: how far each changed source file reaches through the import graph.
  const graph = files.length ? await buildGraph(cwd) : null;
  const radius = graph ? files.map(file => ({ file, ...impactOf(graph, file) })).filter(item => item.known && item.dependents.length).sort((a, b) => b.dependents.length - a.dependents.length) : [];
  const path = join(dir, 'REVIEW-FINDINGS.md'), created = await ensureReview(dir, slug, config);
  await writeFile(path, `# Diff Review Findings — ${slug}\n\nBase: ${options.against || 'HEAD'}\nChanged files:\n${files.map(file => `- \`${file}\``).join('\n') || '- none'}\n\n## Findings\n${findings.map(finding => `- ${finding}`).join('\n') || '- No automated findings. Complete the human review in REVIEW.md.'}\n\n## Blast radius\n${radius.map(item => `- \`${item.file}\`: ${item.direct.length} direct / ${item.dependents.length} transitive dependents; tests: ${item.tests.slice(0, 5).map(test => `\`${test}\``).join(', ') || 'none'}`).join('\n') || '- Changed files have no local dependents.'}\n`);
  output(options.json ? JSON.stringify({ files, findings, path: rel(cwd, path), review: rel(cwd, join(dir, 'REVIEW.md')) }, null, 2) : `${brand()} / REVIEW\nChanged files: ${files.length}\nFindings: ${findings.length}\nReport: ${rel(cwd, path)}\n${created ? '✓ written' : 'Decide in'}: ${rel(cwd, join(dir, 'REVIEW.md'))}`);
}

/**
 * Writes REVIEW.md from the task itself: one checkbox per acceptance criterion and per task,
 * the checks every change needs, and the human decision. Existing reviews are never replaced.
 */
const REVIEW_TEXT = {
  en: { criteria: 'The change does what PRD.md describes.', tasks: 'Every planned change is present.', checks: ['Scope: the diff stays within TECHSPEC.md File References, with no drive-by refactors.', 'Tests: new behavior is tested, and no test was weakened to pass.', 'Security: inputs are validated, authorization is preserved, and no secrets or PII were added.', 'Dependencies: new, updated or removed packages are justified.', 'Rollback: the plan in TECHSPEC.md still holds.'], findings: 'Read REVIEW-FINDINGS.md, then record what matters here.', decision: ['approve', 'approve with follow-up', 'request changes'], explain: 'In your own words, why this change is safe to merge.' },
  'pt-BR': { criteria: 'A mudança faz o que o PRD.md descreve.', tasks: 'Toda mudança planejada está presente.', checks: ['Escopo: o diff fica dentro das Referências de Arquivos do TECHSPEC.md, sem refatorações de passagem.', 'Testes: o comportamento novo está testado e nenhum teste foi enfraquecido para passar.', 'Segurança: entradas são validadas, a autorização é preservada e nenhum segredo ou dado pessoal foi adicionado.', 'Dependências: pacotes novos, atualizados ou removidos estão justificados.', 'Rollback: o plano do TECHSPEC.md continua válido.'], findings: 'Leia o REVIEW-FINDINGS.md e registre aqui o que importa.', decision: ['approve (aprovar)', 'approve with follow-up (aprovar com ressalvas)', 'request changes (pedir mudanças)'], explain: 'Com suas palavras, por que esta mudança é segura para o merge.' },
  es: { criteria: 'El cambio hace lo que describe PRD.md.', tasks: 'Cada cambio planificado está presente.', checks: ['Alcance: el diff se mantiene dentro de las Referencias de Archivos de TECHSPEC.md, sin refactorizaciones de paso.', 'Pruebas: el comportamiento nuevo está probado y ninguna prueba se debilitó para pasar.', 'Seguridad: las entradas se validan, la autorización se preserva y no se añadieron secretos ni datos personales.', 'Dependencias: los paquetes nuevos, actualizados o eliminados están justificados.', 'Rollback: el plan de TECHSPEC.md sigue siendo válido.'], findings: 'Lee REVIEW-FINDINGS.md y registra aquí lo importante.', decision: ['approve (aprobar)', 'approve with follow-up (aprobar con seguimiento)', 'request changes (pedir cambios)'], explain: 'Con tus palabras, por qué este cambio es seguro para el merge.' }
};

/**
 * Writes REVIEW.md from the task itself, in the project's docs language: one checkbox per
 * acceptance criterion and per task, the checks every change needs, and the human decision.
 * Decision options keep their English keyword so gates can read them. Existing reviews are never replaced.
 */
async function ensureReview(dir, slug, config) {
  const path = join(dir, 'REVIEW.md');
  if (await exists(path)) return false;
  const docs = projectLanguage(config).docs, text = REVIEW_TEXT[docs.startsWith('pt') ? 'pt-BR' : docs.startsWith('es') ? 'es' : 'en'], h = name => heading(name, docs);
  const prd = await readText(join(dir, 'PRD.md')), graph = await loadGraph(dir);
  const criteria = sectionBody(prd, 'Acceptance Criteria').split('\n').filter(line => acIds(line).length).map(line => `- [ ] ${line.replace(/^\s*-\s*(\[[ xX]\]\s*)?/, '')}`);
  const tasks = graph.items.map(item => `- [ ] ${item.id} ${item.title} (${item.status})`);
  await writeFile(path, `# Review — ${slug}

## ${h('Acceptance Criteria')}
${criteria.join('\n') || `- [ ] ${text.criteria}`}

## ${h('Tasks')}
${tasks.join('\n') || `- [ ] ${text.tasks}`}

## ${h('Checks')}
${text.checks.map(check => `- [ ] ${check}`).join('\n')}

## ${h('Findings')}
${text.findings}

## ${h('Decision')}
${text.decision.map(option => `- [ ] ${option}`).join('\n')}

## ${h('Human Explanation')}
${text.explain}
`);
  return true;
}

async function checkpoint(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const [status, diff] = await Promise.all([executeCommand(cwd, 'git status --short -- .'), gitDiff(cwd, options.against || 'HEAD')]);
  const path = join(dir, 'CHECKPOINT.md');
  await writeFile(path, `# Checkpoint — ${slug}\n\nCreated: ${new Date().toISOString()}\nBase: ${options.against || 'HEAD'}\n\n## Git status\n\`\`\`text\n${status.output || '(unavailable)'}\n\`\`\`\n\n## Diff\n\`\`\`diff\n${diff || '(no diff available)'}\n\`\`\`\n`);
  output(options.json ? JSON.stringify({ path: rel(cwd, path), gitAvailable: status.ok }) : `${brand()} / CHECKPOINT\n✓ saved: ${rel(cwd, path)}`);
}

async function impact(cwd, path, options = {}) {
  if (!path || path.includes('..')) throw new Error('provide a project-relative file path');
  const target = path.replace(/^\.\//, '');
  const sources = new Map(), graph = await buildGraph(cwd, { sources }), result = impactOf(graph, target);
  const touched = new Set([target, ...result.dependents.map(item => item.id)]);
  const routes = result.known ? (await extractRoutes(cwd, { sources: new Map(sources), resolve: await createResolver(cwd, graph.files, sources) })).filter(route => touched.has(route.file)) : [];
  // Files outside the import graph (configs, docs, assets) fall back to a bounded text search.
  const references = result.known ? [] : await findReferences(cwd, target);
  const payload = { path: target, inGraph: result.known, direct: result.direct, dependents: result.dependents, tests: result.tests, routes: routes.map(({ kind, method, path, file, line }) => ({ kind, method, path, file, line })), references, count: result.known ? result.dependents.length : references.length, truncated: !result.known && references.length === 40 };
  if (options.json) return output(JSON.stringify(payload, null, 2));
  if (!result.known) return output(`${brand()} / IMPACT\nTarget: ${target} (not a source file in the import graph)\nText references:\n${references.map(file => `- ${file}`).join('\n') || '- none found'}`);
  const production = result.dependents.filter(item => !item.test);
  output(`${brand()} / IMPACT\nTarget: ${target}\nDirect dependents: ${result.direct.length} · transitive: ${result.dependents.length} (${result.tests.length} test file(s))\n\n${production.slice(0, 30).map(item => `${'  '.repeat(Math.min(item.depth - 1, 4))}- ${item.id}${item.depth > 1 ? ` (depth ${item.depth})` : ''}`).join('\n') || 'No production file imports it.'}${production.length > 30 ? `\n… ${production.length - 30} more` : ''}\n\nEntry points affected: ${routes.length}\n${routes.slice(0, 20).map(route => `- ${route.method} ${route.path} (${route.file}:${route.line})`).join('\n') || '- none'}${routes.length > 20 ? `\n… ${routes.length - 20} more` : ''}\n\nTests to run:\n${result.tests.map(file => `- ${file}`).join('\n') || '- none import it; consider adding one'}`);
}

async function guardScope(cwd, slug, options = {}) {
  const { config, dir } = await getTask(cwd, slug);
  // The declared scope is every file the technical spec and the tasks say they will touch, new files included.
  const spec = await readText(join(dir, 'TECHSPEC.md')), graph = await loadGraph(dir);
  const [diff, noBaseline] = await Promise.all([gitDiff(cwd, options.against || 'HEAD'), lacksGitBaseline(cwd)]), changed = changedFilesFromDiff(diff);
  const expected = [...new Set(pathReferences([sectionBody(spec, 'File References'), sectionBody(spec, 'Impact'), ...graph.items.map(item => sectionBody(item.body, 'Files'))].join('\n'), { includeNew: true }))];
  const outsideScope = expected.length ? changed.filter(file => !expected.includes(file)) : [];
  const maxFiles = config.maxChangedFilesGuideline || 8;
  const findings = [noBaseline ? 'No git baseline: git tracks no file in this project, so its changes cannot be told apart. Commit the project (or run it from its own repository) before the task starts.' : null, changed.length > maxFiles ? `Change budget exceeded: ${changed.length}/${maxFiles} files.` : null, ...outsideScope.map(file => `Not in TECHSPEC.md File References or any task: ${file}`)].filter(Boolean);
  const report = join(dir, 'SCOPE-GUARD.md');
  await writeFile(report, `# Scope Guard — ${slug}\n\nChanged files: ${changed.length}\nExpected files: ${expected.length || 'not specified'}\n\n## Findings\n${findings.map(finding => `- ⚠ ${finding}`).join('\n') || '- Within configured scope guard.'}\n`);
  const payload = { ok: findings.length === 0, changed, expected, findings, path: rel(cwd, report) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / GUARD\n${payload.ok ? 'PASS' : 'WARN'} ${findings.length} finding(s)\nReport: ${payload.path}`);
  if (!payload.ok) throw new Error('scope guard requires human review');
}

async function readiness(cwd, slug, options = {}) {
  const { dir, preset } = await getTask(cwd, slug);
  const required = ['EVIDENCE.md', 'REVIEW-FINDINGS.md', 'SECURITY-REPORT.md', 'DEPENDENCY-REVIEW.md', 'SCOPE-GUARD.md'];
  if (preset.strict) required.push('CHECKPOINT.md');
  const available = [], missing = [];
  for (const file of required) (await exists(join(dir, file)) ? available : missing).push(file);
  const review = await exists(join(dir, 'REVIEW.md')) ? await readFile(join(dir, 'REVIEW.md'), 'utf8') : '';
  if (!/- \[[xX]\] (?:approve|approve with follow-up|request changes)/.test(review)) missing.push('Human decision in REVIEW.md');
  const ready = missing.length === 0, path = join(dir, 'MERGE-READINESS.md');
  await writeFile(path, `# Merge Readiness — ${slug}\n\nWorkflow: ${preset.name}\nStatus: ${ready ? 'READY FOR HUMAN MERGE DECISION' : 'NOT READY'}\n\n## Available gates\n${available.map(file => `- ✓ \`${file}\``).join('\n') || '- none'}\n\n## Outstanding gates\n${missing.map(file => `- ! ${file}`).join('\n') || '- none'}\n\nMaverick does not merge code. A human remains accountable for the final decision.\n`);
  const payload = { ready, available, missing, path: rel(cwd, path) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / READINESS\n${ready ? 'READY' : 'NOT READY'}\nOutstanding gates: ${missing.length}\nReport: ${payload.path}`);
  if (!ready) throw new Error('merge readiness gates are incomplete');
}

async function policy(cwd, action, slug, options = {}) {
  const dir = join(cwd, '.maverick'), path = join(dir, 'policy.json');
  if (action === 'init') {
    if (await exists(path)) throw new Error(`policy already exists: ${rel(cwd, path)}`);
    await mkdir(dir, { recursive: true }); await writeFile(path, await readFile(join(packageRoot, 'templates', 'policy.json'), 'utf8'));
    return output(`${brand()} / POLICY\n✓ policy created: ${rel(cwd, path)}`);
  }
  if (!await exists(path)) throw new Error('policy not found; run maverick policy init');
  const rules = await readJson(path);
  if (action === 'show') return output(options.json ? JSON.stringify(rules, null, 2) : `${brand()} / POLICY\n${pretty(rules)}`);
  if (action !== 'check') throw new Error('use policy init, policy show, or policy check <task>');
  const { dir: taskDir, preset } = await getTask(cwd, slug);
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || 'HEAD'));
  const sensitive = changed.filter(file => rules.sensitivePaths.some(prefix => file.includes(prefix)));
  const findings = [];
  if (changed.length > (rules.maxChangedFiles || Infinity)) findings.push(`Changed ${changed.length} files; policy maximum is ${rules.maxChangedFiles}.`);
  if (sensitive.length && preset.id !== rules.requiredWorkflowForSensitivePaths) findings.push(`Sensitive paths require the ${rules.requiredWorkflowForSensitivePaths} workflow: ${sensitive.join(', ')}.`);
  const report = join(taskDir, 'POLICY-CHECK.md');
  await writeFile(report, `# Policy Check — ${slug}\n\nPolicy: ${rel(cwd, path)}\n\n## Sensitive changed paths\n${sensitive.map(file => `- \`${file}\``).join('\n') || '- none'}\n\n## Findings\n${findings.map(finding => `- ⚠ ${finding}`).join('\n') || '- Policy satisfied.'}\n`);
  const payload = { ok: findings.length === 0, changed, sensitive, findings, path: rel(cwd, report) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / POLICY CHECK\n${payload.ok ? 'PASS' : 'WARN'} ${findings.length} finding(s)\nReport: ${payload.path}`);
  if (!payload.ok) throw new Error('policy check requires human review');
}

async function securityScan(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const diff = await gitDiff(cwd, options.against || 'HEAD');
  const rules = [
    { name: 'Private key material', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'Likely cloud/API secret assignment', pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"\s]{12,}/i },
    { name: 'Potentially unsafe dynamic execution', pattern: /(?:eval\(|child_process\.exec\(|shell:\s*true)/ }
  ];
  const findings = rules.filter(rule => rule.pattern.test(diff)).map(rule => rule.name), path = join(dir, 'SECURITY-REPORT.md');
  await writeFile(path, `# Security Scan — ${slug}\n\nBase: ${options.against || 'HEAD'}\n\n## Automated signals\n${findings.map(finding => `- ⚠ ${finding}`).join('\n') || '- No high-signal patterns found in the current diff.'}\n\n## Human checks\n- [ ] Authorization and trust boundaries reviewed\n- [ ] No secrets, PII, or production credentials added\n- [ ] New dependencies and network access reviewed\n`);
  const payload = { findings, path: rel(cwd, path) };
  output(options.json ? JSON.stringify(payload, null, 2) : `${brand()} / SECURITY\nSignals: ${findings.length}\nReport: ${payload.path}`);
  if (findings.length) throw new Error('security signals require human review');
}

async function dependencyReview(cwd, slug, options = {}) {
  const { dir } = await getTask(cwd, slug);
  const changed = changedFilesFromDiff(await gitDiff(cwd, options.against || 'HEAD'));
  const lockfiles = changed.filter(file => LOCKFILE.test(file)), manifests = changed.filter(file => MANIFEST.test(file));
  const path = join(dir, 'DEPENDENCY-REVIEW.md');
  await writeFile(path, `# Dependency Review — ${slug}\n\n## Changed manifests\n${manifests.map(file => `- \`${file}\``).join('\n') || '- none'}\n\n## Changed lockfiles\n${lockfiles.map(file => `- \`${file}\``).join('\n') || '- none'}\n\n## Human checks\n- [ ] New packages are necessary and maintained.\n- [ ] License and vulnerability impact were reviewed.\n- [ ] Lockfile changes match intended manifest changes.\n`);
  output(options.json ? JSON.stringify({ manifests, lockfiles, path: rel(cwd, path) }, null, 2) : `${brand()} / DEPENDENCIES\nManifests: ${manifests.length}; lockfiles: ${lockfiles.length}\nReport: ${rel(cwd, path)}`);
}

async function showReview(cwd, slug) {
  const { dir, config } = await getTask(cwd, slug), created = await ensureReview(dir, slug, config);
  output(`Review: ${rel(cwd, join(dir, 'REVIEW.md'))}${created ? ' (written from PRD.md and the tasks)' : ''}`);
}

export const gateCommands = [
  { id: 'checkpoint', description: 'Save current Git state and diff.', aliases: [], usage: 'checkpoint <task>', run: ({ cwd, arg, options }) => checkpoint(cwd, arg, options) },
  { id: 'impact', description: 'Find bounded project references to a file.', aliases: [], usage: 'impact <path>', run: ({ cwd, arg, options }) => impact(cwd, arg, options) },
  { id: 'guard', description: 'Compare changed files with declared task scope.', aliases: [], usage: 'guard <task>', run: ({ cwd, arg, options }) => guardScope(cwd, arg, options) },
  { id: 'readiness', description: 'Evaluate merge-readiness gates.', aliases: [], usage: 'readiness <task>', run: ({ cwd, arg, options }) => readiness(cwd, arg, options) },
  { id: 'policy', description: 'Initialize, show, or check repository policy.', aliases: [], usage: 'policy init|show|check <task>', run: ({ cwd, arg, third, options }) => policy(cwd, arg, third, options) },
  { id: 'verify', description: 'Run detected checks for any stack and save evidence.', aliases: [], usage: 'verify <task> [--json]', run: ({ cwd, arg, options }) => verifyTask(cwd, arg, options) },
  { id: 'security', description: 'Scan a changed diff for high-signal security risks.', aliases: [], usage: 'security <task>', run: ({ cwd, arg, options }) => securityScan(cwd, arg, options) },
  { id: 'deps', description: 'Report changed manifests and lockfiles.', aliases: [], usage: 'deps <task>', run: ({ cwd, arg, options }) => dependencyReview(cwd, arg, options) },
  { id: 'review', description: 'Show review or review a diff.', aliases: [], usage: 'review <task> --diff', run: ({ cwd, arg, options }) => (options.diff ? reviewDiff(cwd, arg, options) : showReview(cwd, arg)) }
];
