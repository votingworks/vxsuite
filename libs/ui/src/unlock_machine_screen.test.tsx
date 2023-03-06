import userEvent from '@testing-library/user-event';
import { fakeSystemAdministratorUser } from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import React from 'react';
import { render, waitFor } from '../test/react_testing_library';
import { UnlockMachineScreen } from './unlock_machine_screen';

const checkingPinAuthStatus: DippedSmartCardAuth.CheckingPin = {
  status: 'checking_pin',
  user: fakeSystemAdministratorUser(),
};

test('Unlock machine screen submits pin', async () => {
  const checkPin = jest.fn();
  const { getButton, getByText } = render(
    <UnlockMachineScreen auth={checkingPinAuthStatus} checkPin={checkPin} />
  );
  getByText('- - - - - -');

  userEvent.click(getButton('0'));
  getByText('• - - - - -');

  userEvent.click(getButton('clear'));
  getByText('- - - - - -');

  userEvent.click(getButton('0'));
  getByText('• - - - - -');

  userEvent.click(getButton('1'));
  getByText('• • - - - -');

  userEvent.click(getButton('2'));
  getByText('• • • - - -');

  userEvent.click(getButton('3'));
  getByText('• • • • - -');

  userEvent.click(getButton('4'));
  getByText('• • • • • -');

  userEvent.click(getButton('backspace'));
  getByText('• • • • - -');

  userEvent.click(getButton('4'));
  getByText('• • • • • -');

  userEvent.click(getButton('5'));

  await waitFor(() => expect(checkPin).toHaveBeenNthCalledWith(1, '012345'));
  getByText('- - - - - -');
});

test('If PIN is incorrect, error message is shown', () => {
  const checkPin = jest.fn();
  const { getByText } = render(
    <UnlockMachineScreen
      auth={{
        ...checkingPinAuthStatus,
        wrongPinEnteredAt: new Date(),
      }}
      checkPin={checkPin}
    />
  );
  getByText('Invalid PIN. Please try again.');
});
