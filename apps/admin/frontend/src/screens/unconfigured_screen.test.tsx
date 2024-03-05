import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { err } from '@votingworks/basics';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { renderInAppContext } from '../../test/render_in_app_context';
import { screen, waitFor, within } from '../../test/react_testing_library';

import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { UnconfiguredScreen } from './unconfigured_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('prompts user to insert USB drive', async () => {
  apiMock.apiClient.listPotentialElectionPackagesOnUsbDrive
    .expectCallWith()
    .resolves(err({ type: 'no-usb-drive' }));
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
    within(rows[0])
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
  ).toEqual(['File Name', 'Created At']);
  expect(
    within(rows[1])
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual(['election-package-1.zip', '01/01/2023 12:00:00 AM']);
  expect(
    within(rows[2])
      .getAllByRole('cell')
      .map((td) => td.textContent)
  ).toEqual(['election-package-2.zip', '01/01/2023 01:00:00 AM']);

  apiMock.expectConfigure(electionPackages[0].path);
  userEvent.click(screen.getByText('election-package-1.zip'));
  await waitFor(() => apiMock.assertComplete());
});

test('configures from selected file', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.showOpenDialog.mockResolvedValueOnce({
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
  await waitFor(() => apiMock.assertComplete());
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
