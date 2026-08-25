import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { LoadingAnimation } from './loading_animation';

const meta: Meta<typeof LoadingAnimation> = {
  title: 'libs-ui/Images',
  component: LoadingAnimation,
};

export default meta;

export { LoadingAnimation };
