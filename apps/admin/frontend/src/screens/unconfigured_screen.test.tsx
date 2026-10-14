import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { mockKiosk } from '@votingworks/test-utils';
import { deferred, err } from '@votingworks/basics';
import { BooleanEnvironmentVariableName } from '@votingworks/utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { screen, waitFor, within } from '../../test/react_testing_library.js';

import { UnconfiguredScreen } from './unconfigured_screen.js';
import { createQueryClient } from '../api.js';
import {
  type ApiMock,
  createApiMock,
} from '../../test/helpers/mock_api_client.js';

const featureFlagMock = vi.hoisted(() => {
  // eslint-disable-next-line global-require
  const { getFeatureFlagMock } = require('@votingworks/utils');
  return getFeatureFlagMock();
});
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let apiMock: ApiMock;

beforeEach(() => {
  vi.unstubAllEnvs();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE
  );
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
  featureFlagMock.resetFeatureFlags();
});

test('prompts user to insert USB drive', async () => {
  apiMock.apiClient.listPotentialElectionPackagesOnUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'no-entity', message: 'No USB drive found' }));
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('no_drive'),
  });

  await screen.findByRole('heading', { name: 'Election' });
  screen.getByText('Insert a USB drive containing an election package');
});

test('handles no election packages on USB drive', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election' });
  screen.getByText('No election packages found on the inserted USB drive.');
  screen.getButton('Select Other File...');
});

test('configures from election packages on USB drive', async () => {
  const electionPackages = [
    {
      path: '/election-package-1.zip',
      name: 'election-package-1.zip',
      ctime: new Date('2023-01-01T00:00:00.000'),
    },
    {
      path: '/election-package-2.zip',
      name: 'election-package-2.zip',
      ctime: new Date('2023-01-01T01:00:00.000'),
    },
  ];
  apiMock.expectListPotentialElectionPackagesOnUsbDrive(electionPackages);

  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election' });
  screen.getByText('Select an election package to configure VxAdmin');
  const rows = screen.getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(
    within(rows[0]!)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
  ).toEqual(['File Name', 'Created At', '']);
  expect(
    within(rows[1]!)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual(['election-package-1.zip', '01/01/2023 12:00:00 AM', '']);
  expect(
    within(rows[2]!)
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual(['election-package-2.zip', '01/01/2023 01:00:00 AM', '']);

  apiMock.expectConfigure(electionPackages[0]!.path);
  userEvent.click(screen.getByText('election-package-1.zip'));
  await vi.waitFor(() => apiMock.assertComplete());
});

test('configures from selected file', async () => {
  const kiosk = mockKiosk(vi.fn);
  window.kiosk = kiosk;
  kiosk.showOpenDialog.mockResolvedValueOnce({
    canceled: false,
    filePaths: ['/path/to/election-package.zip'],
  });

  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election' });

  apiMock.expectConfigure('/path/to/election-package.zip');
  userEvent.click(screen.getButton('Select Other File...'));
  await vi.waitFor(() => apiMock.assertComplete());
  expect(kiosk.showOpenDialog).toHaveBeenCalledWith({
    properties: ['openFile'],
    filters: [{ name: '', extensions: ['zip'] }],
  });
});

test('allows configuring from json in development', async () => {
  vi.stubEnv('NODE_ENV', 'development');

  const kiosk = mockKiosk(vi.fn);
  window.kiosk = kiosk;
  kiosk.showOpenDialog.mockResolvedValueOnce({
    canceled: false,
    filePaths: ['/path/to/election-definition.json'],
  });

  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election' });

  apiMock.expectConfigure('/path/to/election-definition.json');
  userEvent.click(screen.getButton('Select Other File...'));
  await vi.waitFor(() => apiMock.assertComplete());
  expect(kiosk.showOpenDialog).toHaveBeenCalledWith({
    properties: ['openFile'],
    filters: [{ name: '', extensions: ['zip', 'json'] }],
  });
});

test('shows configuration error', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([
    {
      path: '/election-package.zip',
      name: 'election-package.zip',
    },
  ]);
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await screen.findByRole('heading', { name: 'Election' });

  apiMock.apiClient.configure
    .expectCallWith({ electionFilePath: '/election-package.zip' })
    .resolves(
      err({
        type: 'invalid-zip',
        message: 'Bad zip',
      })
    );
  userEvent.click(screen.getByText('election-package.zip'));
  await screen.findByText('Invalid election package zip file.');

  apiMock.apiClient.configure
    .expectCallWith({ electionFilePath: '/election-package.zip' })
    .resolves(
      err({
        type: 'invalid-election',
        message: 'Bad election',
      })
    );
  userEvent.click(screen.getByText('election-package.zip'));
  await screen.findByText('Invalid election definition file.');

  apiMock.apiClient.configure
    .expectCallWith({ electionFilePath: '/election-package.zip' })
    .resolves(
      err({
        type: 'invalid-system-settings',
        message: 'Bad system settings',
      })
    );
  userEvent.click(screen.getByText('election-package.zip'));
  await screen.findByText('Invalid system settings file.');

  apiMock.apiClient.configure
    .expectCallWith({ electionFilePath: '/election-package.zip' })
    .resolves(
      err({
        type: 'invalid-metadata',
        message: 'Bad metatdata',
      })
    );
  userEvent.click(screen.getByText('election-package.zip'));
  await screen.findByText('Invalid metadata file.');
});

test('has Restore from Backup button when no USB drive inserted', async () => {
  const queryClient = createQueryClient();
  apiMock.apiClient.listPotentialElectionPackagesOnUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'no-entity', message: 'No USB drive found' }));
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    queryClient,
    usbDriveStatus: mockUsbDriveStatus('no_drive'),
  });
  await screen.findByText('Insert a USB drive containing an election package');

  userEvent.click(screen.getButton('Restore from Backup...'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Enter Restore Mode');
  within(modal).getByText(
    'VxAdmin will restart in Restore Mode, where you can select a backup to restore from.'
  );

  const reboot = deferred<void>();
  apiMock.apiClient.rebootInRestoreMode
    .expectCallWith()
    .returns(reboot.promise);
  userEvent.click(within(modal).getButton('Restart in Restore Mode'));
  await waitFor(() =>
    expect(within(modal).getButton('Restart in Restore Mode')).toBeDisabled()
  );
  expect(within(modal).getButton('Cancel')).toBeDisabled();

  reboot.resolve();
  await waitFor(() => expect(queryClient.isMutating()).toEqual(0));
  expect(within(modal).getButton('Restart in Restore Mode')).toBeDisabled();
  expect(within(modal).getButton('Cancel')).toBeDisabled();
});

test('has Restore from Backup button with election package list', async () => {
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });
  await screen.findByText(
    'No election packages found on the inserted USB drive.'
  );

  userEvent.click(screen.getButton('Restore from Backup...'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(within(modal).getButton('Cancel'));
  await vi.waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('hides Restore from Backup when backup and restore are disabled', async () => {
  featureFlagMock.resetFeatureFlags();
  apiMock.apiClient.listPotentialElectionPackagesOnUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'no-entity', message: 'No USB drive found' }));
  renderInAppContext(<UnconfiguredScreen />, {
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('no_drive'),
  });
  await screen.findByText('Insert a USB drive containing an election package');
  expect(
    screen.queryByRole('button', { name: 'Restore from Backup...' })
  ).not.toBeInTheDocument();
});
