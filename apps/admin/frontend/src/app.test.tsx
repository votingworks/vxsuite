import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { err } from '@votingworks/basics';
import {
  fakeElectionManagerUser,
  fakeKiosk,
  fakePrinterInfo,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library';

import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

import { mockCastVoteRecordFileRecord } from '../test/api_mock_data';
import { MARK_RESULTS_OFFICIAL_BUTTON_TEXT } from './components/mark_official_button';

jest.mock('@votingworks/ballot-encoder', () => {
  return {
    ...jest.requireActual('@votingworks/ballot-encoder'),
    // mock encoded ballot so BMD ballot QR code does not change with every change to election definition
    encodeBallot: () => new Uint8Array(),
  };
});

let mockKiosk!: jest.Mocked<KioskBrowser.Kiosk>;
let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-11-03T22:22:00'));

  Object.defineProperty(window, 'location', {
    writable: true,
    value: { assign: jest.fn() },
  });
  window.location.href = '/';

  mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  mockKiosk.getPrinterInfo.mockResolvedValue([
    fakePrinterInfo({ name: 'VxPrinter', connected: true }),
  ]);

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetUsbDriveStatus('no_drive');
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  jest.useRealTimers();
  delete window.kiosk;
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

  // expecting configure and resulting refetch
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  userEvent.click(screen.getByText(electionPackage.name));
  await screen.findAllByText(electionDefinition.election.title);

  // You can view the Settings screen and save log files
  fireEvent.click(screen.getByText('Settings'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No USB Drive Detected');
  apiMock.expectGetUsbDriveStatus('mounted');
  await screen.findByText('Save logs on the inserted USB drive?');

  fireEvent.click(screen.getByText('Election'));

  // remove the election
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetMachineConfig();
  fireEvent.click(screen.getByText('Unconfigure Machine'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getButton('Yes, Delete Election Data'));

  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  await screen.findByText('Select an election package to configure VxAdmin');
  await screen.findByText(
    'No election packages found on the inserted USB drive.'
  );

  // You can view the Settings screen and save log files when there is no election.
  fireEvent.click(screen.getByText('Settings'));
  await screen.findByText('Save Log File');
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('Save logs on the inserted USB drive?');
});

test('authentication works', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await screen.findByText('VxAdmin is Locked');

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
  await screen.findByText('VxAdmin is Locked');

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
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
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
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
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
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
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText('Remove card to unlock VxAdmin');

  // Machine is unlocked when card removed
  apiMock.setAuthStatus({
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  });
  await screen.findByText('Lock Machine');

  // Lock the machine
  apiMock.expectLogOut();
  fireEvent.click(screen.getByText('Lock Machine'));
  await apiMock.logOut();
});

test('marking results as official', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election } = electionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
  });

  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  // unofficial on reports screen
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetTotalBallotCount(0);
  userEvent.click(screen.getButton('Reports'));
  screen.getByRole('heading', { name: 'Unofficial Tally Reports' });
  screen.getByRole('heading', { name: 'Unofficial Ballot Count Reports' });

  // unofficial on report
  apiMock.expectGetResultsForTallyReports({ filter: {}, groupBy: {} }, [
    buildSimpleMockTallyReportResults({
      election,
      scannedBallotCount: 100,
    }),
  ]);
  apiMock.expectGetScannerBatches([]);
  userEvent.click(screen.getButton('Full Election Tally Report'));
  await screen.findByText(
    'Unofficial Mammal Party Example Primary Election Tally Report'
  );

  // mark results official
  userEvent.click(screen.getButton('Reports'));
  apiMock.expectMarkResultsOfficial();
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  });
  userEvent.click(screen.getButton(MARK_RESULTS_OFFICIAL_BUTTON_TEXT));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getButton(
      MARK_RESULTS_OFFICIAL_BUTTON_TEXT
    )
  );

  // official on reports screen
  await screen.findByRole('heading', { name: 'Official Tally Reports' });
  screen.getByRole('heading', { name: 'Official Ballot Count Reports' });

  // official on report
  userEvent.click(screen.getButton('Full Election Tally Report'));
  await screen.findByText(
    'Official Mammal Party Example Primary Election Tally Report'
  );
});

test('removing election resets cvr and manual data files', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  await apiMock.logOut();
  await apiMock.authenticateAsSystemAdministrator();

  // expect all data to be refetched on unconfigure
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.expectUnconfigure();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  fireEvent.click(screen.getButton('Election'));
  fireEvent.click(screen.getButton('Unconfigure Machine'));
  const modal = await screen.findByRole('alertdialog');
  fireEvent.click(within(modal).getButton('Yes, Delete Election Data'));
  await screen.findByText('Select an election package to configure VxAdmin');
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

  apiMock.expectGetManualResultsMetadata([
    {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      ballotCount: 100,
      createdAt: new Date().toISOString(),
    },
  ]);

  const { getByText, queryByText } = renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  fireEvent.click(getByText('Tally'));
  expect(
    (await screen.findByText('Load CVRs')).closest('button')
  ).toBeDisabled();
  expect(getByText('Remove CVRs').closest('button')).toBeDisabled();
  expect(getByText('Edit Manual Tallies').closest('button')).toBeDisabled();
  expect(getByText('Remove Manual Tallies').closest('button')).toBeDisabled();

  apiMock.expectDeleteAllManualResults();

  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetManualResultsMetadata([]);
  fireEvent.click(getByText('Clear All Results'));
  getByText(
    'Do you want to remove the 1 loaded CVR export and all manual tallies?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() => {
    expect(getByText('Load CVRs').closest('button')).toBeEnabled();
  });
  await waitFor(() => {
    expect(getByText('Add Manual Tallies').closest('button')).toBeEnabled();
  });

  expect(queryByText('Clear All Results')).not.toBeInTheDocument();

  getByText('No CVRs loaded.');
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
  apiMock.expectGetManualResultsMetadata([]);
  apiMock.expectGetTotalBallotCount(100);
  renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getButton('Election'));
  await screen.findByRole('heading', { name: 'Election' });

  userEvent.click(screen.getButton('Tally'));
  await screen.findByRole('heading', {
    name: 'Cast Vote Records (CVRs)',
  });

  userEvent.click(screen.getByText('Reports'));
  await screen.findByRole('heading', { name: 'Election Reports' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
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
  userEvent.click(screen.getButton('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getButton('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('system administrator UI has expected nav when no election', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([electionPackage]);
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getButton('Election'));
  await screen.findByRole('heading', { name: 'Election' });
  userEvent.click(screen.getButton('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();

  // Configure with an election definition and verify that previously hidden tabs appear
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([electionPackage]);
  userEvent.click(screen.getButton('Election'));
  await screen.findByRole('heading', { name: 'Election' });
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectConfigure(electionPackage.path);
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(screen.getByText(electionPackage.name));
  await screen.findAllByText(electionDefinition.election.title);
  screen.getByText('Smartcards');

  // Remove the election definition and verify that those same tabs disappear
  apiMock.expectListPotentialElectionPackagesOnUsbDrive([]);
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  userEvent.click(screen.getButton('Unconfigure Machine'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Yes, Delete Election Data' })
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await waitFor(() =>
    expect(screen.queryByText('Smartcards')).not.toBeInTheDocument()
  );
});

test('system administrator Smartcards screen navigation', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Create System Administrator Cards'));
  await screen.findByRole('heading', { name: 'System Administrator Cards' });
  userEvent.click(screen.getByText('Create Election Cards'));
  await screen.findByRole('heading', { name: 'Election Cards' });

  // The smartcard modal and smartcard programming flows are tested in smartcard_modal.test.tsx
});

test('election manager cannot auth onto unconfigured machine', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();

  await screen.findByText('VxAdmin is Locked');
  screen.getByText('Insert System Administrator card to unlock.');

  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_not_configured',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'This machine is unconfigured and cannot be unlocked with this card. ' +
      'Use a System Administrator card.'
  );
});

test('election manager cannot auth onto machine with different election hash', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await screen.findByText('VxAdmin is Locked');
  await screen.findByText(
    'Insert System Administrator or Election Manager card to unlock.'
  );
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'wrong_election',
    cardUserRole: 'election_manager',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine. ' +
      'Use a valid Election Manager or System Administrator card.'
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
  userEvent.click(screen.getByRole('button', { name: 'Format USB' }));

  // initial prompt to insert USB drive
  const initialModal = await screen.findByRole('alertdialog');
  await within(initialModal).findByText('No USB Drive Detected');

  // Format USB Drive that is already VotingWorks compatible
  apiMock.expectGetUsbDriveStatus('mounted');
  await screen.findByText('Format USB Drive');
  const formatModal = screen.getByRole('alertdialog');
  within(formatModal).getByText(/already VotingWorks compatible/);
  userEvent.click(
    within(formatModal).getByRole('button', { name: 'Format USB' })
  );
  await within(formatModal).findByText('Confirm Format USB Drive');
  apiMock.expectFormatUsbDrive();
  userEvent.click(
    within(formatModal).getByRole('button', { name: 'Format USB' })
  );

  apiMock.expectGetUsbDriveStatus('ejected');
  await screen.findByText('USB Drive Formatted');
  screen.getByText('USB Ejected');

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('No USB Drive Detected');

  // Format another USB, this time in an incompatible format
  apiMock.expectGetUsbDriveStatus('error');
  await screen.findByText('Format USB Drive');
  const incompatibleModal = screen.getByRole('alertdialog');
  within(incompatibleModal).getByText(/not VotingWorks compatible/);
  userEvent.click(
    within(incompatibleModal).getByRole('button', { name: 'Format USB' })
  );
  await within(incompatibleModal).findByText('Confirm Format USB Drive');
  apiMock.expectFormatUsbDrive();
  userEvent.click(
    within(incompatibleModal).getByRole('button', { name: 'Format USB' })
  );

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
  await screen.findByText('Format USB Drive');
  const errorModal = screen.getByRole('alertdialog');
  userEvent.click(
    within(errorModal).getByRole('button', { name: 'Format USB' })
  );
  await within(errorModal).findByText('Confirm Format USB Drive');
  userEvent.click(
    within(errorModal).getByRole('button', { name: 'Format USB' })
  );
  await within(errorModal).findByText('Failed to Format USB Drive');
  within(errorModal).getByText(/unable to format/);

  // Removing USB resets modal
  apiMock.expectGetUsbDriveStatus('no_drive');
  await screen.findByText('No USB Drive Detected');
});
