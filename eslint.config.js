export default [{
  ignores: ['node_modules/**', 'dist/**', 'site/.vitepress/**'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { console: 'readonly', process: 'readonly' } },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-undef': 'error' }
}];
