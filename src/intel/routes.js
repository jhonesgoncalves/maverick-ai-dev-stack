import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { languageForPath } from '../core/imports.js';
import { lineIndex, listFiles, posix, TEST_FILE } from './files.js';
import { blank } from './metrics.js';

// Entry points of an application, found statically in any stack: HTTP routes from code
// (decorators, annotations, attributes and router calls), file-system routing, contracts
// (OpenAPI, GraphQL SDL, protobuf) and non-HTTP entry points such as message consumers
// and scheduled jobs. Like the import graph it is a review aid: regex-based, dependency
// free, and explicit about what it found and where.

const MAX_BYTES = 512 * 1024;
const VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const VERB_SET = new Set(VERBS);
const EXTRA_FILES = /\.(vue|svelte|astro|mdx|graphql|gql|proto)$|(^|\/)[^/]*(openapi|swagger)[^/]*\.(ya?ml|json)$|(^|\/)(application|bootstrap)[^/]*\.(properties|ya?ml)$/i;

// ---------------------------------------------------------------------------
// Small parsing helpers

/** Index of the bracket closing the one at `open`, aware of string literals. */
export function balanced(text, open, limit = 4000) {
  const pairs = { '(': ')', '[': ']', '{': '}' }, stack = [pairs[text[open]]];
  let quote = null;
  for (let index = open + 1; index < text.length && index < open + limit; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return index; }
  }
  return -1;
}

/** String literals in source order ('…', "…", `…` and Python/C# prefixed forms). */
export function strings(text = '') {
  return [...text.matchAll(/(?:\b[rRfFbu@$]{1,2})?(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map(match => match[2]);
}

/** Value of a named argument (`key: 'v'`, `key = "v"`, `key => 'v'`, `key={"v"}`), as a list. */
export function named(text = '', key) {
  const match = text.match(new RegExp(`(?:^|[\\s,({])['"]?${key}['"]?\\s*(?::|=>|=)\\s*`));
  if (!match) return undefined;
  const start = match.index + match[0].length, char = text[start];
  if (char === '[' || char === '{' || char === '(') { const end = balanced(text, start); return strings(text.slice(start, end > 0 ? end : undefined)); }
  const literal = text.slice(start).match(/^(?:\b[rRfFbu@]{1,2})?(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/);
  if (literal) return [literal[2]];
  const bare = text.slice(start).match(/^[\w.:]+/);
  return bare ? [bare[0]] : [];
}

/** Splits `text` on top-level commas. */
function splitTop(text) {
  const parts = []; let depth = 0, quote = null, last = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === '\\') index++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && !depth) { parts.push(text.slice(last, index)); last = index + 1; }
  }
  parts.push(text.slice(last));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** Joins path segments into one normalised route path. */
export function joinPath(...parts) {
  const joined = parts.filter(part => part !== undefined && part !== null && part !== '').map(String).join('/');
  const path = `/${joined}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return path;
}

/** A comparable key for a path: parameters of every syntax become `{}`. */
export function pathKey(path) {
  return joinPath(path).toLowerCase()
    .replace(/\{[^}]*\}|:[\w]+\??|<[^>]*>|\[\[?\.{0,3}[^\]]*\]\]?|\$[\w]+|\*[\w]*/g, '{}');
}

const methodsIn = text => [...new Set([...String(text || '').toUpperCase().matchAll(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(match => match[1]))];

// ---------------------------------------------------------------------------
// Annotation scanning shared by decorator, annotation and attribute based frameworks

const MODIFIERS = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|#(?!\[)[^\n]*\n)*/;

/**
 * Finds annotation groups and the declaration each one decorates. `syntax` is `at`
 * (@Name(args): TS, Java, Kotlin, Python, Dart), `bracket` ([Name(args)]: C#) or `hash`
 * (#[name(args)]: Rust, PHP). Returns [{ annotations: [{ name, args }], target, index }].
 */
export function annotationGroups(text, syntax, inCode = () => true) {
  const found = [];
  const starter = syntax === 'at' ? /(^|[^\w@."'`])@([A-Za-z_][\w.]*)/g : syntax === 'hash' ? /()#\[/g : /(^|\n)[ \t]*\[(?=[A-Za-z])/g;
  for (const match of text.matchAll(starter)) {
    const at = match.index + match[1].length;
    if (!inCode(at + (text[at] === '[' || text[at] === '@' || text[at] === '#' ? 0 : text.slice(at).search(/\S/)))) continue;
    if (syntax === 'at') {
      let end = at + 1 + match[2].length, args = '';
      if (text[end] === '(') { const close = balanced(text, end); if (close < 0) continue; args = text.slice(end + 1, close); end = close + 1; }
      found.push({ at, end, items: [{ name: match[2], args }] });
    } else {
      const open = text.indexOf('[', at), close = balanced(text, open);
      if (close < 0) continue;
      const inner = text.slice(open + 1, close);
      if (syntax === 'bracket' && /^\s*(assembly|module)\s*:/.test(inner)) continue;
      const items = splitTop(inner).map(part => { const item = part.match(/^([A-Za-z_][\w.:]*)\s*(\(([\s\S]*)\))?\s*$/); return item && { name: item[1].replace(/Attribute$/, ''), args: item[3] || '' }; });
      if (items.every(Boolean)) found.push({ at, end: close + 1, items });
    }
  }
  const groups = [];
  for (const item of found) {
    const previous = groups[groups.length - 1];
    if (previous && /^\s*$/.test(text.slice(previous.end, item.at).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) { previous.annotations.push(...item.items); previous.end = item.end; }
    else groups.push({ index: item.at, end: item.end, annotations: [...item.items] });
  }
  for (const group of groups) {
    const rest = text.slice(group.end, group.end + 600).replace(MODIFIERS, '');
    const head = rest.slice(0, rest.search(/[({;=]|$/));
    const kind = head.match(/\b(class|interface|object|record|struct|trait|enum|impl)\s+([A-Za-z_]\w*)/);
    group.target = kind ? { kind: 'class', name: kind[2] } : { kind: 'member', name: head.match(/([A-Za-z_]\w*)\s*(?:<[^>]*>\s*)?$/)?.[1] || '' };
  }
  return groups;
}

const pathsOf = (args, keys = ['path', 'value']) => {
  for (const key of keys) { const value = named(args, key); if (value?.length) return value; }
  const first = splitTop(args)[0] || '';
  if (/^[[{]?\s*["'`]/.test(first)) return strings(first.startsWith('{') ? '' : first);
  return [];
};

// Annotation name → HTTP method for method-level route annotations.
const VERB_ANNOTATIONS = {
  ...Object.fromEntries(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head'].map(name => [name, name.toUpperCase()])), All: 'ANY', Any: 'ANY',
  ...Object.fromEntries(['Get', 'Post', 'Put', 'Patch', 'Delete'].map(name => [`${name}Mapping`, name.toUpperCase()])),
  ...Object.fromEntries(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'].map(name => [`Http${name}`, name.toUpperCase()]))
};
const JAXRS_VERBS = new Set(VERBS);
const GUARD_ANNOTATIONS = /^(UseGuards|Authorize|AllowAnonymous|PreAuthorize|PostAuthorize|Secured|RolesAllowed|PermitAll|DenyAll|Roles|Public|IsGranted|Security|login_required|permission_required|requires_auth|jwt_required|auth_required|UseInterceptors|UsePipes|UseFilters|Throttle|SkipThrottle|UseMiddleware)$/;
const ENTRY_ANNOTATIONS = {
  EventPattern: 'event', MessagePattern: 'event', KafkaListener: 'event', RabbitListener: 'event', RabbitSubscribe: 'event', JmsListener: 'event', SqsListener: 'event', SqsMessageHandler: 'event', StreamListener: 'event', ServiceBusListener: 'event', Processor: 'event', Process: 'event', OnEvent: 'event', EventHandler: 'event', EventsHandler: 'event', CommandHandler: 'event', QueryHandler: 'event',
  Cron: 'job', Interval: 'job', Timeout: 'job', Scheduled: 'job',
  SubscribeMessage: 'websocket', GrpcMethod: 'rpc', GrpcStreamMethod: 'rpc',
  QueryMapping: 'graphql', MutationMapping: 'graphql', SubscriptionMapping: 'graphql', SchemaMapping: 'graphql'
};

function annotationRoutes(file, language, text, settings) {
  const syntax = language === 'C#' ? 'bracket' : language === 'Rust' || language === 'PHP' ? 'hash' : 'at';
  if (!(syntax === 'at' ? text.includes('@') : syntax === 'hash' ? text.includes('#[') : /^\s*\[[A-Z]/m.test(text))) return [];
  const at = lineIndex(text), routes = [];
  let owner = { name: '', prefixes: [''], version: undefined, graphql: false, guards: [], framework: '' };
  const add = (route, group) => routes.push({ ...route, file, language, line: at(group.index), handler: [owner.name, group.target.name].filter(Boolean).join('.'), guards: [...(route.kind === 'http' ? owner.guards : []), ...guardsOf(group)] });
  const guardsOf = group => group.annotations.filter(item => GUARD_ANNOTATIONS.test(item.name.split('.').pop())).map(item => `${item.name}${item.args ? `(${item.args.replace(/\s+/g, ' ').slice(0, 60)})` : ''}`);
  for (const group of annotationGroups(text, syntax, settings.inCode)) {
    const names = group.annotations.map(item => item.name.split('.').pop());
    const find = (...wanted) => group.annotations.find(item => wanted.includes(item.name.split('.').pop()));
    if (group.target.kind === 'class') {
      const nest = find('Controller'), mapping = find('RequestMapping'), path = find('Path'), route = find('Route'), resolver = find('Resolver');
      const prefixes = nest ? pathsOf(nest.args) : mapping ? pathsOf(mapping.args) : path ? pathsOf(path.args) : route ? pathsOf(route.args) : [''];
      const version = nest ? named(nest.args, 'version')?.[0] : undefined;
      const framework = nest ? (language === 'TypeScript' || language === 'JavaScript' ? 'NestJS' : 'Micronaut') : mapping || find('RestController') ? 'Spring' : path ? 'JAX-RS' : route ? (language === 'C#' ? 'ASP.NET Core' : 'Symfony') : resolver ? 'GraphQL' : '';
      const base = group.target.name.replace(/Controller$/, '');
      owner = { name: group.target.name, prefixes: (prefixes.length ? prefixes : ['']).map(prefix => prefix.replace(/\[controller\]/gi, base)), version, graphql: Boolean(resolver), guards: guardsOf(group), framework, gateway: find('WebSocketGateway') };
      const entry = group.annotations.find(item => ENTRY_ANNOTATIONS[item.name.split('.').pop()] === 'event');
      if (entry) add({ kind: 'event', method: 'EVENT', path: strings(entry.args)[0] || named(entry.args, 'topics')?.join(', ') || entry.args.replace(/\s+/g, ' ').trim().slice(0, 60) || group.target.name, framework: entry.name.split('.').pop(), source: 'code' }, { ...group, target: { name: '' } });
      continue;
    }
    // Method-level: HTTP verbs first.
    const verb = group.annotations.find(item => VERB_ANNOTATIONS[item.name.split('.').pop()] && !(syntax === 'at' && language === 'Python'));
    const jaxrs = names.find(name => JAXRS_VERBS.has(name));
    const mapping = find('RequestMapping'), route = find('Route'), versionTag = find('Version');
    let methods = [], paths = [], framework = owner.framework;
    if (verb && syntax !== 'hash') { methods = [VERB_ANNOTATIONS[verb.name.split('.').pop()]]; paths = pathsOf(verb.args, ['path', 'value', 'template', 'uri']); if (!paths.length && route) paths = pathsOf(route.args, ['template', 'path']); framework ||= verb.name.startsWith('Http') ? 'ASP.NET Core' : verb.name.endsWith('Mapping') ? 'Spring' : 'NestJS'; }
    else if (mapping) { methods = methodsIn(mapping.args.match(/method\s*=\s*(\{[^}]*\}|[\w.]+)/)?.[1]); paths = pathsOf(mapping.args); framework ||= 'Spring'; }
    else if (jaxrs) { methods = [jaxrs]; paths = find('Path') ? pathsOf(find('Path').args) : ['']; framework ||= 'JAX-RS'; }
    else if (route && syntax !== 'hash') { methods = methodsIn(named(route.args, 'methods')?.join(' ')); paths = pathsOf(route.args, ['template', 'path']); framework ||= 'ASP.NET Core'; }
    else if (syntax === 'hash') {
      const rust = group.annotations.find(item => VERB_SET.has(item.name.toUpperCase()) || item.name === 'route');
      const symfony = find('Route');
      if (language === 'Rust' && rust) { methods = rust.name === 'route' ? methodsIn(named(rust.args, 'method')?.join(' ')) : [rust.name.toUpperCase()]; paths = strings(rust.args).slice(0, 1); framework = /rocket/.test(settings.rustDeps) ? 'Rocket' : 'Actix Web'; }
      else if (language === 'PHP' && symfony) { methods = methodsIn(named(symfony.args, 'methods')?.join(' ')); paths = pathsOf(symfony.args, ['path']); framework = 'Symfony'; }
    } else if (language === 'Python') {
      const decorator = group.annotations.find(item => /^[\w.]+\.(get|post|put|patch|delete|options|head|route|api_route|websocket|api_view)$/.test(item.name));
      const task = group.annotations.find(item => /(^|\.)(task|shared_task|periodic_task|actor)$/.test(item.name));
      if (decorator) {
        const [receiver, kind] = [decorator.name.split('.').slice(0, -1).join('.'), decorator.name.split('.').pop()];
        const first = strings(splitTop(decorator.args)[0] || '')[0];
        if (first !== undefined && (first.startsWith('/') || first === '')) {
          methods = kind === 'route' || kind === 'api_route' ? (methodsIn(named(decorator.args, 'methods')?.join(' ')).length ? methodsIn(named(decorator.args, 'methods').join(' ')) : ['GET']) : kind === 'websocket' ? ['WS'] : [kind.toUpperCase()];
          paths = [joinPath(settings.pythonPrefixes?.get(receiver) || '', first)];
          framework = /Blueprint|flask/i.test(text) ? 'Flask' : /fastapi|APIRouter/i.test(text) ? 'FastAPI' : /sanic/i.test(text) ? 'Sanic' : /litestar|starlite/i.test(text) ? 'Litestar' : 'Python web';
          for (const path of paths) for (const method of methods) add({ kind: method === 'WS' ? 'websocket' : 'http', method, path, framework, source: 'code' }, group);
          continue;
        }
      }
      if (task) { add({ kind: 'job', method: 'TASK', path: group.target.name, framework: /celery/i.test(text) ? 'Celery' : 'Task queue', source: 'code' }, group); continue; }
      continue;
    } else if (language === 'Dart') {
      const shelf = group.annotations.find(item => /^Route\.(get|post|put|patch|delete|head|options|all)$/.test(item.name));
      if (shelf) { const method = shelf.name.split('.').pop().toUpperCase(); methods = [method === 'ALL' ? 'ANY' : method]; paths = strings(shelf.args).slice(0, 1); framework = 'shelf_router'; }
    }
    if (methods.length || paths.length) {
      if (!methods.length) methods = ['ANY'];
      if (!paths.length) paths = [''];
      const version = versionTag ? pathsOf(versionTag.args)[0] ?? named(versionTag.args, 'value')?.[0] : owner.version;
      for (const prefix of owner.prefixes) for (const raw of paths) for (const method of methods) {
        const own = String(raw).replace(/\[action\]/gi, group.target.name);
        // ASP.NET templates starting with "/" or "~/" ignore the controller route.
        const absolute = framework === 'ASP.NET Core' && /^~?\//.test(own);
        add({ kind: 'http', method, path: settings.compose({ language, framework, prefix: absolute ? '' : prefix, path: own.replace(/^~/, ''), version, file }), framework: framework || 'annotations', source: 'code', ...(version && { version: String(version) }) }, group);
      }
      continue;
    }
    // Non-HTTP entry points.
    for (const item of group.annotations) {
      const name = item.name.split('.').pop(), kind = ENTRY_ANNOTATIONS[name] || (owner.graphql && /^(Query|Mutation|Subscription|ResolveField)$/.test(name) ? 'graphql' : null);
      if (!kind) continue;
      const label = kind === 'graphql' ? (named(item.args, 'name')?.[0] || group.target.name) : kind === 'job' ? (named(item.args, 'cron')?.[0] || named(item.args, 'fixedRate')?.[0] || named(item.args, 'fixedDelay')?.[0] || strings(item.args)[0] || item.args.trim() || group.target.name) : (named(item.args, 'topics')?.join(', ') || named(item.args, 'queues')?.join(', ') || named(item.args, 'destination')?.[0] || named(item.args, 'queue')?.[0] || named(item.args, 'value')?.[0] || strings(item.args)[0] || item.args.replace(/\s+/g, ' ').trim().slice(0, 60) || group.target.name);
      const method = { event: 'EVENT', job: 'CRON', websocket: 'WS', rpc: 'RPC', graphql: name === 'Mutation' || name === 'MutationMapping' ? 'MUTATION' : name.startsWith('Subscription') ? 'SUBSCRIPTION' : 'QUERY' }[kind];
      add({ kind, method, path: kind === 'websocket' && owner.gateway ? `${named(owner.gateway.args, 'namespace')?.[0] || ''} ${label}`.trim() : label, framework: name, source: 'code' }, group);
      break;
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Router calls: Express, Fastify, Koa, Hono, Go, Laravel, Slim, Vapor, ASP.NET minimal APIs…

const JS_SERVER = /['"](express|fastify|koa|@koa\/router|koa-router|hono|hono\/[\w-]+|elysia|restify|polka|h3|@hapi\/hapi|itty-router|express-promise-router|@fastify\/[\w-]+|next-connect|@trpc\/server)['"]/;
const JS_CLIENT_RECEIVER = /^(axios|http|https|request|client|api|\$http|ky|got|superagent|fetch|agent|instance|httpClient|this|supertest|cy|page|test|it|describe|map|cache|params|headers|searchParams|formData|store|storage|localStorage|sessionStorage|redis|config|env|settings|res|req|ctx|c|reply|response|window|document|location|url|history|cookies|session|queryClient|router\.query)$/;
const GO_CLIENT_RECEIVER = /^(http|client|resty|req|request|c|ctx|w|r\.URL|url|values|header|headers|q|query)$/;

function callRoutes(file, language, text, settings) {
  const at = lineIndex(text), routes = [], prefixes = new Map();
  const add = (index, method, path, framework, extra = {}) => { if (settings.inCode(index)) routes.push({ kind: 'http', method, path, framework, source: 'code', file, language, line: at(index), ...extra }); };
  const prefixOf = receiver => prefixes.get(receiver) || '';
  if (language === 'JavaScript' || language === 'TypeScript') {
    const server = JS_SERVER.test(text);
    for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:[\w$]+\.)?(Router|Hono|Elysia)\s*\(\s*(\{[^}]*\})?\s*\)\s*(?:\.basePath\(\s*['"`]([^'"`]+)['"`]\s*\))?/g)) prefixes.set(match[1], named(match[3] || '', 'prefix')?.[0] || match[4] || '');
    for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.basePath\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[3]));
    const framework = /['"]fastify['"]/.test(text) ? 'Fastify' : /['"]hono/.test(text) ? 'Hono' : /koa/.test(text) ? 'Koa' : /['"]elysia['"]/.test(text) ? 'Elysia' : /['"]express/.test(text) ? 'Express' : 'Node router';
    const localRouters = new Set([...text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:[\w$]+\.)?Router\s*\(/g)].map(match => match[1]));
    for (const match of text.matchAll(/(?<![\w$.])(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|del|options|head|all)\s*\(\s*(['"`])(\/[^'"`]*|\*)\3\s*,/g)) {
      const receiver = match[1];
      if (JS_CLIENT_RECEIVER.test(receiver) && !prefixes.has(receiver) && !localRouters.has(receiver)) continue;
      if (!server && !prefixes.has(receiver) && !localRouters.has(receiver) && !/^(app|router|server|routes?|fastify|v\d+|\w+Router|\w+Routes|subApp|admin)$/.test(receiver)) continue;
      const open = text.indexOf('(', match.index + match[0].indexOf(match[2]) + match[2].length), close = balanced(text, open);
      const handlers = splitTop(text.slice(open + 1, close > 0 ? close : open + 400)).slice(1);
      const guards = handlers.slice(0, -1).filter(item => /^[A-Za-z_$][\w$.]*(\([^)]{0,80}\))?$/.test(item)).map(item => item.replace(/\s+/g, ' '));
      const handler = handlers[handlers.length - 1]?.match(/^[A-Za-z_$][\w$.]*$/)?.[0];
      const method = match[2] === 'del' ? 'DELETE' : match[2] === 'all' ? 'ANY' : match[2].toUpperCase();
      add(match.index, method, joinPath(prefixOf(receiver), match[4]), framework, { receiver, ...(handler && { handler }), guards });
    }
    // router.route('/x').get(h).post(h)
    for (const match of text.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*route\(\s*(['"`])(\/[^'"`]*)\2\s*\)((?:\s*\.\s*(?:get|post|put|patch|delete|all)\s*\([^;]*?\))+)/g)) {
      for (const method of match[4].matchAll(/\.\s*(get|post|put|patch|delete|all)\s*\(/g)) add(match.index, method[1] === 'all' ? 'ANY' : method[1].toUpperCase(), joinPath(prefixOf(match[1]), match[3]), framework, { receiver: match[1] });
    }
    // fastify.route({ method, url }) and hapi server.route({ method, path })
    for (const match of text.matchAll(/\.\s*route\(\s*\{/g)) {
      const open = match.index + match[0].length - 1, close = balanced(text, open), body = text.slice(open, close);
      const url = named(body, 'url')?.[0] ?? named(body, 'path')?.[0];
      if (url === undefined || !url.startsWith('/')) continue;
      for (const method of methodsIn(named(body, 'method')?.join(' ')) || []) add(match.index, method, url, /hapi/.test(text) ? 'hapi' : 'Fastify');
    }
    // Mounts: app.use('/api', auth, usersRouter), app.route('/x', sub), fastify.register(plugin, { prefix })
    for (const match of text.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\.\s*(use|route)\(\s*(['"`])(\/[^'"`]*)\3\s*,/g)) {
      const open = text.indexOf('(', match.index), close = balanced(text, open);
      const args = splitTop(text.slice(open + 1, close)).slice(1);
      for (const arg of args) {
        if (localRouters.has(arg)) { for (const route of routes) if (route.receiver === arg && !route.mounted) { route.path = joinPath(prefixOf(match[1]), match[4], route.path); route.mounted = true; } }
        else settings.mount(file, language, arg, joinPath(prefixOf(match[1]), match[4]));
      }
    }
    for (const match of text.matchAll(/\.\s*register\(\s*([^,()]+(?:\([^)]*\))?)\s*,\s*\{[^}]*prefix\s*:\s*['"`]([^'"`]+)['"`]/g)) settings.mount(file, language, match[1].trim(), match[2]);
    // Plain Node servers: `url.pathname === '/api/x'`, optionally guarded by `req.method === 'POST'`.
    if (/createServer|IncomingMessage|ServerResponse/.test(text)) {
      for (const match of text.matchAll(/\b(?:[\w$]+\.)*(?:url|pathname|path)\s*(===?|\.startsWith\()\s*(['"`])(\/[^'"`]*)\2/g)) {
        const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? undefined : text.indexOf('\n', match.index));
        const method = line.match(/method\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)['"`]/)?.[1] || 'ANY';
        add(match.index, method, match[1] === '===' || match[1] === '==' ? match[3] : `${match[3].replace(/\/$/, '')}/*`, 'Node http');
      }
    }
    // React Router / Vue Router / Angular client routes.
    for (const match of text.matchAll(/<Route\b[^>]*?\bpath=["'{`]+([^"'`}]+)/g)) add(match.index, 'PAGE', match[1].startsWith('/') ? match[1] : `/${match[1]}`, 'React Router', { kind: 'page' });
    if (/(createBrowserRouter|createRouter|RouterModule|Routes\b|createHashRouter|VueRouter)/.test(text)) {
      for (const match of text.matchAll(/\{\s*path\s*:\s*(['"`])([^'"`]*)\1\s*,[^{}]{0,200}?\b(component|element|loadComponent|loadChildren|redirectTo|lazy|Component|children)\b/g)) add(match.index, 'PAGE', joinPath(match[2]), /RouterModule|@angular/.test(text) ? 'Angular Router' : /vue-router|VueRouter/.test(text) ? 'Vue Router' : 'React Router', { kind: 'page' });
    }
  }
  if (language === 'Go') {
    for (const match of text.matchAll(/\b(\w+)\s*:?=\s*(\w+)\.(Group|PathPrefix|Route)\(\s*"([^"]*)"\s*(?:,[^)]*)?\)(\.Subrouter\(\))?/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[4]));
    const framework = /gin-gonic/.test(text) ? 'Gin' : /labstack\/echo/.test(text) ? 'Echo' : /gofiber/.test(text) ? 'Fiber' : /go-chi/.test(text) ? 'chi' : /gorilla\/mux/.test(text) ? 'gorilla/mux' : 'net/http';
    for (const match of text.matchAll(/\b([\w.]+)\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All|Handle|HandleFunc|Match)\(\s*"([^"]+)"/g)) {
      const [receiver, call, raw] = [match[1], match[2], match[3]];
      if (GO_CLIENT_RECEIVER.test(receiver) && !(receiver === 'http' && /^Handle/.test(call))) continue;
      let methods = /^(Any|All|Match)$/.test(call) ? ['ANY'] : /^Handle/.test(call) ? [] : [call.toUpperCase()], path = raw;
      const pattern = raw.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/);
      if (pattern) { methods = [pattern[1]]; path = pattern[2].replace(/^[^/]*(?=\/)/, ''); }
      if (!path.startsWith('/')) continue;
      if (!methods.length) { const chain = text.slice(match.index, match.index + 300).split('\n')[0]; methods = methodsIn(chain.match(/\.Methods\(([^)]*)\)/)?.[1]); if (!methods.length) methods = ['ANY']; }
      for (const method of methods) add(match.index, method, joinPath(prefixOf(receiver), path), framework, { receiver });
    }
  }
  if (language === 'Rust') {
    for (const match of text.matchAll(/\.route\(\s*"([^"]+)"\s*,/g)) {
      const open = text.indexOf('(', match.index), close = balanced(text, open), body = text.slice(open, close);
      const methods = [...new Set([...body.matchAll(/\b(?:web::|routing::|axum::routing::)?(get|post|put|patch|delete|head|options|any)\s*\(/g)].map(item => item[1] === 'any' ? 'ANY' : item[1].toUpperCase()))];
      for (const method of methods.length ? methods : ['ANY']) add(match.index, method, match[1], /axum/.test(text) ? 'Axum' : 'Actix Web');
    }
  }
  if (language === 'C#') {
    for (const match of text.matchAll(/\b(\w+)\s*=\s*(\w+)\.MapGroup\(\s*"([^"]*)"\s*\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), match[3]));
    for (const match of text.matchAll(/\b(\w+)\.Map(Get|Post|Put|Patch|Delete|Methods|Fallback)?\(\s*"([^"]*)"/g)) {
      if (!match[2] && !/^(app|group|api|routes|endpoints|\w+Group)$/i.test(match[1]) && !prefixes.has(match[1])) continue;
      const methods = match[2] === 'Methods' ? methodsIn(text.slice(match.index, match.index + 200).split('\n')[0]) : [match[2] && match[2] !== 'Fallback' ? match[2].toUpperCase() : 'ANY'];
      for (const method of methods.length ? methods : ['ANY']) add(match.index, method, joinPath(prefixOf(match[1]), match[3]), 'ASP.NET Core minimal API');
    }
  }
  if (language === 'Kotlin' && /routing\s*\{|Route\.|fun Route\./.test(text)) routes.push(...blockRoutes(file, language, text, { open: /\b(route|get|post|put|patch|delete|head|options)\s*\(\s*"([^"]*)"\s*\)\s*\{/g, framework: 'Ktor' }));
  if (language === 'PHP') {
    const base = /(^|\/)routes\/api\.php$/.test(file) ? '/api' : '';
    routes.push(...blockRoutes(file, language, text, { php: true, base }));
    for (const match of text.matchAll(/\$(\w+)->(get|post|put|patch|delete|options|any|map)\(\s*['"](\/[^'"]*)['"]/g)) if (match[1] !== 'this' && match[1] !== 'request' && match[1] !== 'client' && match[1] !== 'http') add(match.index, match[2] === 'any' || match[2] === 'map' ? 'ANY' : match[2].toUpperCase(), match[3], 'Slim');
  }
  if (language === 'Swift' && /import Vapor/.test(text)) {
    for (const match of text.matchAll(/\b(?:let|var)\s+(\w+)\s*=\s*(\w+)\.grouped\(([^)]*)\)/g)) prefixes.set(match[1], joinPath(prefixOf(match[2]), ...strings(match[3])));
    for (const match of text.matchAll(/\b(\w+)\.(get|post|put|patch|delete|on)\(((?:\s*"[^"]*"\s*,?|\s*":\w+"\s*,?|\s*\.?\w+\s*,?)*?)(?:\s*use\s*:|\s*\)\s*\{|\s*\{)/g)) add(match.index, match[2] === 'on' ? 'ANY' : match[2].toUpperCase(), joinPath(prefixOf(match[1]), ...strings(match[3])), 'Vapor');
  }
  if (language === 'Dart') {
    for (const match of text.matchAll(/\b(\w+)\.(get|post|put|patch|delete|head|options|all)\(\s*['"](\/[^'"]*)['"]\s*,/g)) if (!/^(http|client|dio|_dio|api|request)$/.test(match[1])) add(match.index, match[2] === 'all' ? 'ANY' : match[2].toUpperCase(), match[3], 'shelf_router');
  }
  if (language === 'Python') {
    for (const match of text.matchAll(/\b(\w+)\s*=\s*(?:[\w.]+\.)?(APIRouter|Blueprint|Router)\(([^)]*)\)/g)) settings.pythonPrefixes.set(match[1], named(match[3], 'prefix')?.[0] || named(match[3], 'url_prefix')?.[0] || '');
    if (/(^|\/)urls\.py$/.test(file) || /urlpatterns/.test(text)) {
      for (const match of text.matchAll(/\b(re_path|path|url)\(\s*r?(['"])([^'"]*)\2\s*,\s*([^,)]+(?:\([^)]*\))?)/g)) {
        const raw = match[1] === 'path' ? match[3] : match[3].replace(/^\^/, '').replace(/\$$/, '');
        const include = match[4].match(/include\(\s*(?:\(\s*)?['"]([\w.]+)['"]/);
        if (include) { settings.mount(file, 'Python', `module:${include[1]}`, raw); continue; }
        add(match.index, 'ANY', joinPath(raw.replace(/<(?:\w+:)?(\w+)>/g, ':$1')), 'Django', { handler: match[4].trim().replace(/\.as_view\(\)$/, '') });
      }
    }
    for (const match of text.matchAll(/\b(\w+)\.include_router\(\s*([\w.]+)\s*(?:,([^)]*))?\)/g)) settings.mount(file, 'Python', match[2].split('.')[0], joinPath(settings.pythonPrefixes.get(match[1]) || '', named(match[3] || '', 'prefix')?.[0] || ''));
    for (const match of text.matchAll(/\b(\w+)\.register_blueprint\(\s*([\w.]+)\s*(?:,([^)]*))?\)/g)) settings.mount(file, 'Python', match[2].split('.')[0], named(match[3] || '', 'url_prefix')?.[0] || '');
    for (const match of text.matchAll(/\bweb\.(get|post|put|patch|delete|route)\(\s*['"](\/[^'"]*)['"]/g)) add(match.index, match[1] === 'route' ? 'ANY' : match[1].toUpperCase(), match[2], 'aiohttp');
  }
  if (language === 'Ruby') routes.push(...blockRoutes(file, language, text, { ruby: true, rails: /(^|\/)config\/routes\.rb$/.test(file) || /routes\.draw/.test(text) }));
  if (language === 'Elixir' && /\b(Phoenix\.Router|Plug\.Router|use \w+Web, :router)\b/.test(text)) routes.push(...blockRoutes(file, language, text, { ruby: true, phoenix: true }));
  return routes;
}

const REST_ACTIONS = [['index', 'GET', ''], ['create', 'POST', ''], ['new', 'GET', '/new'], ['show', 'GET', '/:id'], ['edit', 'GET', '/:id/edit'], ['update', 'PATCH', '/:id'], ['destroy', 'DELETE', '/:id']];

/** Routes declared inside nested blocks: Rails, Sinatra and Phoenix (do/end), Ktor and Laravel/Slim (braces). */
function blockRoutes(file, language, text, options) {
  const at = lineIndex(text), routes = [], stack = [{ prefix: options.base || '', resource: null }];
  const add = (index, method, path, framework, extra = {}) => routes.push({ kind: extra.kind || 'http', method, path: joinPath(stack[stack.length - 1].prefix, path), framework, source: 'code', file, language, line: at(index), ...(extra.handler && { handler: extra.handler }) });
  const lines = text.split('\n');
  let offset = 0;
  if (options.ruby) {
    const framework = options.phoenix ? 'Phoenix' : options.rails ? 'Rails' : 'Sinatra';
    for (const line of lines) {
      const code = line.replace(/(^|\s)#(?!\{).*$/, '').trim(), index = offset;
      offset += line.length + 1;
      if (!code) continue;
      const opens = /\bdo(\s*\|[^|]*\|)?\s*$/.test(code) || /^(if|unless|case|def|class|module|begin|while|until|for|defmodule|defp?)\b/.test(code) && !/\bend$/.test(code) && !/,\s*do:/.test(code);
      let frame = null;
      const verb = code.match(/^(get|post|put|patch|delete|match|options|head|live|forward)\s*\(?\s*['":]([^'",\s]*)['"]?\s*(?:,\s*(.*?))?\s*(?:\bdo)?\s*$/);
      const resources = code.match(/^(resources|resource)\s*\(?\s*[:'"]([\w/]+)['"]?\s*(.*)$/);
      const scope = code.match(/^(namespace|scope)\s*\(?\s*(?:path:\s*)?[:'"]([\w/.-]*)['"]?/);
      const root = code.match(/^root\b\s*\(?\s*(?:to:\s*)?['"]([^'"]+)['"]/);
      if (options.rails || options.phoenix) {
        if (scope) frame = { prefix: joinPath(stack[stack.length - 1].prefix, scope[2]) };
        else if (/^member\s+do/.test(code) && stack[stack.length - 1].resource) frame = { prefix: joinPath(stack[stack.length - 1].prefix, ':id') };
        else if (/^collection\s+do/.test(code)) frame = { prefix: stack[stack.length - 1].prefix };
        else if (resources) {
          const singular = resources[1] === 'resource', name = resources[2], rest = resources[3] || '';
          const symbols = key => [...(rest.match(new RegExp(`${key}:\\s*(\\[[^\\]]*\\]|:\\w+)`))?.[1] || '').matchAll(/:(\w+)/g)].map(item => item[1]);
          const pick = symbols('only'), skip = symbols('except');
          for (const [action, method, suffix] of REST_ACTIONS) {
            if (singular && action === 'index') continue;
            if ((pick.length && !pick.includes(action)) || skip.includes(action)) continue;
            add(index, method, `${name.startsWith('/') ? name : `/${name}`}${singular ? suffix.replace('/:id', '') : suffix}`, framework, { handler: `${name}#${action}` });
          }
          if (opens) frame = { prefix: joinPath(stack[stack.length - 1].prefix, name, singular ? '' : `:${name.replace(/s$/, '')}_id`), resource: name };
        } else if (root && options.rails) add(index, 'GET', '/', framework, { handler: root[1] });
        else if (verb) {
          const [, method, path, rest = ''] = verb;
          const handler = named(rest, 'to')?.[0] || strings(rest)[0] || rest.split(',').slice(0, 2).map(part => part.trim().replace(/^:/, '')).join('.');
          const kind = method === 'live' ? 'page' : 'http';
          const methods = method === 'match' ? (methodsIn(named(rest, 'via')?.join(' ') || rest).length ? methodsIn(named(rest, 'via')?.join(' ') || rest) : ['ANY']) : [method === 'live' ? 'PAGE' : method === 'forward' ? 'ANY' : method.toUpperCase()];
          for (const item of methods) add(index, item, path, framework, { handler, kind });
        }
      } else if (verb && /\bdo\b/.test(code)) add(index, verb[1].toUpperCase(), verb[2], framework);
      if (opens) stack.push(frame || { ...stack[stack.length - 1], opener: true });
      else if (/^end\b/.test(code) && stack.length > 1) stack.pop();
    }
    return routes;
  }
  // Brace languages: track `{` depth and push prefixes on route groups.
  const pending = [], depthPrefix = [{ depth: 0, prefix: stack[0].prefix }];
  let depth = 0;
  const current = () => depthPrefix[depthPrefix.length - 1].prefix;
  const scanner = options.php
    ? /Route::(get|post|put|patch|delete|options|any|match|resource|apiResource|prefix|group)\s*\(\s*(\[[^\]]*\]|['"][^'"]*['"])?|->(prefix)\(\s*['"]([^'"]*)['"]\s*\)|\$\w+->group\(\s*['"]([^'"]*)['"]|[{}]/g
    : new RegExp(`${options.open.source}|[{}]`, 'g');
  for (const match of text.matchAll(scanner)) {
    const token = match[0];
    if (token === '{') { depth++; if (pending.length) depthPrefix.push({ depth, prefix: pending.pop() }); continue; }
    if (token === '}') { if (depthPrefix.length > 1 && depthPrefix[depthPrefix.length - 1].depth === depth) depthPrefix.pop(); depth--; continue; }
    if (options.php) {
      const call = match[1], arg = match[2];
      if (match[3]) { pending.push(joinPath(current(), match[4])); continue; }
      if (match[5] !== undefined) { pending.push(joinPath(current(), match[5])); continue; }
      if (call === 'prefix') { pending.push(joinPath(current(), strings(arg || '')[0] || '')); continue; }
      if (call === 'group') { const prefix = named(text.slice(match.index, match.index + 300), 'prefix')?.[0]; pending.push(joinPath(current(), prefix || '')); continue; }
      const path = strings(arg || '')[0];
      if (path === undefined) continue;
      if (call === 'resource' || call === 'apiResource') { for (const [action, method, suffix] of REST_ACTIONS) if (call === 'resource' || !['new', 'edit'].includes(action)) routes.push({ kind: 'http', method, path: joinPath(current(), path, suffix.replace('/:id', `/{${path.replace(/s$/, '')}}`)), framework: 'Laravel', source: 'code', file, language, line: at(match.index), handler: `${path}.${action === 'new' ? 'create' : action === 'destroy' ? 'destroy' : action}` }); continue; }
      const methods = call === 'match' ? methodsIn(arg) : [call === 'any' ? 'ANY' : call.toUpperCase()];
      const target = call === 'match' ? strings(text.slice(match.index + match[0].length, match.index + match[0].length + 200))[0] : path;
      for (const method of methods) routes.push({ kind: 'http', method, path: joinPath(current(), target), framework: 'Laravel', source: 'code', file, language, line: at(match.index) });
      continue;
    }
    // The opening regex consumed this block's `{`.
    const [call, path] = [match[1], match[2]];
    depth++;
    if (call !== 'route') routes.push({ kind: 'http', method: call.toUpperCase(), path: joinPath(current(), path), framework: options.framework, source: 'code', file, language, line: at(match.index) });
    depthPrefix.push({ depth, prefix: joinPath(current(), path) });
  }
  return routes;
}

// ---------------------------------------------------------------------------
// File-system routing

const segment = (part, style) => {
  if (/^\(.*\)$/.test(part) || part.startsWith('@') || part === '_index' || part === 'index') return '';
  if (style === 'remix') return part.replace(/^\$$/, '*').replace(/^\(\$(\w+)\)$/, ':$1?').replace(/^\$(\w+)$/, ':$1').replace(/^_.*/, '');
  return part.replace(/^\[\[\.\.\.(\w+)\]\]$/, '*$1?').replace(/^\[\.\.\.(\w+)\]$/, '*$1').replace(/^\[(\w+)\]$/, ':$1').replace(/^\[\[(\w+)\]\]$/, ':$1?');
};
const fsPath = (parts, style) => joinPath(...parts.map(part => segment(part, style)));

function fileSystemRoutes(files, sources) {
  const routes = [], has = pattern => files.some(file => pattern.test(file));
  const exported = file => { const text = sources.get(file) || ''; const found = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)].map(match => match[1]); return found.length ? [...new Set(found)] : ['ANY']; };
  const push = (file, method, path, framework, kind = 'http') => routes.push({ kind, method, path, framework, source: 'filesystem', file, language: languageForPath(file) || file.split('.').pop(), line: 1 });
  const rootsWith = config => files.filter(file => config.test(file)).map(file => posix(dirname(file))).map(dir => (dir === '.' ? '' : `${dir}/`));
  for (const base of rootsWith(/(^|\/)next\.config\.(js|mjs|cjs|ts)$/)) {
    for (const file of files.filter(item => item.startsWith(base))) {
      const rest = file.slice(base.length), app = rest.match(/^(?:src\/)?app\/(.*?)(?:^|\/)?(page|route)\.(tsx|ts|jsx|js|mdx)$/), pages = rest.match(/^(?:src\/)?pages\/(.+)\.(tsx|ts|jsx|js|mdx)$/);
      if (app) { const parts = app[1].split('/').filter(Boolean); if (app[2] === 'page') push(file, 'PAGE', fsPath(parts), 'Next.js', 'page'); else for (const method of exported(file)) push(file, method, fsPath(parts), 'Next.js'); }
      else if (pages && !/(^|\/)_(app|document|error)$/.test(pages[1])) { const parts = pages[1].split('/'); if (parts[0] === 'api') push(file, 'ANY', fsPath(parts), 'Next.js'); else push(file, 'PAGE', fsPath(parts), 'Next.js', 'page'); }
    }
  }
  for (const base of rootsWith(/(^|\/)nuxt\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter(item => item.startsWith(base))) {
      const rest = file.slice(base.length), page = rest.match(/^(?:app\/)?pages\/(.+)\.vue$/), api = rest.match(/^server\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete))?\.(ts|js)$/);
      if (page) push(file, 'PAGE', fsPath(page[1].split('/')), 'Nuxt', 'page');
      if (api) push(file, api[3]?.toUpperCase() || 'ANY', fsPath([api[1] === 'api' ? 'api' : '', ...api[2].split('/')]), 'Nuxt');
    }
  }
  for (const base of rootsWith(/(^|\/)svelte\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter(item => item.startsWith(`${base}src/routes/`))) {
      const rest = file.slice(`${base}src/routes/`.length), parts = rest.split('/'), name = parts.pop();
      if (/^\+page\.svelte$/.test(name)) push(file, 'PAGE', fsPath(parts), 'SvelteKit', 'page');
      if (/^\+server\.(ts|js)$/.test(name)) for (const method of exported(file)) push(file, method, fsPath(parts), 'SvelteKit');
    }
  }
  for (const base of rootsWith(/(^|\/)astro\.config\.(js|mjs|ts)$/)) {
    for (const file of files.filter(item => item.startsWith(`${base}src/pages/`))) {
      const rest = file.slice(`${base}src/pages/`.length).replace(/\.(astro|md|mdx|ts|js|html)$/, '');
      if (/\.(ts|js)$/.test(file)) for (const method of exported(file)) push(file, method, fsPath(rest.split('/')), 'Astro');
      else push(file, 'PAGE', fsPath(rest.split('/')), 'Astro', 'page');
    }
  }
  if (has(/(^|\/)app\/root\.(tsx|jsx)$/) && has(/(^|\/)app\/routes\//)) {
    for (const file of files.filter(item => /(^|\/)app\/routes\/[^/]+\.(tsx|ts|jsx|js)$|(^|\/)app\/routes\/[^/]+\/route\.(tsx|ts|jsx|js)$/.test(item))) {
      const name = file.replace(/^.*app\/routes\//, '').replace(/\/route\.(tsx|ts|jsx|js)$/, '').replace(/\.(tsx|ts|jsx|js)$/, '');
      push(file, 'PAGE', fsPath(name.split('.').map(part => part.replace(/_$/, '')), 'remix'), 'Remix / React Router', 'page');
    }
  }
  if (has(/(^|\/)pubspec\.yaml$/) && has(/(^|\/)routes\/.*\.dart$/)) {
    for (const file of files.filter(item => /^routes\/.*\.dart$/.test(item) && !/_middleware\.dart$/.test(item))) push(file, 'ANY', fsPath(file.slice(7).replace(/\.dart$/, '').split('/')), 'Dart Frog');
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Contracts: OpenAPI / Swagger, GraphQL SDL, protobuf services

function contractRoutes(file, text) {
  const routes = [], at = lineIndex(text);
  const push = (route, index = 0) => routes.push({ source: 'contract', file, language: file.split('.').pop(), line: at(index), ...route });
  if (/\.(ya?ml|json)$/i.test(file) && /["']?(openapi|swagger)["']?\s*:/.test(text)) {
    let spec;
    try { spec = file.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch { return []; }
    const base = spec?.basePath || (spec?.servers?.[0]?.url || '').replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/\{[^}]+\}/g, '');
    for (const [path, operations] of Object.entries(spec?.paths || {})) {
      for (const [method, operation] of Object.entries(operations || {})) {
        if (!VERB_SET.has(method.toUpperCase())) continue;
        const index = text.indexOf(path);
        push({ kind: 'http', method: method.toUpperCase(), path: joinPath(path), basePath: base || undefined, framework: spec.openapi ? `OpenAPI ${spec.openapi}` : `Swagger ${spec.swagger}`, handler: operation?.operationId, summary: operation?.summary, guards: operation?.security || spec.security ? ['security'] : [] }, Math.max(0, index));
      }
    }
  }
  if (/\.(graphql|gql)$/i.test(file)) {
    for (const match of text.matchAll(/(?:extend\s+)?type\s+(Query|Mutation|Subscription)\s*\{/g)) {
      const open = match.index + match[0].length - 1, close = balanced(text, open), body = text.slice(open + 1, close);
      for (const field of body.matchAll(/^\s*(\w+)\s*[(:]/gm)) push({ kind: 'graphql', method: match[1].toUpperCase(), path: field[1], framework: 'GraphQL SDL' }, open + 1 + field.index);
    }
  }
  if (/\.proto$/i.test(file)) {
    const pkg = text.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
    for (const service of text.matchAll(/service\s+(\w+)\s*\{/g)) {
      const open = service.index + service[0].length - 1, close = balanced(text, open), body = text.slice(open + 1, close);
      for (const rpc of body.matchAll(/rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g)) push({ kind: 'rpc', method: 'RPC', path: `/${pkg ? `${pkg}.` : ''}${service[1]}/${rpc[1]}`, framework: 'gRPC', handler: `${rpc[2] ? 'stream ' : ''}${rpc[3]} → ${rpc[4] ? 'stream ' : ''}${rpc[5]}` }, open + 1 + rpc.index);
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// Global settings discovered before routes are composed

function globalSettings(files, sources) {
  const settings = { nest: { prefix: '', exclude: [], versioning: null }, springContext: '', aspBase: '', rustDeps: '', globalGuards: new Set() };
  for (const file of files) {
    const text = sources.get(file) || '';
    if (/\.(ts|js|mts|mjs)$/.test(file) && text.includes('setGlobalPrefix')) {
      const match = text.match(/setGlobalPrefix\(\s*(['"`])([^'"`]*)\1\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/);
      if (match) { settings.nest.prefix = match[2]; settings.nest.exclude = strings(match[3] || '').filter(item => item.startsWith('/') || /^[\w-]/.test(item)); }
    }
    if (/\.(ts|js|mts|mjs)$/.test(file) && text.includes('enableVersioning')) {
      const open = text.indexOf('(', text.indexOf('enableVersioning')), args = text.slice(open + 1, balanced(text, open));
      const type = args.match(/type\s*:\s*VersioningType\.(\w+)/)?.[1] || 'URI';
      const prefix = /prefix\s*:\s*false/.test(args) ? '' : named(args, 'prefix')?.[0] ?? 'v';
      settings.nest.versioning = { type, prefix, defaultVersion: named(args, 'defaultVersion')?.[0] };
    }
    if (/(^|\/)(application|bootstrap)[^/]*\.(properties|ya?ml)$/.test(file)) settings.springContext ||= text.match(/server\.servlet\.context-path\s*[=:]\s*(\S+)/)?.[1] || text.match(/context-path\s*:\s*['"]?([^\s'"]+)/)?.[1] || '';
    if (/\.cs$/.test(file)) settings.aspBase ||= text.match(/UsePathBase\(\s*"([^"]+)"/)?.[1] || '';
    if (/(^|\/)Cargo\.toml$/.test(file)) settings.rustDeps += text;
    if (/APP_GUARD|useGlobalGuards/.test(text)) settings.globalGuards.add('NestJS');
    if (/SecurityFilterChain|@EnableWebSecurity|WebSecurityConfigurerAdapter/.test(text)) settings.globalGuards.add('Spring');
    if (/RequireAuthorization\(|FallbackPolicy|AuthorizeFilter/.test(text)) settings.globalGuards.add('ASP.NET Core');
    if (/access_control:/.test(text)) settings.globalGuards.add('Symfony');
  }
  settings.compose = ({ language, framework, prefix, path, version }) => {
    if (framework === 'NestJS') {
      const versioning = settings.nest.versioning, chosen = version ?? versioning?.defaultVersion;
      const versionSegment = versioning?.type === 'URI' && chosen && !/neutral/i.test(String(chosen)) ? `${versioning.prefix}${chosen}` : '';
      const local = joinPath(versionSegment, prefix, path);
      const excluded = settings.nest.exclude.some(item => pathKey(item) === pathKey(joinPath(prefix, path)));
      return excluded ? local : joinPath(settings.nest.prefix, local);
    }
    if (language === 'Java' || language === 'Kotlin') return joinPath(settings.springContext, prefix, path);
    if (framework === 'ASP.NET Core') return joinPath(settings.aspBase, prefix, path);
    return joinPath(prefix, path);
  };
  return settings;
}

// ---------------------------------------------------------------------------
// Import bindings, used to follow router mounts across files

function bindingsOf(language, text) {
  const map = new Map();
  if (language === 'JavaScript' || language === 'TypeScript') {
    for (const match of text.matchAll(/import\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]/g)) {
      if (match[1]) map.set(match[1], match[4]);
      if (match[3]) map.set(match[3], match[4]);
      for (const name of (match[2] || '').split(',')) { const local = name.trim().split(/\s+as\s+/).pop(); if (local) map.set(local, match[4]); }
    }
    for (const match of text.matchAll(/(?:const|let|var)\s+(?:([\w$]+)|\{([^}]*)\})\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (match[1]) map.set(match[1], match[3]);
      for (const name of (match[2] || '').split(',')) { const local = name.trim().split(/\s*:\s*/).pop(); if (local) map.set(local, match[3]); }
    }
  }
  if (language === 'Python') {
    for (const match of text.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+\(?([\w \t,]+)\)?/gm)) for (const name of match[2].split(',')) { const [original, alias] = name.trim().split(/\s+as\s+/); if (original) map.set(alias || original, [`${match[1]}${match[1].endsWith('.') ? '' : '.'}${original}`, match[1]]); }
    for (const match of text.matchAll(/^[ \t]*import[ \t]+([\w.]+)(?:[ \t]+as[ \t]+(\w+))?/gm)) map.set(match[2] || match[1].split('.')[0], [match[1]]);
  }
  return map;
}

// ---------------------------------------------------------------------------

/**
 * Scans the repository for entry points. `sources` (file → text) and `graph` (from
 * buildGraph) are optional and avoid re-reading files and re-resolving imports.
 */
export async function extractRoutes(root, { sources = new Map(), resolve } = {}) {
  const files = await listFiles(root, file => Boolean(languageForPath(file)) || EXTRA_FILES.test(file) || /(^|\/)(next|nuxt|svelte|astro)\.config\.[cm]?[jt]s$|(^|\/)(Cargo\.toml|pubspec\.yaml)$/.test(file));
  for (const file of files) if (!sources.has(file)) sources.set(file, await readFile(join(root, file), 'utf8').then(text => (text.length > MAX_BYTES ? '' : text)).catch(() => ''));
  const settings = globalSettings(files, sources), mounts = [], routes = [];
  settings.pythonPrefixes = new Map();
  settings.inCode = () => true;
  settings.mount = (file, language, target, prefix) => mounts.push({ file, language, target, prefix });
  for (const file of files) {
    const language = languageForPath(file), text = sources.get(file) || '';
    if (!text) continue;
    if (!language) { routes.push(...contractRoutes(file, text)); continue; }
    if (TEST_FILE.test(file)) continue;
    settings.pythonPrefixes = new Map();
    const masked = blank(text, language);
    settings.inCode = index => masked[index] === text[index];
    const fromCalls = callRoutes(file, language, text, settings);
    routes.push(...annotationRoutes(file, language, text, settings), ...fromCalls);
  }
  routes.push(...fileSystemRoutes(files, sources));
  // Apply router mounts transitively (a mounted router may mount others).
  if (resolve && mounts.length) {
    const prefixesFor = new Map();
    for (const mount of mounts) {
      const text = sources.get(mount.file) || '', bindings = bindingsOf(mount.language, text);
      let specs = [];
      const required = mount.target.match(/^require\(\s*['"]([^'"]+)['"]\s*\)/);
      if (required) specs = [required[1]];
      else if (mount.target.startsWith('module:')) specs = [mount.target.slice(7)];
      else { const bound = bindings.get(mount.target.split('.')[0].replace(/\(.*$/, '')); specs = bound ? [].concat(bound) : []; }
      for (const spec of specs) {
        const [target] = resolve(mount.language, spec, mount.file);
        if (target && target !== mount.file) { prefixesFor.set(target, [...(prefixesFor.get(target) || []), { from: mount.file, prefix: mount.prefix }]); break; }
      }
    }
    const fullPrefix = (file, seen = new Set()) => {
      const entries = prefixesFor.get(file);
      if (!entries || seen.has(file)) return [''];
      seen.add(file);
      return entries.flatMap(entry => fullPrefix(entry.from, new Set(seen)).map(parent => joinPath(parent, entry.prefix)));
    };
    const mounted = [];
    for (const route of routes) {
      if (route.source !== 'code' || !prefixesFor.has(route.file) || route.kind !== 'http') { mounted.push(route); continue; }
      for (const prefix of fullPrefix(route.file)) mounted.push({ ...route, path: joinPath(prefix, route.path), mountedAt: prefix });
    }
    routes.length = 0; routes.push(...mounted);
  }
  const seen = new Set(), unique = routes.filter(route => { const key = `${route.kind}|${route.method}|${route.path}|${route.file}|${route.line}`; if (seen.has(key)) return false; seen.add(key); return true; });
  for (const route of unique) {
    route.id = `${route.method} ${route.path} @ ${route.file}:${route.line}`; route.guards ||= [];
    if (settings.globalGuards.has(route.framework)) route.globalGuard = true;
    delete route.receiver; delete route.mounted;
  }
  return unique.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path) || VERBS.indexOf(a.method) - VERBS.indexOf(b.method));
}

/** Findings about entry points: duplicate definitions and contract drift. */
export function routeInsights(routes) {
  const code = routes.filter(route => route.source !== 'contract' && route.kind === 'http'), contract = routes.filter(route => route.source === 'contract' && route.kind === 'http');
  const byKey = new Map();
  // Same framework only: a polyglot monorepo legitimately serves /login from two services.
  for (const route of code) { const key = `${route.framework} ${route.method} ${pathKey(route.path)}`; byKey.set(key, [...(byKey.get(key) || []), route]); }
  const duplicates = [...byKey.values()].filter(items => items.length > 1 && new Set(items.map(item => `${item.file}:${item.line}`)).size > 1 && items[0].method !== 'ANY').map(items => ({ method: items[0].method, path: items[0].path, locations: items.map(item => `${item.file}:${item.line}`) }));
  let undocumented = [], unimplemented = [];
  if (contract.length) {
    const keys = route => { const base = route.basePath ? [pathKey(joinPath(route.basePath, route.path))] : []; return [...base, pathKey(route.path)]; };
    const implemented = new Set(code.flatMap(route => [`${route.method} ${pathKey(route.path)}`, `ANY ${pathKey(route.path)}`]));
    const codeAny = new Set(code.filter(route => route.method === 'ANY').map(route => pathKey(route.path)));
    const documented = new Set(contract.flatMap(route => keys(route).map(key => `${route.method} ${key}`)));
    const suffixMatch = (set, method, key) => [...set].some(item => { const [m, p] = item.split(' '); return (m === method || m === 'ANY') && (p.endsWith(key) || key.endsWith(p)); });
    unimplemented = contract.filter(route => !keys(route).some(key => implemented.has(`${route.method} ${key}`) || codeAny.has(key) || suffixMatch(implemented, route.method, key))).map(({ method, path, file, line }) => ({ method, path, file, line }));
    // Only code under the contract's own path space counts as undocumented.
    const spaces = new Set(contract.flatMap(route => keys(route).map(key => key.split('/')[1])));
    undocumented = code.filter(route => spaces.has(pathKey(route.path).split('/')[1]) && route.method !== 'ANY' && !documented.has(`${route.method} ${pathKey(route.path)}`) && !suffixMatch(documented, route.method, pathKey(route.path))).map(({ method, path, file, line }) => ({ method, path, file, line }));
  }
  const unguarded = code.filter(route => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method) && !route.guards.length && !route.globalGuard && ['NestJS', 'Spring', 'ASP.NET Core', 'Symfony'].includes(route.framework)).map(({ method, path, file, line }) => ({ method, path, file, line }));
  const count = key => Object.fromEntries(Object.entries(routes.reduce((acc, route) => ({ ...acc, [route[key]]: (acc[route[key]] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]));
  return { total: routes.length, byKind: count('kind'), byMethod: count('method'), byFramework: count('framework'), duplicates, contract: { documented: contract.length, undocumented, unimplemented }, unguardedWrites: unguarded };
}
