import { Meta } from '@storybook/react';

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
