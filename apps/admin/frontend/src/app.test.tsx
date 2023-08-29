import userEvent from '@testing-library/user-event';
import fetchMock from 'fetch-mock';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireHudsonFixtures,
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { deferred, typedAs } from '@votingworks/basics';
import {
  advanceTimers,
  expectPrint,
  expectPrintToMatchSnapshot,
  fakeElectionManagerUser,
  fakeKiosk,
  fakePrinterInfo,
  fakeSessionExpiresAt,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import { LogEventId } from '@votingworks/logging';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  fireEvent,
  screen,
  waitFor,
  act,
  within,
} from '../test/react_testing_library';

import { eitherNeitherElectionDefinition } from '../test/render_in_app_context';
import { VxFiles } from './lib/converters';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/api_mock';
import { expectReportsScreenCardCountQueries } from '../test/helpers/api_expect_helpers';

import { mockCastVoteRecordFileRecord } from '../test/api_mock_data';
import { getSimpleMockTallyResults } from '../test/helpers/mock_results';

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
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  apiMock = createApiMock();
  // Set default auth status to logged out.
  apiMock.setAuthStatus({
    status: 'logged_out',
    reason: 'machine_locked',
  });
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();

  fetchMock.reset();
  fetchMock.get(
    '/convert/election/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );
});

afterEach(() => {
  jest.useRealTimers();
  delete window.kiosk;
  apiMock.assertComplete();
});

test('configuring with a demo election definition', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);

  const { getByText } = renderApp();

  await apiMock.authenticateAsSystemAdministrator();
  await screen.findByText('Load Demo Election Definition');

  // expecting configure and resulting refetch
  apiMock.expectConfigure(
    electionDefinition.electionData,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
  );
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  fireEvent.click(screen.getByText('Load Demo Election Definition'));

  await screen.findByText('Election Definition');

  // You can view the Logs screen and save log files when there is an election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save CDF Log File'));
  await screen.findByText('No Log File Present');

  fireEvent.click(getByText('Definition'));

  fireEvent.click(getByText('View Definition JSON'));

  // remove the election
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  fireEvent.click(getByText('Remove'));
  fireEvent.click(getByText('Remove Election Definition'));

  await screen.findByText('Configure VxAdmin');

  // You can view the Logs screen and save log files when there is no election.
  fireEvent.click(screen.getByText('Logs'));
  fireEvent.click(screen.getByText('Save Log File'));
  await screen.findByText('No Log File Present');
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByText('Save CDF Log File'));
  // You can not save as CDF when there is no election.
  expect(screen.queryAllByText('No Log File Present')).toHaveLength(0);

  userEvent.click(screen.getByText('Definition'));
  await screen.findByText('Load Demo Election Definition');
});

test('authentication works', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp, hardware } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();

  await screen.findByText('VxAdmin is Locked');

  // Disconnect card reader
  act(() => hardware.setCardReaderConnected(false));
  await screen.findByText('Card Reader Not Detected');
  act(() => hardware.setCardReaderConnected(true));
  await screen.findByText('VxAdmin is Locked');

  // Insert an election manager card and enter the wrong PIN.
  apiMock.setAuthStatus({
    status: 'checking_pin',
    user: fakeElectionManagerUser({
      electionHash: eitherNeitherElectionDefinition.electionHash,
    }),
  });
  await screen.findByText('Enter the card PIN to unlock.');
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
  await screen.findByText('Enter the card PIN to unlock.');
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
  await screen.findByText('Remove card to continue.');

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

test('L&A (logic and accuracy) flow', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp, logger } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
  });
  apiMock.expectGetCastVoteRecordFileMode('unlocked');

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getByText('L&A'));

  // Test printing L&A package
  userEvent.click(await screen.findButton('List Precinct L&A Packages'));
  userEvent.click(await screen.findButton('Print District 5'));

  // L&A package: Tally report
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckTallyReportPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  advanceTimers(5);

  // L&A package: BMD test deck
  await screen.findByText('Printing L&A Package for District 5', {
    exact: false,
  });
  await expectPrintToMatchSnapshot();
  await waitFor(() =>
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.TestDeckPrinted,
      expect.any(String),
      expect.anything()
    )
  );
  expect(logger.log).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.objectContaining({
      message: expect.stringContaining('BMD paper ballot test deck'),
    })
  );
  advanceTimers(30);

  // Test printing full test deck tally
  userEvent.click(screen.getByText('L&A'));
  const fullTestDeckButton = screen
    .getByText('Print Full Test Deck Tally Report')
    .closest('button')!;
  await waitFor(() => {
    expect(fullTestDeckButton).toBeEnabled();
  });
  userEvent.click(fullTestDeckButton);

  const expectedTallies: { [tally: string]: number } = {
    '104': 12,
    '52': 12,
    '24': 6,
    '12': 4,
    '8': 3,
    '4': 2,
  };
  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText(
      'Test Deck Mock General Election Choctaw 2020 Tally Report'
    );
    for (const [tally, times] of Object.entries(expectedTallies)) {
      expect(printedElement.getAllByText(tally).length).toEqual(times);
    }
    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.TestDeckTallyReportPrinted,
    expect.any(String),
    expect.anything()
  );
});

test('marking results as official', async () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  const { election } = electionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
  });
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.expectGetResultsForTallyReports({ filter: {} }, [
    getSimpleMockTallyResults({
      election,
      scannedBallotCount: 100,
      cardCountsByParty: {},
    }),
  ]);
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetManualResultsMetadata([]);
  expectReportsScreenCardCountQueries({ apiMock, isPrimary: true });
  renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  userEvent.click(screen.getButton('Reports'));
  userEvent.click(screen.getButton('Unofficial Full Election Tally Report'));
  await screen.findByText('Unofficial Example Primary Election Tally Report');

  apiMock.expectMarkResultsOfficial();
  apiMock.expectGetCurrentElectionMetadata({
    electionDefinition,
    isOfficialResults: true,
  }); // check refetch
  await waitFor(() => {
    expect(screen.getButton('Mark Tally Results as Official')).toBeEnabled();
  });
  userEvent.click(screen.getButton('Mark Tally Results as Official'));
  userEvent.click(
    within(await screen.findByRole('alertdialog')).getButton(
      'Mark Tally Results as Official'
    )
  );
  await screen.findByText('Official Example Primary Election Tally Report');
});

test('removing election resets cvr and manual data files', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });

  const { getByText } = renderApp();

  await apiMock.authenticateAsElectionManager(electionDefinition);

  await apiMock.logOut();
  await apiMock.authenticateAsSystemAdministrator();

  // expect all data to be refetched on unconfigure
  apiMock.expectUnconfigure();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  fireEvent.click(getByText('Definition'));
  fireEvent.click(getByText('Remove Election'));
  fireEvent.click(getByText('Remove Election Definition'));
  await screen.findByText('Configure VxAdmin');
});

test('clearing results', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
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
    (await screen.findByText('Load CVR Files')).closest('button')
  ).toBeDisabled();
  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(
    getByText('Edit Manually Entered Results').closest('button')
  ).toBeDisabled();
  expect(
    getByText('Remove Manually Entered Results').closest('button')
  ).toBeDisabled();

  apiMock.expectDeleteAllManualResults();

  apiMock.expectClearCastVoteRecordFiles();
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetManualResultsMetadata([]);
  fireEvent.click(getByText('Clear All Tallies and Results'));
  getByText(
    'Do you want to remove the 1 loaded CVR file and the manually entered data?'
  );
  fireEvent.click(getByText('Remove All Data'));

  await waitFor(() => {
    expect(getByText('Load CVR Files').closest('button')).toBeEnabled();
  });
  await waitFor(() => {
    expect(
      getByText('Add Manually Entered Results').closest('button')
    ).toBeEnabled();
  });

  expect(getByText('Remove CVR Files').closest('button')).toBeDisabled();
  expect(
    getByText('Remove Manually Entered Results').closest('button')
  ).toBeDisabled();

  expect(queryByText('Clear All Tallies and Results')).not.toBeInTheDocument();

  getByText('No CVR files loaded.');
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
  screen.getByText('Save Ballot Package');
});

test('election manager UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecordFileMode('unlocked');
  apiMock.expectGetCastVoteRecordFiles([]);
  apiMock.expectGetManualResultsMetadata([]);
  expectReportsScreenCardCountQueries({
    apiMock,
    isPrimary: false,
  });
  apiMock.expectGetScannerBatches([]);
  renderApp();
  await apiMock.authenticateAsElectionManager(eitherNeitherElectionDefinition);

  userEvent.click(screen.getByText('L&A'));
  await screen.findByRole('heading', { name: 'L&A Testing Documents' });

  userEvent.click(screen.getByText('Tally'));
  await screen.findByRole('heading', {
    name: 'Cast Vote Record (CVR) Management',
  });

  userEvent.click(screen.getByText('Reports'));
  await screen.findByRole('heading', { name: 'Election Reports' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Definition')).not.toBeInTheDocument();
  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();
  expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
});

test('system administrator UI has expected nav', async () => {
  const electionDefinition = eitherNeitherElectionDefinition;
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  renderApp();
  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Election Definition' });
  userEvent.click(screen.getByText('Smartcards'));
  await screen.findByRole('heading', { name: 'Election Cards' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });
});

test('system administrator UI has expected nav when no election', async () => {
  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata(null);
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  userEvent.click(screen.getByText('Settings'));
  await screen.findByRole('heading', { name: 'Settings' });
  userEvent.click(screen.getByText('Logs'));
  await screen.findByRole('heading', { name: 'Logs' });
  screen.getByRole('button', { name: 'Lock Machine' });

  expect(screen.queryByText('Smartcards')).not.toBeInTheDocument();

  // Create an election definition and verify that previously hidden tabs appear
  userEvent.click(screen.getByText('Definition'));
  await screen.findByRole('heading', { name: 'Configure VxAdmin' });
  const { electionDefinition } = electionFamousNames2021Fixtures;
  apiMock.expectConfigure(
    electionDefinition.electionData,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS)
  );
  apiMock.expectGetSystemSettings();
  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  userEvent.click(
    screen.getByRole('button', { name: 'Load Demo Election Definition' })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { name: 'Configure VxAdmin' })
    ).not.toBeInTheDocument()
  );
  screen.getByText('Smartcards');

  // Remove the election definition and verify that those same tabs disappear
  apiMock.expectUnconfigure();
  apiMock.expectGetCurrentElectionMetadata(null);
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  userEvent.click(screen.getByText('Remove Election'));
  const modal = await screen.findByRole('alertdialog');
  userEvent.click(
    within(modal).getByRole('button', { name: 'Remove Election Definition' })
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
      'Please insert a System Administrator card.'
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
    reason: 'election_manager_wrong_election',
  });
  await screen.findByText('Invalid Card');
  await screen.findByText(
    'The inserted Election Manager card is programmed for another election ' +
      'and cannot be used to unlock this machine. ' +
      'Please insert a valid Election Manager or System Administrator card.'
  );
});

test('primary election flow', async () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { renderApp } = buildApp(apiMock);

  apiMock.expectGetCurrentElectionMetadata({ electionDefinition });
  apiMock.expectGetCastVoteRecordFileMode('test');

  renderApp();
  await apiMock.authenticateAsElectionManager(electionDefinition);

  // Confirm "L&A" page prints separate test deck tally reports for non-partisan contests
  userEvent.click(screen.getByText('L&A'));
  userEvent.click(await screen.findByText('Print Full Test Deck Tally Report'));
  await expectPrint((printedElement) => {
    printedElement.getByText(
      'Test Deck Mammal Party Example Primary Election Tally Report'
    );
    printedElement.getByText(
      'Test Deck Fish Party Example Primary Election Tally Report'
    );
    printedElement.getByText(
      'Test Deck Example Primary Election Nonpartisan Contests Tally Report'
    );
  });
});

test('usb formatting flows', async () => {
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  const { promise: mountPromise, resolve: mountResolve } = deferred<void>();
  mockKiosk.mountUsbDrive.mockReturnValueOnce(mountPromise);

  const { renderApp } = buildApp(apiMock);
  apiMock.expectGetCurrentElectionMetadata();
  renderApp();

  await apiMock.authenticateAsSystemAdministrator();

  // navigate to modal
  userEvent.click(screen.getByText('Settings'));
  screen.getByText('USB Formatting');
  userEvent.click(screen.getByRole('button', { name: 'Format USB' }));

  // initial prompt to insert USB drive
  const initialModal = await screen.findByRole('alertdialog');
  await within(initialModal).findByText('No USB Drive Detected');

  // Inserting a USB drive that already is in VotingWorks format, which should mount
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  await screen.findByText('Loading');

  mountResolve();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);

  // // Format USB Drive
  await screen.findByText('Format USB Drive');
  const formatModal = screen.getByRole('alertdialog');
  within(formatModal).getByText(/already VotingWorks compatible/);
  userEvent.click(
    within(formatModal).getByRole('button', { name: 'Format USB' })
  );
  await within(formatModal).findByText('Confirm Format USB Drive');
  userEvent.click(
    within(formatModal).getByRole('button', { name: 'Format USB' })
  );
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);

  // wrapping in `act` due to a state update in an async useEffect in
  // `useUsbDrive` which fires when we await here
  await act(async () => {
    await screen.findByText('Formatting USB Drive');
  });
  await screen.findByText('USB Drive Formatted');
  screen.getByText('Ejected');

  // Removing USB resets modal
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  await screen.findByText('No USB Drive Detected');

  // Format another USB, this time in an incompatible format
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined, fsType: 'exfat' }),
  ]);
  await screen.findByText('Format USB Drive');
  const incompatibleModal = screen.getByRole('alertdialog');
  within(incompatibleModal).getByText(/not VotingWorks compatible/);
  userEvent.click(
    within(incompatibleModal).getByRole('button', { name: 'Format USB' })
  );
  await within(incompatibleModal).findByText('Confirm Format USB Drive');
  userEvent.click(
    within(incompatibleModal).getByRole('button', { name: 'Format USB' })
  );
  mockKiosk.getUsbDriveInfo.mockResolvedValue([
    fakeUsbDrive({ mountPoint: undefined }),
  ]);
  // wrapping in `act` due to a state update in an async useEffect in
  // `useUsbDrive` which fires when we await here
  await act(async () => {
    await screen.findByText('Formatting USB Drive');
  });
  await screen.findByText('USB Drive Formatted');
  screen.getByText('Ejected');

  // Removing USB resets modal
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  await screen.findByText('No USB Drive Detected');
  // Error handling
  mockKiosk.formatUsbDrive.mockRejectedValueOnce(new Error('unable to format'));
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
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
  mockKiosk.getUsbDriveInfo.mockResolvedValue([]);
  await screen.findByText('No USB Drive Detected');
});
