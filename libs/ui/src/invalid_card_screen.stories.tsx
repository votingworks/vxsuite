import { Meta } from '@storybook/react';
import { InvalidCardScreen, Props } from './invalid_card_screen';

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
