import { react, ignores } from 'eslint-plugin-vx';

export default [
  { ignores: [...ignores.frontend, 'types/**'] },
  ...react,
  {
    rules: {
      'vx/gts-identifiers': [
        'error',
        {
          allowedNames: [
            'HStack',
            'VStack',
            'setXScaleValue',
            'setYScaleValue',
          ],
        },
      ],
      'vx/gts-jsdoc': 'off',
    },
  },
];
