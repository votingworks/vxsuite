import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeSystemAdministratorUser, mockOf } from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import React from 'react';
import { UnlockMachineScreen } from './unlock_machine_screen';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: jest.fn(),
  };
});

const checkingPinAuthStatus: DippedSmartCardAuth.CheckingPin = {
  status: 'checking_passcode',
  user: fakeSystemAdministratorUser(),
};

beforeEach(() => {
  mockOf(isFeatureFlagEnabled).mockReset();
});

test('Unlock machine screen submits passcode', async () => {
  const checkPin = jest.fn();
  const { getByText } = render(
    <UnlockMachineScreen auth={checkingPinAuthStatus} checkPin={checkPin} />
  );
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

  await waitFor(() => expect(checkPin).toHaveBeenNthCalledWith(1, '012345'));
  getByText('- - - - - -');
});

test('If passcode is incorrect, error message is shown', () => {
  const checkPin = jest.fn();
  const { getByText } = render(
    <UnlockMachineScreen
      auth={{
        ...checkingPinAuthStatus,
        wrongPasscodeEnteredAt: new Date(),
      }}
      checkPin={checkPin}
    />
  );
  getByText('Invalid code. Please try again.');
});

test('If SKIP_PIN_ENTRY flag is on in development, submits correct PIN immediately', async () => {
  mockOf(isFeatureFlagEnabled).mockImplementation(
    (flag: BooleanEnvironmentVariableName) => {
      return flag === BooleanEnvironmentVariableName.SKIP_PIN_ENTRY;
    }
  );
  const checkPin = jest.fn();
  render(
    <UnlockMachineScreen auth={checkingPinAuthStatus} checkPin={checkPin} />
  );

  await waitFor(() =>
    expect(checkPin).toHaveBeenNthCalledWith(
      1,
      checkingPinAuthStatus.user.passcode
    )
  );
});
