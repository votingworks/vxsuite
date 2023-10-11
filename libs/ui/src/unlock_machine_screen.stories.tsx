import { Meta, StoryObj } from '@storybook/react';
import React from 'react';

import {
  UnlockMachineScreen,
  UnlockMachineScreenProps,
} from './unlock_machine_screen';
import { SECURITY_PIN_LENGTH } from './globals';
import { PinLength } from './utils/pin_length';

type PropsAndCustomArgs = React.ComponentProps<typeof UnlockMachineScreen> & {
  minPinLength: number;
  maxPinLength: number;
};

const initialProps: PropsAndCustomArgs = {
  auth: {
    user: {
      role: 'election_manager',
      electionHash: 'deadbeef',
      jurisdiction: 'jxn',
    },
    status: 'checking_pin',
  },
  checkPin: async () => {},
  minPinLength: SECURITY_PIN_LENGTH.min,
  maxPinLength: SECURITY_PIN_LENGTH.max,
};

const meta: Meta<UnlockMachineScreenProps> = {
  title: 'libs-ui/UnlockMachineScreen',
  component: UnlockMachineScreen,
  args: initialProps,
  argTypes: {
    minPinLength: {
      control: {
        type: 'range',
        min: 1,
        max: 10,
        step: 1,
      },
    },
    maxPinLength: {
      control: {
        type: 'range',
        min: 1,
        max: 10,
        step: 1,
      },
    },
    pinLength: {
      if: { global: 'showPinLength', exists: true },
    },
  },
};

export default meta;

export const Primary: StoryObj<PropsAndCustomArgs> = {
  render: ({ minPinLength, maxPinLength, ...rest }) => (
    <UnlockMachineScreen
      {...rest}
      pinLength={PinLength.range(minPinLength, maxPinLength)}
    />
  ),
};
