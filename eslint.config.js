export default [{
  // Global ignores: build output, VitePress cache, and the vendored brand kit (source assets, not app code)
  // and the NestJS sample, which has its own TypeScript lint setup.
  ignores: ['node_modules/**', 'dist/**', 'site/.vitepress/**', 'maverick-ai-brandkit/**', 'examples/nestjs-orders-api/**']
}, {
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' } },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }], 'no-undef': 'error' }
}, {
  files: ['src/lens/ui/**/*.js'],
  languageOptions: { globals: { document: 'readonly', window: 'readonly', d: 'writable', route: 'writable', render: 'readonly', fetch: 'readonly', location: 'readonly', history: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', navigator: 'readonly', localStorage: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly', EventSource: 'readonly', EventTarget: 'readonly', CustomEvent: 'readonly' } }
}];
