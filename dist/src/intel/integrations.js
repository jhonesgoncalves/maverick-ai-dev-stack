import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { extractImports } from '../core/imports.js';
import { lineIndex, listFiles } from './files.js';

// What the application talks to: databases, brokers, clouds and SaaS APIs, found from
// dependency manifests and from the import specifiers of each file (so we know WHO uses
// them), plus the configuration it reads from the environment and the hosts it calls.
// Every entry names the files that prove it. Values of variables are never read.

// One pattern per integration, matched against package names and import specifiers of
// every ecosystem (npm, PyPI, Go modules, Maven, NuGet, crates, gems, Composer, Hex, pub).
export const INTEGRATIONS = [
  ['postgres', 'PostgreSQL', 'database', /^(pg|pg-promise|postgres|@neondatabase\/.+|psycopg2?(-binary)?|psycopg|asyncpg|github\.com\/(lib\/pq|jackc\/pgx.*)|org\.postgresql.*|Npgsql.*|tokio[-_]postgres|postgrex|pg_?gem|postgres_ex)$/i],
  ['mysql', 'MySQL / MariaDB', 'database', /^(mysql2?|mariadb|pymysql|mysqlclient|aiomysql|github\.com\/go-sql-driver\/mysql|com\.mysql.*|mysql-connector.*|MySql(Connector|\.Data).*|mysql_async|myxql)$/i],
  ['sqlite', 'SQLite', 'database', /^(sqlite3?|better-sqlite3|github\.com\/mattn\/go-sqlite3|org\.xerial.*|Microsoft\.Data\.Sqlite|rusqlite|exqlite|sqflite)$/i],
  ['mongodb', 'MongoDB', 'database', /^(mongodb|mongoose|pymongo|motor|mongoengine|go\.mongodb\.org\/mongo-driver.*|org\.mongodb.*|MongoDB\.Driver.*|mongo|mongoid|mongodb_driver|spring-boot-starter-data-mongodb)$/i],
  ['redis', 'Redis', 'cache', /^(redis|ioredis|@redis\/.+|aioredis|redis-py|github\.com\/(go-redis|redis)\/.+|StackExchange\.Redis|redis-rs|redix|predis\/predis|Predis.*|jedis|lettuce.*|io\.lettuce.*|redis\.clients.*|spring-boot-starter-data-redis|bullmq|bull|@nestjs\/bull.*)$/i],
  ['elasticsearch', 'Elasticsearch / OpenSearch', 'search', /^(@elastic\/elasticsearch|elasticsearch|@opensearch-project\/opensearch|opensearch-py|github\.com\/elastic\/go-elasticsearch.*|co\.elastic.*|org\.elasticsearch.*|Elastic\.Clients.*|NEST|searchkick|elastix)$/i],
  ['kafka', 'Apache Kafka', 'messaging', /^(kafkajs|@confluentinc\/.+|node-rdkafka|kafka|kafka-python|confluent[-_]kafka|aiokafka|github\.com\/(segmentio\/kafka-go|confluentinc\/.+|IBM\/sarama|Shopify\/sarama)|org\.apache\.kafka.*|org\.springframework\.kafka.*|spring-kafka|Confluent\.Kafka|rdkafka|ruby-kafka|karafka|kaffe|brod|broadway_kafka)$/i],
  ['rabbitmq', 'RabbitMQ / AMQP', 'messaging', /^(amqplib|amqp-connection-manager|@golevelup\/nestjs-rabbitmq|pika|aio-pika|kombu|github\.com\/(streadway\/amqp|rabbitmq\/amqp091-go)|com\.rabbitmq.*|org\.springframework\.amqp.*|spring-rabbit|RabbitMQ\.Client|lapin|bunny|sneakers|amqp|php-amqplib\/php-amqplib|PhpAmqpLib.*|broadway_rabbitmq)$/i],
  ['nats', 'NATS', 'messaging', /^(nats|nats\.ws|nats-py|github\.com\/nats-io\/.+|io\.nats.*|NATS\.Client|async-nats|gnat)$/i],
  ['aws', 'AWS', 'cloud', /^(aws-sdk|@aws-sdk\/.+|boto3|botocore|aioboto3|github\.com\/aws\/aws-sdk-go.*|software\.amazon\.awssdk.*|com\.amazonaws.*|AWSSDK\..+|aws-sdk-.+|aws_sdk_.+|ex_aws.*|aws\/aws-sdk-php|Aws.*)$/i],
  ['azure', 'Azure', 'cloud', /^(@azure\/.+|azure-.+|github\.com\/Azure\/.+|com\.azure.*|com\.microsoft\.azure.*|Azure\..+|Microsoft\.Azure\..+)$/i],
  ['gcp', 'Google Cloud', 'cloud', /^(@google-cloud\/.+|google-cloud-.+|google\.cloud.*|cloud\.google\.com\/go.*|com\.google\.cloud.*|Google\.Cloud\..+|google-cloud|googleapis)$/i],
  ['firebase', 'Firebase', 'cloud', /^(firebase|firebase-admin|@firebase\/.+|firebase_admin|firebase\.google\.com\/go.*|com\.google\.firebase.*|FirebaseAdmin|package:firebase_.+|firebase_.+|cloud_firestore)$/i],
  ['stripe', 'Stripe', 'payments', /^(stripe|@stripe\/.+|github\.com\/stripe\/stripe-go.*|com\.stripe.*|Stripe\.net|stripe-rust|async-stripe|stripity_stripe|stripe\/stripe-php|Stripe.*)$/i],
  ['openai', 'OpenAI', 'ai', /^(openai|@openai\/.+|github\.com\/sashabaranov\/go-openai|com\.theokanning.*|OpenAI|async-openai|ruby-openai|openai-php\/.+)$/i],
  ['anthropic', 'Anthropic', 'ai', /^(@anthropic-ai\/.+|anthropic|github\.com\/anthropics\/.+|com\.anthropic.*|Anthropic.*)$/i],
  ['llm', 'LLM frameworks', 'ai', /^(langchain|@langchain\/.+|langchain-.+|llama[-_]index|@llamaindex\/.+|ai|@ai-sdk\/.+|dev\.langchain4j.*|Microsoft\.SemanticKernel.*)$/i],
  ['sentry', 'Sentry', 'observability', /^(@sentry\/.+|sentry-sdk|sentry_sdk|github\.com\/getsentry\/sentry-go|io\.sentry.*|Sentry.*|sentry|sentry-ruby|sentry-rails)$/i],
  ['otel', 'OpenTelemetry', 'observability', /^(@opentelemetry\/.+|opentelemetry.*|go\.opentelemetry\.io\/.+|io\.opentelemetry.*|OpenTelemetry.*)$/i],
  ['datadog', 'Datadog', 'observability', /^(dd-trace|datadog|ddtrace|hot-shots|gopkg\.in\/DataDog\/.+|github\.com\/DataDog\/.+|com\.datadoghq.*|Datadog\..+)$/i],
  ['prometheus', 'Prometheus', 'observability', /^(prom-client|prometheus[-_]client|github\.com\/prometheus\/client_golang.*|io\.prometheus.*|io\.micrometer.*|prometheus-net.*|prometheus|prometheus_ex|prom_ex)$/i],
  ['elk', 'Logging pipeline', 'observability', /^(winston|pino|bunyan|@elastic\/ecs-.+|structlog|loguru|go\.uber\.org\/zap|github\.com\/sirupsen\/logrus|github\.com\/rs\/zerolog|ch\.qos\.logback.*|org\.apache\.logging.*|Serilog.*|NLog.*|tracing|lograge)$/i],
  ['grpc', 'gRPC', 'rpc', /^(@grpc\/.+|grpc|grpcio.*|google\.golang\.org\/grpc.*|io\.grpc.*|Grpc\..+|tonic|grpc_ex)$/i],
  ['graphql', 'GraphQL', 'api', /^(graphql|@apollo\/.+|apollo-server.*|@nestjs\/graphql|graphql-yoga|type-graphql|urql|graphene.*|strawberry(-graphql)?|ariadne|github\.com\/(99designs\/gqlgen|graph-gophers\/.+)|com\.graphql-java.*|HotChocolate.*|GraphQL.*|async-graphql|juniper|absinthe|graphql-ruby)$/i],
  ['http', 'HTTP clients', 'http', /^(axios|got|ky|node-fetch|undici|superagent|@nestjs\/axios|requests|httpx|aiohttp|urllib3|github\.com\/go-resty\/resty.*|com\.squareup\.okhttp.*|okhttp3?|org\.springframework\.web\.reactive.*|feign.*|io\.github\.openfeign.*|Refit|RestSharp|Flurl.*|reqwest|hyper|faraday|httparty|guzzlehttp\/guzzle|GuzzleHttp.*|tesla|finch|httpoison|req|dio|package:dio.*|package:http.*|Alamofire)$/i],
  ['orm', 'ORM / query builders', 'database', /^(@prisma\/client|prisma|typeorm|sequelize|drizzle-orm|knex|mikro-orm|@mikro-orm\/.+|objection|sqlalchemy|django\.db.*|peewee|tortoise(-orm)?|sqlmodel|gorm\.io\/.+|entgo\.io\/.+|github\.com\/jmoiron\/sqlx|org\.hibernate.*|jakarta\.persistence.*|javax\.persistence.*|spring-boot-starter-data-jpa|org\.jooq.*|Microsoft\.EntityFrameworkCore.*|Dapper|diesel|sea-orm|sqlx|activerecord|sequel|ecto.*|Ecto.*|doctrine\/.+|Doctrine.*|illuminate\/database|Illuminate\\\\Database.*|drift|floor)$/i],
  ['auth', 'Auth & identity', 'security', /^(passport.*|jsonwebtoken|jose|next-auth|@auth\/.+|@clerk\/.+|@auth0\/.+|auth0|keycloak-.+|@supabase\/supabase-js|pyjwt|jwt|authlib|python-jose|django-allauth|github\.com\/golang-jwt\/.+|org\.springframework\.security.*|spring-boot-starter-security|com\.auth0.*|io\.jsonwebtoken.*|Microsoft\.AspNetCore\.Authentication.*|Microsoft\.Identity.*|jsonwebtoken|devise|omniauth.*|guardian|ueberauth|pow|firebase_auth|tymon\/jwt-auth|laravel\/sanctum|laravel\/passport)$/i],
  ['email', 'Email / messaging SaaS', 'saas', /^(nodemailer|@sendgrid\/.+|sendgrid|twilio|@slack\/.+|slack[-_]sdk|resend|postmark|mailgun.*|@aws-sdk\/client-ses|github\.com\/sendgrid\/.+|com\.sendgrid.*|com\.twilio.*|Twilio|SendGrid|mail|actionmailer|swoosh|bamboo)$/i]
].map(([id, name, category, pattern]) => ({ id, name, category, pattern }));

const INFRA_IMAGES = [
  ['postgres', /postgres|postgis|timescale/], ['mysql', /mysql|mariadb/], ['mongodb', /mongo/], ['redis', /redis|valkey|dragonfly/], ['elasticsearch', /elasticsearch|opensearch|kibana/],
  ['kafka', /kafka|redpanda|zookeeper/], ['rabbitmq', /rabbitmq/], ['nats', /nats/], ['aws', /localstack|minio|dynamodb/], ['azure', /azurite|servicebus/], ['otel', /otel|jaeger|tempo|zipkin/], ['prometheus', /prometheus|grafana/]
];

const MANIFESTS = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml|Gemfile|composer\.json|[^/]+\.csproj|mix\.exs|pubspec\.yaml|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/;

/** Dependency names declared by one manifest. */
export function manifestDependencies(file, text) {
  const name = file.split('/').pop();
  try {
    if (name === 'package.json' || name === 'composer.json') { const json = JSON.parse(text); return Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.require, ...json.peerDependencies, ...json.optionalDependencies }); }
    if (/^requirements.*\.txt$/.test(name)) return [...text.matchAll(/^\s*([A-Za-z0-9][\w.-]*)/gm)].map(match => match[1]);
    if (name === 'pyproject.toml' || name === 'Pipfile') return [...text.matchAll(/^\s*["']?([A-Za-z0-9][\w.-]*)["']?\s*(?:[=<>~!^]|\[|["'])/gm), ...text.matchAll(/["']([A-Za-z0-9][\w.-]*)\s*(?:[=<>~!;[]|["'])/g)].map(match => match[1]);
    if (name === 'go.mod') return [...text.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w.-]+\/[^\s]+)\s+v/gm)].map(match => match[1]);
    if (name === 'pom.xml') return [...text.matchAll(/<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g)].flatMap(match => [match[1], match[2], `${match[1]}.${match[2]}`]);
    if (/^build\.gradle/.test(name)) return [...text.matchAll(/["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g)].flatMap(match => [match[1], match[2], `${match[1]}.${match[2]}`]);
    if (name === 'Cargo.toml') { const section = text.split(/^\[/m).filter(part => /^(dev-|build-)?dependencies/.test(part)).join('\n'); return [...section.matchAll(/^\s*([A-Za-z0-9][\w-]*)\s*=/gm)].map(match => match[1]); }
    if (name === 'Gemfile') return [...text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)].map(match => match[1]);
    if (name.endsWith('.csproj')) return [...text.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map(match => match[1]);
    if (name === 'mix.exs') return [...text.matchAll(/\{\s*:(\w+)\s*,/g)].map(match => match[1]);
    if (name === 'pubspec.yaml') { const yaml = parseYaml(text) || {}; return Object.keys({ ...yaml.dependencies, ...yaml.dev_dependencies }); }
    if (/compose/.test(name)) { const yaml = parseYaml(text) || {}; return Object.values(yaml.services || {}).map(service => `image:${service?.image || ''}`); }
  } catch { /* unreadable manifest */ }
  return [];
}

// Environment reads in every mainstream language. Only variable NAMES are collected.
const ENV_PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g, /process\.env\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g, /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g, /Deno\.env\.get\(\s*['"]([A-Z_][A-Z0-9_]*)/g, /Bun\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.environ(?:\.get)?\s*[[(]\s*['"]([A-Z_][A-Z0-9_]*)/g, /os\.getenv\(\s*['"]([A-Z_][A-Z0-9_]*)/g, /env\.(?:str|int|bool|url|list)\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /os\.(?:Getenv|LookupEnv)\(\s*"([A-Z_][A-Z0-9_]*)"/g, /viper\.Get\w*\(\s*"([\w.]+)"/g,
  /System\.getenv\(\s*"([A-Z_][A-Z0-9_]*)"/g, /@Value\(\s*"\$\{([\w.-]+)/g,
  /Environment\.GetEnvironmentVariable\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /ENV\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\]/g, /ENV\.fetch\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /\benv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g, /\$_(?:ENV|SERVER)\[\s*['"]([A-Z_][A-Z0-9_]*)/g, /getenv\(\s*['"]([A-Z_][A-Z0-9_]*)/g,
  /(?:std::)?env::var(?:_os)?\(\s*"([A-Z_][A-Z0-9_]*)"/g, /\benv!\(\s*"([A-Z_][A-Z0-9_]*)"/g,
  /System\.(?:get_env|fetch_env!?)\(\s*"([A-Z_][A-Z0-9_]*)"/g, /Platform\.environment\[\s*['"]([A-Z_][A-Z0-9_]*)/g, /environment\[\s*"([A-Z_][A-Z0-9_]*)"\s*\]/g,
  /config(?:Service)?\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g
];
const SECRET = /(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|SIGNING|SALT|DSN)/;
const ADDRESS = /(_URL|_URI|_HOST|_ENDPOINT|_ADDR(ESS)?|_BASE|_SERVER|_DSN)$/;
const DOC_HOSTS = /(^|\.)(w3\.org|schema\.org|json-schema\.org|example\.(com|org|net)|localhost|127\.0\.0\.1|0\.0\.0\.0|github\.com|githubusercontent\.com|npmjs\.(com|org)|mozilla\.org|apache\.org|opensource\.org|creativecommons\.org|xmlsoap\.org|microsoft\.com|googleapis\.com\/auth|gnu\.org|jquery\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|shields\.io|wikipedia\.org|stackoverflow\.com|semver\.org|ietf\.org|purl\.org|swagger\.io|openapis\.org)$/i;

/** Human name for a service address variable: PAYMENTS_API_URL → "Payments API". */
export function serviceName(variable) {
  return variable.replace(ADDRESS, '').split('_').filter(Boolean).map(word => (/^(API|HTTP|GRPC|DB|SQL|AWS|GCP|SMTP|S3|SQS|SNS|CDN|IDP|SSO|CRM|ERP)$/.test(word) ? word : word[0] + word.slice(1).toLowerCase())).join(' ') || variable;
}

async function exampleKeys(root) {
  const keys = new Set(), sources = [];
  for (const name of ['.env.example', '.env.sample', '.env.template', '.env.dist', 'example.env', '.env.defaults', 'env.example']) {
    const text = await readFile(join(root, name), 'utf8').catch(() => null);
    if (text === null) continue;
    sources.push(name);
    for (const match of text.matchAll(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/gm)) keys.add(match[1]);
  }
  return { keys, sources };
}

/**
 * Integrations, configuration and outbound hosts. `sources` maps source files to their
 * text (from buildGraph); `languageOf` returns the language of a file.
 */
export async function analyzeIntegrations(root, { sources, languageOf, isTest = () => false }) {
  const manifests = await listFiles(root, file => MANIFESTS.test(file), { depthLimit: 6 });
  const declared = new Map(); // integration id → { manifests, packages }
  const note = (id, manifest, pkg) => { if (!declared.has(id)) declared.set(id, { manifests: new Set(), packages: new Set() }); declared.get(id).manifests.add(manifest); if (pkg) declared.get(id).packages.add(pkg); };
  for (const manifest of manifests) {
    const text = await readFile(join(root, manifest), 'utf8').catch(() => '');
    for (const dependency of manifestDependencies(manifest, text)) {
      if (dependency.startsWith('image:')) { const image = dependency.slice(6).toLowerCase(); for (const [id, pattern] of INFRA_IMAGES) if (pattern.test(image)) note(id, manifest, image); continue; }
      for (const integration of INTEGRATIONS) if (integration.pattern.test(dependency)) { note(integration.id, manifest, dependency); break; }
    }
  }
  const users = new Map(), env = new Map(), hosts = new Map();
  for (const [file, text] of sources) {
    if (!text || isTest(file)) continue;
    const language = languageOf(file), at = lineIndex(text);
    for (const spec of extractImports(language, text)) {
      if (spec.startsWith('.')) continue;
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : /^[\w.-]+\.[a-z]{2,}\//.test(spec) ? spec : spec.split(/[/:]/)[0];
      for (const integration of INTEGRATIONS) {
        if (integration.pattern.test(spec) || integration.pattern.test(pkg) || (language === 'Python' && integration.pattern.test(spec.split('.')[0]))) {
          if (!users.has(integration.id)) users.set(integration.id, new Map());
          users.get(integration.id).set(file, spec);
          break;
        }
      }
    }
    for (const pattern of ENV_PATTERNS) for (const match of text.matchAll(pattern)) {
      const name = match[1];
      if (!env.has(name)) env.set(name, { name, files: new Map() });
      const entry = env.get(name);
      if (!entry.files.has(file)) entry.files.set(file, at(match.index));
    }
    for (const match of text.matchAll(/\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?(\/[^\s'"`)]*)?/gi)) {
      const host = match[1].toLowerCase(), line = text.slice(text.lastIndexOf('\n', match.index) + 1, match.index).trim();
      // Documentation links are not integrations: skip comments and docs-like addresses.
      if (DOC_HOSTS.test(host) || /^(\/\/|#|\*|\/\*|--|<!--)/.test(line) || /^(docs?|developers?|help|support|blog|www|learn|status)\./.test(host) || /^\/(docs?|documentation|blog|guides?|learn|reference)\b/.test(match[2] || '') || /\.(dev|example|test|invalid|local)$/.test(host)) continue;
      // A literal URL is a service only where code calls or configures a client with it.
      const context = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? undefined : text.indexOf('\n', match.index));
      if (!/(fetch|axios|got|ky|request|http[s]?\.|client|base_?url|baseURL|endpoint|_URL|url\s*[:=]|uri\s*[:=]|host\s*[:=]|requests\.|httpx\.|HttpClient|WebClient|RestTemplate|NewRequest|reqwest|Faraday|Guzzle|Dio|URLSession|connect|dial)/i.test(context)) continue;
      if (!hosts.has(host)) hosts.set(host, { host, files: new Map() });
      if (!hosts.get(host).files.has(file)) hosts.get(host).files.set(file, at(match.index));
    }
  }
  const byId = new Map(INTEGRATIONS.map(item => [item.id, item]));
  const integrations = [...new Set([...declared.keys(), ...users.keys()])].map(id => {
    const meta = byId.get(id), dec = declared.get(id), use = users.get(id);
    return { id, name: meta.name, category: meta.category, packages: [...(dec?.packages || [])].slice(0, 12), manifests: [...(dec?.manifests || [])], files: [...(use?.keys() || [])], declaredOnly: !use };
  }).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
  const { keys: documented, sources: exampleFiles } = await exampleKeys(root);
  const variables = [...env.values()].map(entry => ({
    name: entry.name, files: [...entry.files].map(([file, line]) => ({ file, line })), secret: SECRET.test(entry.name), address: ADDRESS.test(entry.name),
    documented: exampleFiles.length ? documented.has(entry.name) : null
  })).sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
  const services = [
    ...variables.filter(item => item.address && !/^(DATABASE|DB|REDIS|MONGO\w*|POSTGRES\w*|MYSQL|KAFKA\w*|RABBIT\w*|AMQP|ELASTIC\w*|NODE|PORT|APP|PUBLIC|NEXT_PUBLIC|VITE)_/.test(item.name) && !/^(DATABASE_URL|REDIS_URL|MONGO_URL|MONGODB_URI|PORT|HOST)$/.test(item.name))
      .map(item => ({ id: `env:${item.name}`, name: serviceName(item.name), via: item.name, files: item.files.map(entry => entry.file) })),
    ...[...hosts.values()].map(entry => ({ id: `host:${entry.host}`, name: entry.host, via: 'literal URL', files: [...entry.files.keys()] }))
  ].sort((a, b) => b.files.length - a.files.length).slice(0, 60);
  return { integrations, variables, services, exampleFiles, manifests };
}
