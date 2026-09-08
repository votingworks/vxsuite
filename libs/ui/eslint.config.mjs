import { react, ignores } from 'eslint-plugin-vx';
import storybook from 'eslint-plugin-storybook';

export default [
  { ignores: [...ignores.frontend, '.storybook/**', '.storybook-static/**'] },
  ...react,
  ...storybook.configs['flat/recommended'],
  {
    rules: {
      'vx/gts-jsdoc': 'off',
    },
  },
  {
    // Test-only interop shim. It lives in `src/` rather than `test/` because
    // `accessible_controllers/test_utils.tsx` is compiled into the build and so
    // cannot import from outside `rootDir`.
    files: ['src/user_event.ts'],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
];
