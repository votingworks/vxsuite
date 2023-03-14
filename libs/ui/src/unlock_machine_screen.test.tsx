import userEvent from '@testing-library/user-event';
import { fakeSystemAdministratorUser } from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import React from 'react';
import { render, screen, waitFor } from '../test/react_testing_library';
import { UnlockMachineScreen } from './unlock_machine_screen';

const checkingPinAuthStatus: DippedSmartCardAuth.CheckingPin = {
  status: 'checking_pin',
  user: fakeSystemAdministratorUser(),
};

test('PIN submission', async () => {
  const checkPin = jest.fn();
  render(
    <UnlockMachineScreen auth={checkingPinAuthStatus} checkPin={checkPin} />
  );
  screen.getByText('- - - - - -');

  userEvent.click(screen.getButton('0'));
  screen.getByText('• - - - - -');

  userEvent.click(screen.getButton('clear'));
  screen.getByText('- - - - - -');

  userEvent.click(screen.getButton('0'));
  screen.getByText('• - - - - -');

  userEvent.click(screen.getButton('1'));
  screen.getByText('• • - - - -');

  userEvent.click(screen.getButton('2'));
  screen.getByText('• • • - - -');

  userEvent.click(screen.getButton('3'));
  screen.getByText('• • • • - -');

  userEvent.click(screen.getButton('4'));
  screen.getByText('• • • • • -');

  userEvent.click(screen.getButton('backspace'));
  screen.getByText('• • • • - -');

  userEvent.click(screen.getButton('4'));
  screen.getByText('• • • • • -');

  userEvent.click(screen.getButton('5'));
  await waitFor(() => expect(checkPin).toHaveBeenNthCalledWith(1, '012345'));
  screen.getByText('- - - - - -');
});

test('Invalid PIN', () => {
  const checkPin = jest.fn();
  render(
    <UnlockMachineScreen
      auth={{
        ...checkingPinAuthStatus,
        wrongPinEnteredAt: new Date(),
      }}
      checkPin={checkPin}
    />
  );
  screen.getByText('Invalid PIN. Please try again.');
});

test('Error checking PIN', () => {
  const checkPin = jest.fn();
  render(
    <UnlockMachineScreen
      auth={{
        ...checkingPinAuthStatus,
        error: true,
        wrongPinEnteredAt: new Date(),
      }}
      checkPin={checkPin}
    />
  );
  screen.getByText('Error checking PIN. Please try again.');
});
