import { Meta } from '@storybook/react';

import {
  UnlockMachineScreen,
  UnlockkMachineScreenProps,
} from './unlock_machine_screen';

const initialProps: UnlockkMachineScreenProps = {
  // auth: Dipped.fakeCheckingPasscodeAuth(),
  auth: {
    status: 'checking_pin',
    user: {
      role: 'election_manager',
      electionHash: 'election-hash',
    },
    // wrongPasscodeEnteredAt: new Date(),
  },
  checkPin: () => true,
};

const meta: Meta<typeof UnlockMachineScreen> = {
  title: 'Organisms/UnlockMachineScreen',
  component: UnlockMachineScreen,
  args: initialProps,
};

export default meta;

export { UnlockMachineScreen };
