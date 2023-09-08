import userEvent from '@testing-library/user-event';
import { electionGeneralDefinition as testElectionDefinition } from '@votingworks/fixtures';
import {
  fakeElectionManagerUser,
  fakeKiosk,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { err, ok, deferred } from '@votingworks/basics';
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
  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  // Click to backup, verify we got called.
  const backupButton = screen.getByText('Save Backup');
  expect(backup).not.toHaveBeenCalled();
  userEvent.click(backupButton);
  expect(backup).toHaveBeenCalledTimes(1);

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Saving Backup');
  screen.getByText('Saving…'); // text on the button itself

  // Trigger backup finished, verify back to normal.
  resolve(ok(['/media/usb-drive-sdb1/backup.zip']));
  await waitFor(() => screen.getByText('Save Backup'));
  expect(screen.queryAllByRole('alertdialog').length).toEqual(0);
});

test('"Delete Ballot Data" and Delete Election Data from VxCentralScan" disabled when canUnconfigure is falsy', () => {
  renderScreen({
    canUnconfigure: false,
  });

  expect(
    screen.getButton('Delete Election Data from VxCentralScan')
  ).toBeDisabled();

  expect(screen.getButton('Delete Ballot Data')).toBeDisabled();
});

test('clicking "Delete Election Data from VxCentralScan" calls backend', async () => {
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
  const backup = jest.fn<ReturnType<BackupFn>, Parameters<BackupFn>>();
  renderScreen({ backup });

  const { resolve, promise } = deferred<BackupResult>();
  backup.mockReturnValueOnce(promise);

  // Click to backup, verify we got called.
  const backupButton = screen.getByText('Save Backup');
  expect(backup).not.toHaveBeenCalled();
  userEvent.click(backupButton);
  expect(backup).toHaveBeenCalledTimes(1);

  // Verify progress message is shown.
  await screen.findByText('Saving…');

  // Trigger backup error, verify back to normal with error.
  resolve(err({ type: 'permission-denied', message: 'Permission Denied' }));
  await screen.findByText('Save Backup');
  screen.getByText('Permission Denied');
});

test('clicking "Update Date and Time" shows modal to set clock', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000Z'));
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

  jest.useRealTimers();
});
