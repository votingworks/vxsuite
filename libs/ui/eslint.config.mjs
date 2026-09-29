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
    // Test helpers, published as `@votingworks/ui/test-utils`.
    files: [
      'src/user_event.ts',
      'src/test_utils.ts',
      'src/themes/render_with_themes.tsx',
    ],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.stories.{ts,tsx}',
      'src/**/test_utils.{ts,tsx}',
      'src/setupTests.ts',
      'src/user_event.ts',
      'src/themes/render_with_themes.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(test_utils|user_event|render_with_themes)\\.js$',
              message: 'Test helpers belong in `@votingworks/ui/test-utils`.',
            },
          ],
        },
      ],
    },
  },
];
