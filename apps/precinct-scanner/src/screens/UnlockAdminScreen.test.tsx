import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnlockAdminScreen from './UnlockAdminScreen';

test('authentication', async () => {
  const attemptToAuthenticateUser = jest.fn();

  render(
    <UnlockAdminScreen attemptToAuthenticateUser={attemptToAuthenticateUser} />
  );
  screen.getByText('- - - - - -');

  // set up a failed attempt
  attemptToAuthenticateUser.mockReturnValueOnce(false);

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
    expect(attemptToAuthenticateUser).toHaveBeenNthCalledWith(1, '012345')
  );

  screen.getByText('Invalid code. Please try again.');

  // set up a successful attempt
  attemptToAuthenticateUser.mockReturnValueOnce(true);

  for (let i = 0; i < 6; i += 1) {
    userEvent.click(screen.getByText('0'));
  }

  await waitFor(() =>
    expect(attemptToAuthenticateUser).toHaveBeenNthCalledWith(2, '000000')
  );

  expect(screen.queryByText('Invalid code. Please try again.')).toBeNull();
});
