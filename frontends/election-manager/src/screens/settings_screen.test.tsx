import MockDate from 'mockdate';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { screen, waitFor, within } from '@testing-library/react';

import { renderInAppContext } from '../../test/render_in_app_context';
import { SettingsScreen } from './settings_screen';

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  MockDate.set('2022-06-22T00:00:00.000Z');
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
});

test('Setting current date and time', async () => {
  renderInAppContext(<SettingsScreen />);

  screen.getByRole('heading', { name: 'Current Date and Time' });
  const startDateTime = 'Wed, Jun 22, 2022, 12:00 AM UTC';
  screen.getByText(startDateTime);

  // Clock setting is tested fully in libs/ui/src/set_clock.test.tsx
  userEvent.click(screen.getByRole('button', { name: 'Update Date and Time' }));
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('Wed, Jun 22, 2022, 12:00 AM');
  userEvent.selectOptions(within(modal).getByTestId('selectYear'), '2023');
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(mockKiosk.setClock).toHaveBeenCalledWith({
      isoDatetime: '2023-06-22T00:00:00.000+00:00',
      // eslint-disable-next-line vx/gts-identifiers
      IANAZone: 'UTC',
    });
  });

  // Date and time are reset to system time after save to kiosk-browser
  screen.getByText(startDateTime);
});

test('Rebooting from USB', async () => {
  renderInAppContext(<SettingsScreen />);

  screen.getByRole('heading', { name: 'Software Update' });

  // Rebooting from USB is tested fully in libs/ui/src/reboot_from_usb_button.test.tsx
  userEvent.click(screen.getByRole('button', { name: 'Reboot from USB' }));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'No USB Drive Detected' });
  userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
});

test('Rebooting to BIOS', () => {
  renderInAppContext(<SettingsScreen />);

  screen.getByRole('heading', { name: 'Software Update' });

  // Rebooting to BIOS is tested in libs/ui/src/reboot_to_bios_button.test.tsx
  screen.getByText('Reboot to BIOS');
});
