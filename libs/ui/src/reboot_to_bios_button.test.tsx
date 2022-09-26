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
  const { container } = render(
    <RebootToBiosButton logger={new Logger(LogSource.VxAdminFrontend)} />
  );
  // Initially should just contain the button
  expect(container).toMatchInlineSnapshot(`
    <div>
      <button
        class="sc-gsDJrp eHDFnB"
        type="button"
      >
        Reboot to BIOS
      </button>
    </div>
  `);

  userEvent.click(screen.getByText('Reboot to BIOS'));
  await screen.findByText(/Rebooting/);
  await waitFor(() =>
    expect(window.kiosk!.rebootToBios).toHaveBeenCalledTimes(1)
  );
});
