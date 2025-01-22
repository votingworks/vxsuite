import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import {
  hasTextAcrossElements,
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { constructElectionKey, formatElectionHashes } from '@votingworks/types';
import { fireEvent, screen, within } from '../test/react_testing_library';

import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

import {
  mockCastVoteRecordFileRecord,
  mockManualResultsMetadata,
} from '../test/api_mock_data';
import { MARK_RESULTS_OFFICIAL_BUTTON_TEXT } from './components/mark_official_button';

vi.setConfig({
  testTimeout: 10_000,
});

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2020-11-03T22:22:00'));

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: vi.fn() },
  });
  window.location.href = '/';

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.setPrinterStatus();
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionPackage = {
  name: 'election-package.zip',
  path: '/election-package.zip',
} as const;

test('configuring with an election definition', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([electionPackage]);

  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  await vi.waitFor(() => screen.getByRole('heading', { name: 'Election' }));
  screen.getByText('Select an election package to configure VxAdmin');

  // expecting configure and resulting refetch
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  userEvent.click(screen.getByText(electionPackage.name));
  await vi.waitFor(() =>
    screen.getAllByText(electionDefinition.election.title)
  );
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // You can view the Settings screen and save logs
  fireEvent.click(screen.getByText('Settings'));
  fireEvent.click(screen.getByText('Save Logs'));
  await vi.waitFor(() => screen.getByText('No USB Drive Detected'));
  apiMock.expectGetUsbDriveStatus('mounted');
  await vi.waitFor(() => screen.getByText('Select a log format:'));

  fireEvent.click(screen.getByText('Election'));

  // remove the election
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();
  fireEvent.click(screen.getByText('Unconfigure Machine'));
  const modal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  fireEvent.click(within(modal).getButton('Delete All Election Data'));

  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  await vi.waitFor(() =>
    screen.getByText('Select an election package to configure VxAdmin')
  );
  await vi.waitFor(() =>
    screen.getByText('No election packages found on the inserted USB drive.')
  );

  // You can view the Settings screen and save logs when there is no election.
  fireEvent.click(screen.getByText('Settings'));
  await vi.waitFor(() => screen.getByText('Save Logs'));
  fireEvent.click(screen.getByText('Save Logs'));
  await vi.waitFor(() => screen.getByText('Select a log format:'));
});

test('authentication works', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const electionKey = constructElectionKey(electionDefinition.election);
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await vi.waitFor(() => screen.getByText('VxAdmin Locked'));

  // Disconnect card reader
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  await vi.waitFor(() => screen.getByText('Card Reader Not Detected'));
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await vi.waitFor(() => screen.getByText('VxAdmin Locked'));

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
  });
  await vi.waitFor(() => screen.getByText('Enter Card PIN'));
  apiMock.expectCheckPin('111111');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('1'));
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
    wrongPinEnteredAt: new Date(),
  });
  await vi.waitFor(() => screen.getByText('Incorrect PIN. Please try again.'));

  // Remove card and insert an invalid card, e.g. a pollworker card.
  await apiMock.logOut();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await vi.waitFor(() => screen.getByText('Invalid Card'));
  await apiMock.logOut();

  // Insert election manager card and enter correct PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
  });
  await vi.waitFor(() => screen.getByText('Enter Card PIN'));
  apiMock.expectCheckPin('123456');
  fireEvent.click(screen.getByText('1'));
  fireEvent.click(screen.getByText('2'));
  fireEvent.click(screen.getByText('3'));
  fireEvent.click(screen.getByText('4'));
  fireEvent.click(screen.getByText('5'));
  fireEvent.click(screen.getByText('6'));

  // 'Remove Card' screen is shown after successful authentication.
  apiMock.setAuthStatus({
    status: 'remove_card',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await vi.waitFor(() => screen.getByText('Remove card to unlock VxAdmin'));

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await vi.waitFor(() => screen.getByText('Lock Machine'));

  // Lock the machine
  apiMock.expectLogOut();
  fireEvent.click(screen.getByText('Lock Machine'));
  await apiMock.logOut();
});

test('marking results as official', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: false,
  });

  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  // unofficial on reports screen
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetTotalBallotCount(1000);
  userEvent.click(screen.getButton('Reports'));
  screen.getByRole('heading', { name: 'Unofficial Tally Reports' });
  screen.getByRole('heading', { name: 'Unofficial Ballot Count Reports' });

  // mark results official
  userEvent.click(screen.getButton('Reports'));
  apiMock.expectMarkResultsOfficial();
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  const markOfficialButton = screen.getButton(
    MARK_RESULTS_OFFICIAL_BUTTON_TEXT
  );
  await vi.waitFor(() => {
    expect(markOfficialButton).toBeEnabled();
  });
  userEvent.click(markOfficialButton);
  userEvent.click(
    within(await vi.waitFor(() => screen.getByRole('alertdialog'))).getButton(
      MARK_RESULTS_OFFICIAL_BUTTON_TEXT
    )
  );

  // official on reports screen
  await vi.waitFor(() =>
    screen.getByRole('heading', { name: 'Official Tally Reports' })
  );
  screen.getByRole('heading', { name: 'Official Ballot Count Reports' });
});

test('unconfiguring clears all cached data', async () => {
  let electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  // Go to the manual tallies screen
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetManualResultsMetadata(mockManualResultsMetadata);
  userEvent.click(screen.getButton('Tally'));
  userEvent.click(screen.getByRole('tab', { name: 'Manual Tallies' }));

  await apiMock.logOut();
  await apiMock.authenticateAsSystemAdministrator();

  // expect all data to be refetched on unconfigure
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([electionPackage]);
  apiMock.expectUnconfigure();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  fireEvent.click(screen.getButton('Election'));
  fireEvent.click(screen.getButton('Unconfigure Machine'));
  const modal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  fireEvent.click(within(modal).getButton('Delete All Election Data'));
  await vi.waitFor(() =>
    screen.getByText('Select an election package to configure VxAdmin')
  );

  // Reconfigure with a different election
  electionDefinition = electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(screen.getByText(electionPackage.name));
  await vi.waitFor(() =>
    screen.getAllByText(electionDefinition.election.title)
  );

  await apiMock.logOut();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  // Manual tallies reset
  // Note that this test of manual tally data specifically is a regression
  // test. The manual tally screen would crash if cached data from the previous
  // election was used while the new data was being fetched, since it expects
  // the manual tally data to match the current election. This test ensures
  // that we clear cached data on unconfigure, not just invalidate it.
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetManualResultsMetadata([
    {
      ...mockManualResultsMetadata[0],
      precinctId: electionDefinition.election.precincts[0].id,
      ballotStyleGroupId: electionDefinition.election.ballotStyles[0].groupId,
    },
  ]);
  userEvent.click(screen.getButton('Tally'));
  userEvent.click(screen.getByRole('tab', { name: 'Manual Tallies' }));
});

test('clearing results', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  apiMock.expectGetCastVoteRecordFiles([
    { ...mockCastVoteRecordFileRecord, numCvrsImported: 3000 },
  ]);
  apiMock.expectGetCastVoteRecordFileMode('test');

  renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getByText('Tally'));
  await vi.waitFor(() => screen.getByText('Election Results are Official'));
  await vi.waitFor(() => expect(screen.getButton('Load CVRs')).toBeDisabled());
  await vi.waitFor(() =>
    expect(screen.getButton('Remove All CVRs')).toBeDisabled()
  );

  apiMock.expectDeleteAllManualResults();
  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(screen.getButton('Remove All Tallies'));
  const confirmModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  userEvent.click(within(confirmModal).getButton('Remove All Tallies'));

  await vi.waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Election Results Marked as Official')
    ).not.toBeInTheDocument();
    expect(screen.getButton('Load CVRs')).toBeEnabled();
  });
  screen.getByText('No CVRs loaded.');
});

test('can not view or print ballots', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireHudsonFixtures.readElectionDefinition();

  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();
  expect(
    within(screen.getByRole('navigation')).queryByRole('button', {
      name: 'Ballots',
    })
  ).not.toBeInTheDocument();

  await apiMock.logOut();
  await apiMock.authenticateAsElectionManager(electionDefinition);
  screen.getByText('Save Election Package');
});

test('election manager UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetTotalBallotCount(100);
  renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getButton('Election'));
  await vi.waitFor(() => screen.getByRole('heading', { name: 'Election' }));

  userEvent.click(screen.getButton('Tally'));
  await vi.waitFor(() => screen.getByRole('heading', { name: 'Tally' }));

  userEvent.click(screen.getByText('Reports'));
  await vi.waitFor(() =>
    screen.getByRole('heading', { name: 'Election Reports' })
  );
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Smart Cards')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
});

test('system administrator UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getButton('Election'));
  await vi.waitFor(() => screen.getByRole('heading', { name: 'Election' }));
  userEvent.click(screen.getButton('Smart Cards'));
  await vi.waitFor(() => screen.getByRole('heading', { name: 'Smart Cards' }));
  userEvent.click(screen.getButton('Settings'));
  await vi.waitFor(() => screen.getByRole('heading', { name: 'Settings' }));
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('election manager cannot auth onto unconfigured machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();

  await vi.waitFor(() => screen.getByText('VxAdmin Locked'));
  screen.getByText('Insert system administrator card to unlock.');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  await vi.waitFor(() => screen.getByText('Invalid Card'));
  await vi.waitFor(() =>
    screen.getByText(
      'This machine is unconfigured and cannot be unlocked with this card. ' +
        'Use a system administrator card.'
    )
  );
});

test('election manager cannot auth onto machine with different election', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await vi.waitFor(() => screen.getByText('VxAdmin Locked'));
  await vi.waitFor(() =>
    screen.getByText(
      'Insert system administrator or election manager card to unlock.'
    )
  );
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await vi.waitFor(() => screen.getByText('Invalid Card'));
  await vi.waitFor(() =>
    screen.getByText(
      'The inserted election manager card is programmed for another election ' +
        'and cannot be used to unlock this machine. ' +
        'Use a valid election manager or system administrator card.'
    )
  );
});

test('usb formatting flows', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition:
      electionFamousNames2021Fixtures.readElectionDefinition(),
  });
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // navigate to modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('USB Formatting');
  userEvent.click(screen.getButton('Format USB Drive'));

  // initial prompt to insert USB drive
  const initialModal = await vi.waitFor(() => screen.getByRole('alertdialog'));
  await vi.waitFor(() =>
    within(initialModal).getByText('No USB Drive Detected')
  );

  // Format USB Drive that is already compatible
  apiMock.expectGetUsbDriveStatus('mounted');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() =>
    screen.getByRole('heading', { name: 'Format USB Drive' })
  );
  const formatModal = screen.getByRole('alertdialog');
  within(formatModal).getByText(/already compatible/);
  apiMock.expectFormatUsbDrive();
  userEvent.click(within(formatModal).getButton('Format USB Drive'));
  apiMock.expectGetUsbDriveStatus('ejected');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() => screen.getByText('USB Drive Formatted'));
  await vi.waitFor(() => screen.getByText('USB Ejected'));

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() => screen.getByText('No USB Drive Detected'));

  // Format another USB, this time in an incompatible format
  apiMock.expectGetUsbDriveStatus('error');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() =>
    screen.getByRole('heading', { name: 'Format USB Drive' })
  );
  const incompatibleModal = screen.getByRole('alertdialog');
  within(incompatibleModal).getByText(/not compatible/);
  apiMock.expectFormatUsbDrive();
  userEvent.click(within(incompatibleModal).getButton('Format USB Drive'));
  apiMock.expectGetUsbDriveStatus('ejected');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() => screen.getByText('USB Drive Formatted'));
  screen.getByText('USB Ejected');

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() => screen.getByText('No USB Drive Detected'));
  // Error handling
  apiMock.expectGetUsbDriveStatus('error');
  apiMock.apiClient.formatUsbDrive
    .expectCallWith()
    .resolves(err(new Error('unable to format')));
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() =>
    screen.getByRole('heading', { name: 'Format USB Drive' })
  );
  const errorModal = screen.getByRole('alertdialog');
  userEvent.click(within(errorModal).getButton('Format USB Drive'));
  await vi.waitFor(() =>
    within(errorModal).getByText('Failed to Format USB Drive')
  );
  within(errorModal).getByText(/unable to format/);

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await vi.runOnlyPendingTimersAsync();
  await vi.waitFor(() => screen.getByText('No USB Drive Detected'));
});

test('battery display and alert', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  apiMock.expectListPotentialElectionPackagesOnUsbDrive();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // initial battery level in nav bar
  await vi.waitFor(() => screen.getByText('100%'));

  apiMock.setBatteryInfo({ level: 0.1, discharging: true });
  await vi.runOnlyPendingTimersAsync();
  const warning = await vi.waitFor(() => screen.getByRole('alertdialog'));
  within(warning).getByText('Low Battery Warning');

  // updated battery level in nav bar
  await vi.waitFor(() => screen.getByText('10%'));
});

test('vendor screen', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  renderApp();

  await apiMock.authenticateAsVendor();
  await vi.waitFor(() => screen.getButton('Reboot to Vendor Menu'));
  const lockMachineButton = screen.getButton('Lock Machine');

  // Test "Lock Machine" button
  apiMock.expectLogOut();
  userEvent.click(lockMachineButton);
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await vi.waitFor(() => screen.getByText('VxAdmin Locked'));

  // Test "Reboot to Vendor Menu" button
  await apiMock.authenticateAsVendor();
  const rebootButton = await vi.waitFor(() =>
    screen.getButton('Reboot to Vendor Menu')
  );
  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});
