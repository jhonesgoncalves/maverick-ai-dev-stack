// A JUnit XML reader: every runner worth using can write one (`--reporter=junit`, `--junitxml`,
// `--test-reporter=junit`), so it is how Maverick learns the result of each test case, not
// only of each file. A small, forgiving regex parser: no dependency, no entity surprises.

const attr = (text, name) => text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const decode = value => String(value ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, '&');

/** `[{ name, classname, file, status: 'pass' | 'fail' | 'skip' }]` for each `<testcase>`. */
export function parseJunit(xml = '') {
  const cases = [];
  for (const match of String(xml).matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const [, attrs, body = ''] = match;
    const status = /<(failure|error)\b/.test(body) ? 'fail' : /<skipped\b/.test(body) ? 'skip' : 'pass';
    cases.push({ name: decode(attr(attrs, 'name')), classname: decode(attr(attrs, 'classname')), file: decode(attr(attrs, 'file')) || undefined, status });
  }
  return cases;
}
