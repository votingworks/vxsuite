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

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getByText('Save CDF Log File'));
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));
});

test('Exporting logs when no election definition', async () => {
  renderInAppContext(<LogsScreen />, { electionDefinition: 'NONE' });

  // Log saving is tested fully in src/components/export_logs_modal.test.tsx
  userEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  userEvent.click(screen.getByText('Close'));

  expect(
    screen.getByText('Save CDF Log File').closest('button')
  ).toHaveAttribute('disabled');
});
