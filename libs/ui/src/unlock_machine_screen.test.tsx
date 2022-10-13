import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dipped, mockOf } from '@votingworks/test-utils';
import { EnvironmentFlagName, isFeatureFlagEnabled } from '@votingworks/utils';
import React from 'react';
import { UnlockMachineScreen } from './unlock_machine_screen';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

test('Unlock machine screen submits passcode', async () => {
  const fakeAuth = Dipped.fakeCheckingPasscodeAuth();
  const { getByText } = render(<UnlockMachineScreen auth={fakeAuth} />);
  getByText('- - - - - -');

  userEvent.click(getByText('0'));
  getByText('• - - - - -');

  userEvent.click(getByText('✖'));
  getByText('- - - - - -');

  userEvent.click(getByText('0'));
  getByText('• - - - - -');

  userEvent.click(getByText('1'));
  getByText('• • - - - -');

  userEvent.click(getByText('2'));
  getByText('• • • - - -');

  userEvent.click(getByText('3'));
  getByText('• • • • - -');

  userEvent.click(getByText('4'));
  getByText('• • • • • -');

  userEvent.click(getByText('⌫'));
  getByText('• • • • - -');

  userEvent.click(getByText('4'));
  getByText('• • • • • -');

  userEvent.click(getByText('5'));
  getByText('• • • • • •');

  await waitFor(() =>
    expect(fakeAuth.checkPasscode).toHaveBeenNthCalledWith(1, '012345')
  );
  getByText('- - - - - -');
});

test('If passcode is incorrect, error message is shown', () => {
  const fakeAuth = Dipped.fakeCheckingPasscodeAuth({
    wrongPasscodeEnteredAt: new Date(),
  });
  const { getByText } = render(<UnlockMachineScreen auth={fakeAuth} />);
  getByText('Invalid code. Please try again.');
});

test('If SKIP_PIN_ENTRY flag is on in development, submits correct PIN immediately', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(
    (flag: EnvironmentFlagName) => {
      return flag === EnvironmentFlagName.SKIP_PIN_ENTRY;
    }
  );
  const fakeAuth = Dipped.fakeCheckingPasscodeAuth();
  render(<UnlockMachineScreen auth={fakeAuth} />);

  await waitFor(() =>
    expect(fakeAuth.checkPasscode).toHaveBeenNthCalledWith(
      1,
      fakeAuth.user.passcode
    )
  );
});
