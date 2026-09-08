import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};

import { VoterSettings } from './index.js';

const meta: Meta<typeof VoterSettings> = {
  title: 'libs-ui/VoterSettings',
  component: VoterSettings,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

export { VoterSettings };
