export default [{
  ignores: ['node_modules/**', 'dist/**', 'site/.vitepress/**'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' } },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-undef': 'error' }
}, {
  files: ['src/dashboard/ui/**/*.js'],
  languageOptions: { globals: { document: 'readonly', d: 'readonly', route: 'writable', render: 'readonly', fetch: 'readonly', location: 'readonly', setTimeout: 'readonly' } }
}];
