import type { Meta } from '@storybook/react-vite' with {
  'resolution-mode': 'import',
};
import { InvalidCardScreen, Props } from './invalid_card_screen.js';

const args: Props = {
  reasonAndContext: {
    reason: 'wrong_election',
  },
};

const meta: Meta<typeof InvalidCardScreen> = {
  title: 'libs-ui/InvalidCardScreen',
  component: InvalidCardScreen,
  args,
};

export default meta;

export { InvalidCardScreen };
