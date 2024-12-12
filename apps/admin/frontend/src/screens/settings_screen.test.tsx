import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, constructElectionKey } from '@votingworks/types';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '../../test/react_testing_library';

import {
  eitherNeitherElectionDefinition,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { SettingsScreen } from './settings_screen';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2022-06-22T00:00:00.000'));
  apiMock = createApiMock();
});

afterEach(() => {
  vi.useRealTimers();
  apiMock.assertComplete();
});

describe('as System Admin', () => {
  const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

  test('Setting current date and time', async () => {
    renderInAppContext(<SettingsScreen />, { apiMock, auth });

    screen.getByRole('heading', { name: 'Date and Time' });

    // Clock setting is tested fully in libs/ui/src/set_clock.test.tsx
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    const modal = screen.getByRole('alertdialog');
    within(modal).getByText('Wed, Jun 22, 2022, 12:00 AM AKDT');
    userEvent.selectOptions(within(modal).getByTestId('selectYear'), '2023');
    apiMock.apiClient.setClock
      .expectCallWith({
        isoDatetime: '2023-06-22T00:00:00.000-08:00',
        ianaZone: 'America/Anchorage',
      })
      .resolves();
    apiMock.expectLogOut();
    userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
    await waitForElementToBeRemoved(screen.queryByRole('alertdialog'));
  });

  test('Exporting logs', async () => {
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    });

    apiMock.apiClient.exportLogsToUsb
      .expectCallWith({ format: 'vxf' })
      .resolves(ok());

    // Log saving is tested fully in src/components/export_logs_modal.test.tsx
    userEvent.click(screen.getButton('Save Logs'));
    await screen.findByText('Select a log format:');
    userEvent.click(screen.getButton('Save'));
    userEvent.click(await screen.findButton('Close'));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
});

describe('as election manager', () => {
  const auth: DippedSmartCardAuth.ElectionManagerLoggedIn = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(
        eitherNeitherElectionDefinition.election
      ),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };

  test('Date and time', () => {
    renderInAppContext(<SettingsScreen />, { apiMock, auth });
    screen.getByRole('heading', { name: 'Date and Time' });
    userEvent.click(screen.getByRole('button', { name: 'Set Date and Time' }));
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Clock setting is tested fully in libs/ui/src/set_clock.test.tsx

    // Shouldn't have System-Admin-only sections
    expect(
      screen.queryByRole('heading', { name: 'Software Update' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'USB Formatting' })
    ).not.toBeInTheDocument();
  });

  test('Exporting logs', async () => {
    renderInAppContext(<SettingsScreen />, {
      apiMock,
      auth,
      usbDriveStatus: mockUsbDriveStatus('mounted'),
    });

    apiMock.apiClient.exportLogsToUsb
      .expectCallWith({ format: 'vxf' })
      .resolves(ok());

    // Log saving is tested fully in src/components/export_logs_modal.test.tsx
    userEvent.click(screen.getButton('Save Logs'));
    await screen.findByText('Select a log format:');
    userEvent.click(screen.getButton('Save'));
    userEvent.click(await screen.findButton('Close'));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
  });
});
