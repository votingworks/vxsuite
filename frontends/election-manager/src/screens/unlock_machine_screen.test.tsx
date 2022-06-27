import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dipped } from '@votingworks/test-utils';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { UnlockMachineScreen } from './unlock_machine_screen';

test('Unlock machine screen submits passcode', async () => {
  const fakeAuth = Dipped.fakeCheckingPasscodeAuth();
  renderInAppContext(<UnlockMachineScreen />, { auth: fakeAuth });
  screen.getByText('- - - - - -');

  userEvent.click(screen.getByText('0'));
  screen.getByText('• - - - - -');

  userEvent.click(screen.getByText('✖'));
  screen.getByText('- - - - - -');

  userEvent.click(screen.getByText('0'));
  screen.getByText('• - - - - -');

  userEvent.click(screen.getByText('1'));
  screen.getByText('• • - - - -');

  userEvent.click(screen.getByText('2'));
  screen.getByText('• • • - - -');

  userEvent.click(screen.getByText('3'));
  screen.getByText('• • • • - -');

  userEvent.click(screen.getByText('4'));
  screen.getByText('• • • • • -');

  userEvent.click(screen.getByText('⌫'));
  screen.getByText('• • • • - -');

  userEvent.click(screen.getByText('4'));
  screen.getByText('• • • • • -');

  userEvent.click(screen.getByText('5'));
  screen.getByText('• • • • • •');

  await waitFor(() =>
    expect(fakeAuth.checkPasscode).toHaveBeenNthCalledWith(1, '012345')
  );
  screen.getByText('- - - - - -');
});

test('If passcode is incorrect, error message is shown', () => {
  const fakeAuth = Dipped.fakeCheckingPasscodeAuth({
    passcodeError: 'wrong_passcode',
  });
  renderInAppContext(<UnlockMachineScreen />, { auth: fakeAuth });
  screen.getByText('Invalid code. Please try again.');
});
