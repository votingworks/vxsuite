import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dipped,
  fakeSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/shared';
import React from 'react';
import { UnlockMachineScreen } from './unlock_machine_screen';

jest.mock('@votingworks/shared', (): typeof import('@votingworks/shared') => {
  return {
    ...jest.requireActual('@votingworks/shared'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockReset();
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
    (flag: BooleanEnvironmentVariableName) => {
      return flag === BooleanEnvironmentVariableName.SKIP_PIN_ENTRY;
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

test('Uses checkPin prop if auth object has no checkPasscode method', async () => {
  const auth: DippedSmartCardAuth.CheckingPin = {
    status: 'checking_passcode',
    user: fakeSystemAdministratorUser(),
  };
  const checkPin = jest.fn();
  render(<UnlockMachineScreen auth={auth} checkPin={checkPin} />);

  userEvent.click(screen.getByText('1'));
  userEvent.click(screen.getByText('2'));
  userEvent.click(screen.getByText('3'));
  userEvent.click(screen.getByText('4'));
  userEvent.click(screen.getByText('5'));
  userEvent.click(screen.getByText('6'));
  await waitFor(() => expect(checkPin).toHaveBeenNthCalledWith(1, '123456'));
});

test(
  'Uses checkPin prop if auth object has no checkPasscode method, ' +
    'when SKIP_PIN_ENTRY flag is on in development',
  async () => {
    mockOf(isFeatureFlagEnabled).mockImplementation(
      (flag: BooleanEnvironmentVariableName) => {
        return flag === BooleanEnvironmentVariableName.SKIP_PIN_ENTRY;
      }
    );
    const auth: DippedSmartCardAuth.CheckingPin = {
      status: 'checking_passcode',
      user: fakeSystemAdministratorUser(),
    };
    const checkPin = jest.fn();
    render(<UnlockMachineScreen auth={auth} checkPin={checkPin} />);

    await waitFor(() => expect(checkPin).toHaveBeenNthCalledWith(1, '123456'));
  }
);
