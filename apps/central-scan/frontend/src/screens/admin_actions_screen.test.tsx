import userEvent from '@testing-library/user-event';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeKiosk,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { err, ok, deferred } from '@votingworks/basics';
import MockDate from 'mockdate';
import { act } from 'react-dom/test-utils';
import { createMemoryHistory } from 'history';
import { screen, waitFor, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import {
  AdminActionScreenProps,
  AdminActionsScreen,
} from './admin_actions_screen';
import {
  createMockApiClient,
  MockApiClient,
  setAuthStatus,
} from '../../test/api';

let mockApiClient: MockApiClient;

beforeEach(() => {
  mockApiClient = createMockApiClient();
  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: testElectionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
});

afterEach(() => {
  mockApiClient.assertComplete();
});

type BackupFn = AdminActionScreenProps['backup'];
type BackupResult = BackupFn extends () => Promise<infer R> ? R : never;

function renderScreen(
  props: Partial<AdminActionScreenProps> = {},
  history = createMemoryHistory()
) {
  return renderInAppContext(
    <AdminActionsScreen
      hasBatches={false}
      backup={jest.fn()}
      canUnconfigure={false}
      isTestMode={false}
      electionDefinition={testElectionDefinition}
      {...props}
    />,
    { apiClient: mockApiClient, history }
  );
}

test('clicking "Save Backup" shows progress', async () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = screen.getByText('Save Backup');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress modal is shown.
    await waitFor(() => {
      const modal = screen.getByRole('alertdialog');
      within(modal).getByText('Saving Backup');
      screen.getByText('Saving…');
    });

    // Trigger backup finished, verify back to normal.
    resolve(ok(['/media/usb-drive-sdb1/backup.zip']));
    await waitFor(() => screen.getByText('Save Backup'));
    expect(screen.queryAllByRole('alertdialog').length).toEqual(0);
  });
});

test('"Delete Ballot Data" and Delete Election Data from VxCentralScan" disabled when canUnconfigure is falsy', () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  renderScreen({
    canUnconfigure: false,
  });

  expect(
    screen.getButton('Delete Election Data from VxCentralScan')
  ).toBeDisabled();

  expect(screen.getButton('Delete Ballot Data')).toBeDisabled();
});

test('clicking "Delete Election Data from VxCentralScan" calls backend', async () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderScreen({ canUnconfigure: true }, history);

  // initial button
  userEvent.click(screen.getButton('Delete Election Data from VxCentralScan'));

  // first confirmation
  screen.getByText('Delete all election data?');
  userEvent.click(await screen.findButton('Yes, Delete Election Data'));

  // second confirmation
  mockApiClient.unconfigure
    .expectCallWith({ ignoreBackupRequirement: false })
    .resolves();
  screen.getByText('Are you sure?');
  userEvent.click(
    await screen.findButton('I am sure. Delete all election data.')
  );

  // progress message
  await screen.findByText('Deleting election data');

  // we are redirected to the dashboard
  expect(history.location.pathname).toEqual('/');
});

test('clicking "Delete Ballot Data" calls backend', async () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  const history = createMemoryHistory({ initialEntries: ['/admin'] });
  renderScreen({ canUnconfigure: true }, history);

  // initial button
  userEvent.click(screen.getButton('Delete Ballot Data'));

  // confirmation
  mockApiClient.clearBallotData.expectCallWith().resolves();
  screen.getByText('Delete All Scanned Ballot Data?');
  userEvent.click(await screen.findButton('Yes, Delete Ballot Data'));

  // progress message
  await screen.findByText('Deleting ballot data');

  // we are redirected to the dashboard
  expect(history.location.pathname).toEqual('/');
});

test('backup error shows message', async () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = screen.getByText('Save Backup');
    expect(backup).not.toHaveBeenCalled();
    backupButton.click();
    expect(backup).toHaveBeenCalledTimes(1);

    // Verify progress message is shown.
    await waitFor(() => screen.getByText('Saving…'));

    // Trigger backup error, verify back to normal with error.
    resolve(err({ type: 'permission-denied', message: 'Permission Denied' }));
    await waitFor(() => screen.getByText('Save Backup'));
    await waitFor(() => screen.getByText('Permission Denied'));
  });
});

test('override mark thresholds button shows when there are no overrides', async () => {
  const testCases = [
    {
      hasBatches: true,
      markThresholds: null,
      expectedText: 'Override Mark Thresholds',
      expectButtonDisabled: true,
    },
    {
      hasBatches: true,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds',
      expectButtonDisabled: true,
    },
    {
      hasBatches: false,
      markThresholds: null,
      expectedText: 'Override Mark Thresholds',
      expectButtonDisabled: false,
    },
    {
      hasBatches: false,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds',
      expectButtonDisabled: false,
    },
  ];

  for (const testCase of testCases) {
    mockApiClient.getMarkThresholdOverrides
      .expectCallWith()
      .resolves(testCase.markThresholds);
    const { unmount } = renderScreen({
      hasBatches: testCase.hasBatches,
    });
    const button = await screen.findButton(testCase.expectedText);
    expect(button.hasAttribute('disabled')).toEqual(
      testCase.expectButtonDisabled
    );
    unmount();
  }
});

test('clicking "Update Date and Time" shows modal to set clock', async () => {
  mockApiClient.getMarkThresholdOverrides.expectCallWith().resolves(null);

  MockDate.set('2020-10-31T00:00:00.000Z');
  window.kiosk = fakeKiosk();

  renderScreen();

  screen.getByRole('heading', { name: 'Admin Actions' });

  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getByRole('button', { name: 'Update Date and Time' }));

  // Open modal
  const modal = screen.getByRole('alertdialog');
  within(modal).getByText('Sat, Oct 31, 2020, 12:00 AM');

  // Change date
  const selectYear = screen.getByTestId('selectYear');
  userEvent.selectOptions(selectYear, '2025');

  // Save date
  mockApiClient.logOut.expectCallWith().resolves();
  userEvent.click(within(modal).getByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(window.kiosk?.setClock).toHaveBeenCalledWith({
      isoDatetime: '2025-10-31T00:00:00.000+00:00',
      // eslint-disable-next-line vx/gts-identifiers
      IANAZone: 'UTC',
    });
  });
});
