import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { fakeKiosk } from '@votingworks/test-utils';
import { Logger, LogSource } from '@votingworks/logging';
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
        class="sc-gsDJrp dmKzwC"
        type="button"
      >
        Reboot to BIOS
      </button>
    </div>
  `);
  fireEvent.click(screen.getByText('Reboot to BIOS'));
  await screen.findByText('Rebooting…');
});
