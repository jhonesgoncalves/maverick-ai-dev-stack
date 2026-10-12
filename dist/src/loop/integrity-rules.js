import { TEST_FILE } from '../intel/files.js';

// The integrity guard's data: which files are part of the oracle (what decides "passing"), how
// each language declares tests, assertions, skips and suppressions, and how severe each kind
// of finding is. Rules only; src/loop/integrity.js applies them to a diff.

const any = (...patterns) => new RegExp(patterns.map(pattern => pattern.source).join('|'));

/** Test data: snapshots and golden files are a classic place to make a failing check pass. */
export const TEST_DATA = /(^|\/)(testdata|__snapshots__|__fixtures__|fixtures|golden)\/|\.(snap|golden)$|\.approved\.[^/]+$/;

/** Test files: the shared detector plus Android/JVM integration trees, Swift Tests/, e2e suites. */
export const TEST = any(TEST_FILE, /(^|\/)src\/(androidTest|integrationTest)\//, /(^|\/)Tests\//, /(^|\/)(cypress|playwright)\//, /_unittest\.cc$/);

/** Configuration that decides what lint, types, tests and coverage accept, across ecosystems. */
export const ORACLE_CONFIG = any(
  /(^|\/)(jest|vitest|playwright|cypress|karma|ava|wdio|mocha|nyc|c8|babel|stylelint|prettier|eslint)\.config\.[cm]?[jt]s$/,
  /(^|\/)\.(mocharc|nycrc|c8rc|eslintrc|prettierrc|stylelintrc|swcrc|babelrc)(\.[a-z]+)?$/,
  /(^|\/)(\.eslintignore|\.prettierignore|biome\.jsonc?|\.oxlintrc\.json|deno\.jsonc?)$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)(setupTests|jest\.setup|vitest\.setup|test-setup)\.[cm]?[jt]sx?$/,
  /(^|\/)(pytest\.ini|conftest\.py|tox\.ini|noxfile\.py|\.coveragerc|mypy\.ini|pyrightconfig\.json|ruff\.toml|\.ruff\.toml|\.flake8|\.pylintrc)$/,
  /(^|\/)\.golangci\.(ya?ml|toml|json)$/,
  /(^|\/)(clippy\.toml|\.?rustfmt\.toml|deny\.toml|nextest\.toml)$/, /(^|\/)\.cargo\/config(\.toml)?$/,
  /(^|\/)(checkstyle|pmd|spotbugs)[^/]*\.xml$/, /(^|\/)detekt[^/]*\.ya?ml$/, /(^|\/)lint\.xml$/,
  /(^|\/)(Directory\.Build\.(props|targets)|[^/]+\.ruleset|[^/]+\.runsettings|stylecop\.json|GlobalSuppressions\.cs)$/,
  /(^|\/)(\.rubocop[^/]*\.ya?ml|\.standard\.ya?ml|\.rspec|spec_helper\.rb|rails_helper\.rb|test_helper\.rb|\.simplecov)$/,
  /(^|\/)(phpunit\.xml(\.dist)?|phpstan[^/]*\.neon(\.dist)?|psalm[^/]*\.xml(\.dist)?|\.php-cs-fixer[^/]*\.php|pint\.json|phpcs\.xml(\.dist)?|infection\.json5?|Pest\.php)$/,
  /(^|\/)(\.credo\.exs|\.formatter\.exs|\.dialyzer_ignore\.exs|test_helper\.exs|coveralls\.json)$/,
  /(^|\/)(analysis_options\.yaml|dart_test\.yaml)$/,
  /(^|\/)(\.swiftlint\.ya?ml|\.swiftformat|[^/]+\.xctestplan)$/,
  /(^|\/)(\.clang-tidy|\.clang-format|CTestConfig\.cmake)$/,
  /(^|\/)(\.?codecov\.ya?ml|sonar-project\.properties|\.pre-commit-config\.yaml)$/
);

/** Continuous integration and git hooks: where checks run outside the agent's reach. */
export const CI = any(
  /(^|\/)\.github\/(workflows|actions)\//, /(^|\/)\.gitlab-ci\.yml$/, /(^|\/)\.gitlab\/ci\//, /(^|\/)\.circleci\//, /(^|\/)azure-pipelines[^/]*\.ya?ml$/,
  /(^|\/)bitbucket-pipelines\.yml$/, /(^|\/)Jenkinsfile$/, /(^|\/)\.buildkite\//, /(^|\/)\.drone[^/]*\.ya?ml$/, /(^|\/)\.travis\.yml$/, /(^|\/)appveyor[^/]*\.ya?ml$/,
  /(^|\/)\.woodpecker/, /(^|\/)cloudbuild[^/]*\.ya?ml$/, /(^|\/)\.husky\//, /(^|\/)lefthook[^/]*\.ya?ml$/
);

/** Files where only some sections are part of the oracle (dependency edits belong to the deps gate). */
export const ORACLE_SECTIONS = {
  json: { 'package.json': ['scripts', 'jest', 'eslintConfig', 'prettier', 'mocha', 'ava', 'c8', 'nyc', 'vitest'], 'composer.json': ['scripts'] },
  ini: {
    'pyproject.toml': /^tool\.(pytest|coverage|mypy|ruff|pylint|pyright|black|isort|flake8|bandit|poe\.tasks|hatch\.envs\.[^.]+\.scripts)/,
    'Cargo.toml': /^(lints|workspace\.lints|profile\.test|\[test\])/,
    'setup.cfg': /^(tool:pytest|coverage:|mypy|flake8)/
  }
};

/** Lines in JVM build files that switch tests or checks off. */
export const BUILD_FILE = /(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/;
export const BUILD_FILE_LINES = /skipTests|<exclude>[^<]*Test|exclude\s*['"][^'"]*Test|ignoreFailures\s*=\s*true|failOnViolation\s*=\s*false|maxWarnings|-DskipTests|testFailureIgnore/;

/**
 * Per language: how a test is declared, what an assertion looks like, what skips or focuses a
 * test, and what silences lint or types. `strict`/`loose` matchers and `tautology` detect
 * assertions made weaker. Counted only on added and removed lines, comment lines dropped.
 */
export const LANGUAGE_RULES = {
  js: { ext: /\.(?:[cm]?[jt]sx?|vue|svelte)$/, comment: /^\s*(?:\/\/|\/?\*)/,
    test: /\b(?:it|test|specify)(?:\.each\s*\([^)]*\))?\s*\(\s*['"`]/,
    assertion: /\bexpect(?:TypeOf)?\s*\(|\bassert(?:\.\w+)?\s*\(|\.should\b|\bt\.(?:is|deepEqual|true|false|throws)\s*\(/,
    skip: /\b(?:it|test|describe|context|suite)\.(?:skip|only|todo|fixme)\b|\b(?:xit|xdescribe|xtest|fit|fdescribe)\s*\(|\{\s*skip\s*:\s*true|\bt\.skip\s*\(/,
    suppression: /eslint-disable|@ts-(?:ignore|expect-error|nocheck)|biome-ignore|istanbul ignore|[cv]8 ignore|\$FlowFixMe/,
    strict: /\.to(?:Be|Equal|StrictEqual|Throw)\s*\(\s*\S|\bassert\.(?:equal|strictEqual|deepEqual|deepStrictEqual|throws|rejects)\s*\(/, loose: /\.(?:toBeDefined|toBeTruthy|toBeFalsy|toBeInstanceOf)\s*\(|\.not\.toBeNull\s*\(|\bassert(?:\.ok)?\s*\(\s*\w+\s*\)/,
    tautology: /\bexpect\s*\(\s*(true|1|'[^']*'|"[^"]*")\s*\)\s*\.to(?:Be|Equal)\s*\(\s*\1\s*\)|\bassert(?:\.ok)?\s*\(\s*true\s*\)/ },
  py: { ext: /\.pyi?$/, comment: /^\s*#/,
    test: /^\s*(?:async\s+)?def\s+test\w*\s*\(/,
    assertion: /^\s*assert\b|\bself\.assert\w+\s*\(|\bpytest\.(?:raises|approx|warns)\b/,
    skip: /@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.(?:skip|xfail|importorskip)\s*\(|@unittest\.(?:skip\w*|expectedFailure)\b|\bself\.skipTest\s*\(|raise\s+(?:unittest\.)?SkipTest/,
    suppression: /#\s*(?:noqa|type:\s*ignore|pyright:\s*ignore|pylint:\s*disable|nosec|pragma:\s*no\s*cover)/,
    strict: /\bassert(?:Equal|Raises|In)\b|^\s*assert\s+.+==/, loose: /\bassert(?:IsNotNone|True)\s*\(|^\s*assert\s+\w+\s*(?:is not None)?\s*$/,
    tautology: /^\s*assert\s+(?:True|1)\s*(?:#.*)?$|\bself\.assertTrue\s*\(\s*True\s*\)/ },
  go: { ext: /\.go$/, comment: /^\s*\/\//,
    test: /^\s*func\s+(?:Test|Fuzz|Example)\w*\s*\(/,
    assertion: /\bt\.(?:Errorf?|Fatalf?|Fail(?:Now)?)\s*\(|\b(?:assert|require)\.\w+\s*\(/,
    skip: /\bt\.Skip(?:f|Now)?\s*\(|\/\/go:build\s+ignore/,
    suppression: /\/\/\s*nolint\b|\/\/\s*lint:ignore|\/\/\s*#?nosec/ },
  rust: { ext: /\.rs$/, comment: /^\s*\/\//,
    test: /#\[(?:tokio::)?test\b|#\[rstest\b|#\[test_case\b/,
    assertion: /\b(?:assert|assert_eq|assert_ne|assert_matches|debug_assert\w*)!\s*\(|#\[should_panic/,
    skip: /#\[ignore\b|#\[cfg\((?:any\(\)|FALSE)\)\]/,
    suppression: /#!?\[(?:allow|expect)\s*\(/ },
  jvm: { ext: /\.(?:java|kt|kts|scala|groovy)$/, comment: /^\s*(?:\/\/|\/?\*)/,
    test: /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/,
    assertion: /\bassert(?:Equals|True|False|NotNull|Null|That|Throws|Same|ArrayEquals|All|DoesNotThrow)\s*\(|\bverify\s*\(|\bshould(?:Be|Equal|Throw)\b/,
    skip: /@(?:Disabled\w*|Ignore|EnabledIf\w*)\b|\bassume(?:True|False|That)\s*\(/,
    suppression: /@SuppressWarnings\b|@Suppress\s*\(|\/\/\s*NOSONAR|@SuppressFBWarnings|CHECKSTYLE:OFF|\/\/\s*noinspection/ },
  dotnet: { ext: /\.(?:cs|fs|vb)$/, comment: /^\s*\/\//,
    test: /\[(?:Fact|Theory|Test|TestMethod|TestCase|DataTestMethod)\b/,
    assertion: /\b(?:Collection|String)?Assert\.\w+\s*\(|\.Should\(\)/,
    skip: /\[(?:Fact|Theory)\s*\([^)]*Skip\s*=|\[Ignore\b|\[Explicit\b|Assert\.(?:Inconclusive|Ignore)\s*\(/,
    suppression: /#pragma\s+warning\s+disable|\[SuppressMessage\b|\/\/\s*ReSharper\s+disable/ },
  ruby: { ext: /\.(?:rb|rake)$/, comment: /^\s*#/,
    test: /^\s*(?:it|specify|scenario|test)\s*(?:\(?\s*['"]|do\b|\{)|^\s*def\s+test_\w+/,
    assertion: /\bexpect\s*[({]|\b(?:assert|refute)(?:_\w+)?\b|\.to\s+(?:eq|be|match|include|raise_error)\b/,
    skip: /^\s*(?:xit|xdescribe|xcontext|xspecify|fit|fdescribe|fcontext)\b|^\s*(?:skip|pending)\b|\bskip:\s*true|\bfocus:\s*true/,
    suppression: /#\s*rubocop:(?:disable|todo)|#\s*standard:disable|T\.unsafe\s*\(|#\s*typed:\s*(?:false|ignore)/ },
  php: { ext: /\.php$/, comment: /^\s*(?:\/\/|#|\/?\*)/,
    test: /\bfunction\s+test\w*\s*\(|@test\b|#\[Test\]|^\s*(?:it|test)\s*\(\s*['"]/,
    assertion: /\$this->assert\w+\s*\(|\bself::assert\w+\s*\(|\bexpect\s*\(|\bAssert::\w+\s*\(/,
    skip: /\$this->mark(?:TestSkipped|TestIncomplete)\s*\(|->(?:skip|todo)\s*\(/,
    suppression: /@phpstan-ignore|@psalm-suppress|@codeCoverageIgnore|phpcs:(?:ignore|disable)/ },
  elixir: { ext: /\.exs?$/, comment: /^\s*#/, test: /^\s*(?:test|property)\s+"/, assertion: /\b(?:assert|refute)(?:_raise|_receive|_received)?\b/,
    skip: /@(?:module)?tag\s+(?::skip|skip:|:pending)/, suppression: /#\s*credo:disable|@dialyzer\s+\{?:no/ },
  dart: { ext: /\.dart$/, comment: /^\s*\/\//, test: /\b(?:test|testWidgets|blocTest)\s*(?:<[^>]*>)?\s*\(\s*['"]/, assertion: /\bexpect(?:Later)?\s*\(|\bverify(?:Never)?\s*\(/,
    skip: /\bskip\s*:\s*(?:true|['"])|\bsolo\s*:\s*true/, suppression: /\/\/\s*ignore(?:_for_file)?:/ },
  swift: { ext: /\.swift$/, comment: /^\s*\/\//, test: /\bfunc\s+test\w*\s*\(|@Test\b/, assertion: /\bXCTAssert\w*\s*\(|\bXCTFail\s*\(|#(?:expect|require)\s*\(/,
    skip: /\bXCTSkip(?:If|Unless)?\b|\.disabled\s*\(/, suppression: /\/\/\s*swiftlint:disable/ },
  cpp: { ext: /\.(?:c|cc|cpp|cxx|h|hh|hpp|hxx)$/, comment: /^\s*\/\//, test: /\b(?:TEST|TEST_F|TEST_P|TYPED_TEST|TEST_CASE|SCENARIO|BOOST_AUTO_TEST_CASE)\s*\(/,
    assertion: /\b(?:EXPECT|ASSERT|CHECK|REQUIRE|BOOST_CHECK|BOOST_REQUIRE)_?\w*\s*\(/, skip: /\bDISABLED_\w+|\bGTEST_SKIP\s*\(|\[!mayfail\]|\[\.\]/,
    suppression: /NOLINT(?:NEXTLINE|BEGIN)?\b|#pragma\s+(?:GCC|clang)\s+diagnostic\s+ignored|#pragma\s+warning\s*\(\s*disable|cppcheck-suppress/ }
};

export const languageOf = path => Object.entries(LANGUAGE_RULES).find(([, rule]) => rule.ext.test(path || ''))?.[0] || null;

/** A comment or string aimed at whoever judges the change: prompt injection for reviewers. */
export const REVIEWER_DIRECTED = /\b(?:reviewer|grader|judge|evaluator|LLM|language model|AI (?:reviewer|judge|assistant))\b.*\b(?:approve|pass|accept|met|ignore|correct|ok)\b/i;

/** Conditions in source code; a test's literal inside one is how a change special-cases the tests. */
export const CONDITIONAL = /\bif\b|\bcase\b|\bswitch\b|\bwhen\b|===?|!==?|\?\s*[^:]+:/;
export const LITERAL_STOPLIST = new Set(['true', 'false', 'null', 'undefined', 'none', 'test', 'error', 'value', 'name', 'type', 'data', 'string', 'number', 'object', 'utf8', 'utf-8', 'json', 'default', 'id', 'key', '200', '201', '204', '400', '401', '403', '404', '409', '422', '500']);

/** Severity of each kind at each level; `off` turns the guard off. Config overrides win, then the allow list. */
export const SEVERITY = {
  'protected-path-modified': { strict: 'block', standard: 'block' },
  'disputed-check-modified': { strict: 'block', standard: 'block' },
  'test-deleted': { strict: 'block', standard: 'block' },
  'test-count-decreased': { strict: 'block', standard: 'block' },
  'skip-or-only-added': { strict: 'block', standard: 'block' },
  'oracle-config-modified': { strict: 'block', standard: 'block' },
  'blast-radius-exceeded': { strict: 'block', standard: 'block' },
  'undeclared-test-modified': { strict: 'block', standard: 'warn' },
  'assertion-count-decreased': { strict: 'block', standard: 'warn' },
  'assertion-weakened': { strict: 'block', standard: 'warn' },
  'lint-or-type-suppression-added': { strict: 'block', standard: 'warn' },
  'test-literal-special-casing': { strict: 'warn', standard: 'warn' },
  'claim-mismatch': { strict: 'warn', standard: 'warn' },
  overclaim: { strict: 'warn', standard: 'warn' },
  'reviewer-directed-text': { strict: 'warn', standard: 'warn' },
  // From the ablation gate: a new test that passes without the change cannot fail.
  'vacuous-test': { strict: 'block', standard: 'warn' }
};
