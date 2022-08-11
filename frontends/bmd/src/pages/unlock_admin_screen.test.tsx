import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inserted } from '@votingworks/test-utils';
import { UnlockAdminScreen } from './unlock_admin_screen';

test('authentication', async () => {
  const auth = Inserted.fakeCheckingPasscodeAuth();
  render(<UnlockAdminScreen auth={auth} />);
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

  await waitFor(() =>
    expect(auth.checkPasscode).toHaveBeenNthCalledWith(1, '012345')
  );
  screen.getByText('- - - - - -');
});

test('If passcode is incorrect, error message is shown', () => {
  const auth = Inserted.fakeCheckingPasscodeAuth({
    wrongPasscodeEnteredAt: new Date(),
  });
  render(<UnlockAdminScreen auth={auth} />);
  screen.getByText('Invalid code. Please try again.');
});

test('Hides focus outlines', () => {
  const auth = Inserted.fakeCheckingPasscodeAuth();
  render(<UnlockAdminScreen auth={auth} />);
  expect(document.querySelector('.hide-focus-outlines')).toBeInTheDocument();
});
