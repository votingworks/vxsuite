import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
import { render, screen, waitFor } from '@testing-library/react';

import { RebootToBiosButton } from './reboot_to_bios_button';

beforeEach(() => {
  window.kiosk = fakeKiosk();
});

test('renders as expected.', async () => {
  render(<RebootToBiosButton logger={new Logger(LogSource.VxAdminFrontend)} />);

  userEvent.click(screen.getByText('Reboot to BIOS'));
  await screen.findByText(/Rebooting/);
  await waitFor(() =>
    expect(window.kiosk!.rebootToBios).toHaveBeenCalledTimes(1)
  );
});
