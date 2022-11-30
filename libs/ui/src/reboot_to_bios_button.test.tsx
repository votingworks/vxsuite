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
    .c0 {
      display: inline-block;
      border: none;
      border-radius: 0.25em;
      box-shadow: 0 0 0 0 rgba(71,167,75,1);
      box-sizing: border-box;
      background: rgb(211,211,211);
      cursor: pointer;
      padding: 0.75em 1em;
      text-align: center;
      line-height: 1.25;
      color: black;
      touch-action: manipulation;
    }

    .c0:hover,
    .c0:active {
      outline: none;
    }

    <div>
      <button
        class="c0"
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
