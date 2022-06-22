import React from 'react';
import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { screen } from '@testing-library/react';

import { LogsScreen } from './logs_screen';
import { renderInAppContext } from '../../test/render_in_app_context';

let mockKiosk: jest.Mocked<KioskBrowser.Kiosk>;

beforeEach(() => {
  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
});

test('Exporting logs', async () => {
  renderInAppContext(<LogsScreen />);

  userEvent.click(await screen.findByText('Export Log File'));
  // Modal is tested fully in src/components/export_logs_modal.test.tsx
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));

  userEvent.click(await screen.findByText('Export Log File as CDF'));
  // Modal is tested fully in src/components/export_logs_modal.test.tsx
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));
});

test('Exporting logs when no election definition', async () => {
  renderInAppContext(<LogsScreen />, { electionDefinition: 'NONE' });

  userEvent.click(await screen.findByText('Export Log File'));
  // Modal is tested fully in src/components/export_logs_modal.test.tsx
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));

  expect(
    (await screen.findByText('Export Log File as CDF')).closest('button')
  ).toHaveAttribute('disabled');
});
