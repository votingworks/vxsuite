import js from '@eslint/js';

// This config only covers the tooling files at the repo root (lint-staged
// runs `eslint` on staged files from the nearest .lintstagedrc directory, and
// ESLint 9 errors if no config is found). Workspace packages bring their own
// eslint.config.mjs, so ignore all subdirectories here.
export default [
  { ignores: ['*/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
];
