/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.cjs'],
  rules: {
    // Context modules export their own hook alongside the provider, and a
    // few UI modules export a typed column builder. Those are deliberate;
    // anything else exported from a component file is still flagged.
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true, allowExportNames: ['useAuth', 'useScope', 'ROLES', 'moneyColumn'] },
    ],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    // This app routes with wouter. A `<Link>` from react-router-dom needs a
    // Router context that does not exist here, so it throws and the screen
    // renders as an error card instead. Four screens shipped that way before
    // this rule existed, including Liquidity Risk and IRRBB.
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'react-router-dom',
        message: 'This app routes with wouter. Import Link, useLocation and Redirect from "wouter".',
      }],
    }],
  },
  overrides: [
    {
      // The engine is the part that must never reach for I/O. Enforce it.
      files: ['src/engine/**/*.ts'],
      rules: {
        'no-restricted-globals': ['error',
          { name: 'fetch', message: 'engine/ must be pure — no I/O. Take data as an argument.' },
          { name: 'localStorage', message: 'engine/ must be pure — no I/O.' },
          { name: 'indexedDB', message: 'engine/ must be pure — no I/O.' },
        ],
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@/store/*', '@/components/*', '@/context/*', 'react', 'dexie'],
              message: 'engine/ must be pure — it may not import store, UI or React.' },
          ],
        }],
      },
    },
    { files: ['**/*.test.ts', '**/*.test.tsx'], env: { node: true } },
  ],
};
