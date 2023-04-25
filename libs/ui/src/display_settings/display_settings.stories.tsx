import { Meta } from '@storybook/react';

import { DisplaySettings } from '.';

const meta: Meta<typeof DisplaySettings> = {
  title: 'libs-ui/DisplaySettings',
  component: DisplaySettings,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

export { DisplaySettings };
