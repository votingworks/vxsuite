import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import {
  hasTextAcrossElements,
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { constructElectionKey, formatElectionHashes } from '@votingworks/types';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';

import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

import {
  mockCastVoteRecordFileRecord,
  mockManualResultsMetadata,
} from '../test/api_mock_data';
import { MARK_RESULTS_OFFICIAL_BUTTON_TEXT } from './components/mark_official_button';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-11-03T22:22:00'));

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: jest.fn() },
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
  jest.useRealTimers();
  apiMock.assertComplete();
});

const electionPackage = {
  name: 'election-package.zip',
  path: '/election-package.zip',
} as const;

test('configuring with an election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([electionPackage]);

  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  await screen.findByRole('heading', { name: 'Election' });
  screen.getByText('Select an election package to configure VxAdmin');

  // expecting configure and resulting refetch
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  userEvent.click(screen.getByText(electionPackage.name));
  await screen.findAllByText(electionDefinition.election.title);
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
  await screen.findByText('No USB Drive Detected');
  apiMock.expectGetUsbDriveStatus('mounted');
  await screen.findByText('Select a log format:');

  fireEvent.click(screen.getByText('Election'));

  // remove the election
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();
  fireEvent.click(screen.getByText('Unconfigure Machine'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getButton('Delete All Election Data'));

  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  await screen.findByText('Select an election package to configure VxAdmin');
  await screen.findByText(
    'No election packages found on the inserted USB drive.'
  );

  // You can view the Settings screen and save logs when there is no election.
  fireEvent.click(screen.getByText('Settings'));
  await screen.findByText('Save Logs');
  fireEvent.click(screen.getByText('Save Logs'));
  await screen.findByText('Select a log format:');
});

test('authentication works', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const electionKey = constructElectionKey(electionDefinition.election);
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await screen.findByText('VxAdmin Locked');

  // Disconnect card reader
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'no_card_reader',
  });
  await screen.findByText('Card Reader Not Detected');
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxAdmin Locked');

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
  });
  await screen.findByText('Enter the card PIN');
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
  await screen.findByText('Incorrect PIN. Please try again.');

  // Remove card and insert an invalid card, e.g. a pollworker card.
  await apiMock.logOut();
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'user_role_not_allowed',
  });
  await screen.findByText('Invalid Card');
  await apiMock.logOut();

  // Insert election manager card and enter correct PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: mockElectionManagerUser({ electionKey }),
  });
  await screen.findByText('Enter the card PIN');
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
  await screen.findByText('Remove card to unlock VxAdmin');

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: mockElectionManagerUser({ electionKey }),
    sessionExpiresAt: mockSessionExpiresAt(),
  });
  await screen.findByText('Lock Machine');

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
  await waitFor(() => {
    expect(markOfficialButton).toBeEnabled();
  });
  userEvent.click(markOfficialButton);
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getButton(
      MARK_RESULTS_OFFICIAL_BUTTON_TEXT
    )
  );

  // official on reports screen
  await screen.findByRole('heading', { name: 'Official Tally Reports' });
  screen.getByRole('heading', { name: 'Official Ballot Count Reports' });
});

test('unconfiguring clears all cached data', async () => {
  let { electionDefinition } = electionTwoPartyPrimaryFixtures;
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
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getButton('Delete All Election Data'));
  await screen.findByText('Select an election package to configure VxAdmin');

  // Reconfigure with a different election
  electionDefinition = electionFamousNames2021Fixtures.electionDefinition;
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(screen.getByText(electionPackage.name));
  await screen.findAllByText(electionDefinition.election.title);

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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
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
  await screen.findByText('Election Results are Official');
  expect(screen.getButton('Load CVRs')).toBeDisabled();
  expect(screen.getButton('Remove All CVRs')).toBeDisabled();

  apiMock.expectDeleteAllManualResults();
  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(screen.getButton('Remove All Tallies'));
  const confirmModal = await screen.findByRole('alertdialog');
  userEvent.click(within(confirmModal).getButton('Remove All Tallies'));

  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(
    screen.queryByText('Election Results Marked as Official')
  ).not.toBeInTheDocument();
  expect(screen.getButton('Load CVRs')).toBeEnabled();
  screen.getByText('No CVRs loaded.');
});

test('can not view or print ballots', async () => {
  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;

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
  await screen.findByRole('heading', { name: 'Election' });

  userEvent.click(screen.getButton('Tally'));
  await screen.findByRole('heading', { name: 'Tally' });

  userEvent.click(screen.getByText('Reports'));
  await screen.findByRole('heading', { name: 'Election Reports' });
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
  await screen.findByRole('heading', { name: 'Election' });
  userEvent.click(screen.getButton('Smart Cards'));
  await screen.findByRole('heading', { name: 'Smart Cards' });
  userEvent.click(screen.getButton('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('election manager cannot auth onto unconfigured machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();

  await screen.findByText('VxAdmin Locked');
  screen.getByText('Insert system administrator card to unlock.');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Use a system administrator card.'
  );
});

test('election manager cannot auth onto machine with different election', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await screen.findByText('VxAdmin Locked');
  await screen.findByText(
    'Insert system administrator or election manager card to unlock.'
  );
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'The inserted election manager card is programmed for another election ' +
      'and cannot be used to unlock this machine. ' +
      'Use a valid election manager or system administrator card.'
  );
});

test('usb formatting flows', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
  });
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // navigate to modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('USB Formatting');
  userEvent.click(screen.getButton('Format USB Drive'));

  // initial prompt to insert USB drive
  const initialModal = await screen.findByRole('alertdialog');
  await within(initialModal).findByText('No USB Drive Detected');

  // Format USB Drive that is already compatible
  apiMock.expectGetUsbDriveStatus('mounted');
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  const formatModal = screen.getByRole('alertdialog');
  within(formatModal).getByText(/already compatible/);
  apiMock.expectFormatUsbDrive();
  userEvent.click(within(formatModal).getButton('Format USB Drive'));
  apiMock.expectGetUsbDriveStatus('ejected');
  await screen.findByText('USB Drive Formatted');
  screen.getByText('USB Ejected');

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('No USB Drive Detected');

  // Format another USB, this time in an incompatible format
  apiMock.expectGetUsbDriveStatus('error');
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  const incompatibleModal = screen.getByRole('alertdialog');
  within(incompatibleModal).getByText(/not compatible/);
  apiMock.expectFormatUsbDrive();
  userEvent.click(within(incompatibleModal).getButton('Format USB Drive'));
  apiMock.expectGetUsbDriveStatus('ejected');
  await screen.findByText('USB Drive Formatted');
  screen.getByText('USB Ejected');

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('No USB Drive Detected');
  // Error handling
  apiMock.expectGetUsbDriveStatus('error');
  apiMock.apiClient.formatUsbDrive
    .expectCallWith()
    .resolves(err(new Error('unable to format')));
  await screen.findByRole('heading', { name: 'Format USB Drive' });
  const errorModal = screen.getByRole('alertdialog');
  userEvent.click(within(errorModal).getButton('Format USB Drive'));
  await within(errorModal).findByText('Failed to Format USB Drive');
  within(errorModal).getByText(/unable to format/);

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('No USB Drive Detected');
});

test('battery display and alert', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  apiMock.expectListPotentialElectionPackagesOnUsbDrive();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // initial battery level in nav bar
  await screen.findByText('100%');

  apiMock.setBatteryInfo({ level: 0.1, discharging: true });
  const warning = await screen.findByRole('alertdialog');
  within(warning).getByText('Low Battery Warning');

  // updated battery level in nav bar
  await screen.findByText('10%');
});

test('vendor screen', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  renderApp();

  await apiMock.authenticateAsVendor();
  await screen.findButton('Reboot to Vendor Menu');
  const lockMachineButton = screen.getButton('Lock Machine');

  // Test "Lock Machine" button
  apiMock.expectLogOut();
  userEvent.click(lockMachineButton);
  apiMock.setAuthStatus({ status: 'logged_out', reason: 'machine_locked' });
  await screen.findByText('VxAdmin Locked');

  // Test "Reboot to Vendor Menu" button
  await apiMock.authenticateAsVendor();
  const rebootButton = await screen.findButton('Reboot to Vendor Menu');
  apiMock.expectRebootToVendorMenu();
  userEvent.click(rebootButton);
});
