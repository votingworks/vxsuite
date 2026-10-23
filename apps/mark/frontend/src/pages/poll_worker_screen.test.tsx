import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  anyPollingPlace,
  type BallotStyleId,
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  type ElectionDefinition,
  formatElectionHashes,
  type InsertedSmartCardAuth,
  type PrecinctId,
} from '@votingworks/types';

import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { userEvent } from '@testing-library/user-event';

import { assertDefined, DateWithoutTime, err } from '@votingworks/basics';
import type { QueryClient } from '@tanstack/react-query';
import {
  format,
  getMockMultiLanguageElectionDefinition,
  getRelatedBallotStyle,
} from '@votingworks/utils';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import type {
  BarcodeActivationMode,
  BarcodePrintRequest,
} from '@votingworks/mark-backend';
import { createQueryClient, getPrintJobStatus } from '../api.js';
import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '../../test/react_testing_library.js';

import { render } from '../../test/test_utils.js';

import {
  PollWorkerScreen,
  type PollworkerScreenProps,
} from './poll_worker_screen.js';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config.js';
import {
  type ApiMock,
  createApiMock,
  MOCK_PRINT_JOB_ID,
} from '../../test/helpers/mock_api_client.js';
import { ApiProvider } from '../api_provider.js';

const MOCK_SECTION_SESSION_START_ID = 'MockSectionSessionStart';
const MockSectionSessionStart = vi.spyOn(
  pollWorkerComponents,
  'SectionSessionStart'
);

const MOCK_BALLOT_STYLE_PRECINCT_ID = '21' as PrecinctId;
const MOCK_BALLOT_STYLE_ID = '5' as BallotStyleId;
const MockBallotStyleSelect = vi.spyOn(
  pollWorkerComponents,
  'BallotStyleSelect'
);

const electionGeneralDefinition = readElectionGeneralDefinition();
const { election } = electionGeneralDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();

  MockSectionSessionStart.mockImplementation(() => (
    <div data-testid={MOCK_SECTION_SESSION_START_ID} />
  ));

  MockBallotStyleSelect.mockImplementation(({ onSelect }) => (
    <button
      type="button"
      onClick={() =>
        onSelect(MOCK_BALLOT_STYLE_PRECINCT_ID, MOCK_BALLOT_STYLE_ID)
      }
    >
      Mock Select Ballot Style
    </button>
  ));
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function mockPollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
}

function renderScreen(
  props: Partial<PollworkerScreenProps> = {},
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn = mockPollWorkerAuth(
    electionGeneralDefinition
  ),
  electionDefinition: ElectionDefinition = electionGeneralDefinition,
  queryClient?: QueryClient
) {
  return render(
    <ApiProvider
      apiClient={apiMock.mockApiClient}
      queryClient={queryClient}
      noAudio
    >
      <PollWorkerScreen
        pollWorkerAuth={pollWorkerAuth}
        activateCardlessVoterSession={vi.fn()}
        resetCardlessVoterSession={vi.fn()}
        electionDefinition={electionDefinition}
        electionPackageHash="test-election-package-hash"
        hasVotes={false}
        isLiveMode={false}
        pollsState="polls_open"
        ballotsPrintedCount={0}
        machineConfig={mockMachineConfig()}
        pollingPlaceId={anyPollingPlace(electionDefinition.election).id}
        {...props}
      />
    </ApiProvider>
  );
}

function expectSystemSettings(allowPrintingBlankBallotsFromVxMark = false) {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    allowPrintingBlankBallotsFromVxMark,
  });
}

test('renders PollWorkerScreen', () => {
  expectSystemSettings();
  renderScreen(undefined, undefined, undefined);
  screen.getByText('Poll Worker Menu');
  expect(
    screen.getByText('Ballots Printed:').parentElement!.textContent
  ).toEqual('Ballots Printed: 0');
  screen.getByText('Power Down');
});

test('switching out of test mode on election day', async () => {
  const electionDefinition = asElectionDefinition({
    ...election,
    date: DateWithoutTime.today(),
  });
  expectSystemSettings();
  apiMock.expectSetTestMode(false);
  renderScreen({
    pollWorkerAuth: mockPollWorkerAuth(electionDefinition),
    electionDefinition,
  });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  await userEvent.click(screen.getByText('Switch to Official Ballot Mode'));
});

test('keeping test mode on election day', () => {
  const electionDefinition = asElectionDefinition({
    ...election,
    date: DateWithoutTime.today(),
  });
  expectSystemSettings();
  renderScreen({ electionDefinition });

  screen.getByText(
    'Switch to Official Ballot Mode and reset the Ballots Printed count?'
  );
  fireEvent.click(screen.getByText('Cancel'));
});

test('live mode on election day', () => {
  expectSystemSettings();
  renderScreen({ isLiveMode: true });
  expect(
    screen.queryByText(
      'Switch to Official Ballot Mode and reset the Ballots Printed count?'
    )
  ).toBeNull();
});

test('Shows election info', () => {
  expectSystemSettings();
  renderScreen();
  screen.getByText(election.title);
  screen.getByText(
    formatElectionHashes(
      electionGeneralDefinition.ballotHash,
      'test-election-package-hash'
    )
  );
});

test('renders session start section', () => {
  const [pollingPlace] = assertDefined(election.pollingPlaces);

  const activateCardlessVoterSession = vi.fn();
  const pollingPlaceId = pollingPlace!.id;

  expectSystemSettings();
  renderScreen({
    activateCardlessVoterSession,
    pollingPlaceId,
  });

  screen.getByTestId(MOCK_SECTION_SESSION_START_ID);

  const props = assertDefined(MockSectionSessionStart.mock.lastCall)[0];
  expect(props).toEqual<pollWorkerComponents.SectionSessionStartProps>({
    election,
    onChooseBallotStyle: expect.any(Function),
    pollingPlaceId,
  });
  expect(activateCardlessVoterSession).not.toHaveBeenCalled();

  act(() => props.onChooseBallotStyle('some-precinct', 'some-ballot-style'));
  expect(activateCardlessVoterSession).toHaveBeenCalledWith(
    'some-precinct',
    'some-ballot-style'
  );
});

test('disables Print Ballot until a ballot style is selected', async () => {
  expectSystemSettings(true);

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  expect(screen.getByRole('button', { name: 'Print Ballot' })).toBeDisabled();

  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  expect(screen.getByRole('button', { name: 'Print Ballot' })).toBeEnabled();
});

test('prints a blank ballot for the selected ballot style', async () => {
  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves(MOCK_PRINT_JOB_ID);

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  screen.getByText('Ballot Style');

  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));

  // The progress modal stays up until the job reaches the printer.
  apiMock.setPrintJobStatus({ outcome: 'in-progress' });
  await screen.findByText('Printing Ballot');
  expect(screen.queryByText('Ballot Printed')).toBeNull();

  apiMock.setPrintJobStatus({ outcome: 'sent-to-printer' });
  await screen.findByText('Ballot Printed');
  fireEvent.click(screen.getByText('Done'));

  await waitFor(() => {
    expect(screen.queryByText('Ballot Printed')).toBeNull();
  });
});

test('shows the printing modal while the print request is still in flight', async () => {
  expectSystemSettings(true);
  // Never resolves, so the screen stays in the window between the print
  // request and the job id coming back.
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .returns(new Promise(() => {}));

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Printing Ballot');
});

async function printBlankBallotAndWaitForFailure() {
  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Ballot Not Printed');
}

test('shows a dismissible failure modal when the blank ballot is not printed', async () => {
  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves(MOCK_PRINT_JOB_ID);
  apiMock.setPrintJobStatus({
    outcome: 'failed',
    reason: 'Unable to send data to printer.',
  });

  renderScreen();
  await printBlankBallotAndWaitForFailure();
  screen.getByText('Unable to send data to printer.');

  fireEvent.click(screen.getByText('Close'));
  await waitFor(() => {
    expect(screen.queryByText('Ballot Not Printed')).toBeNull();
  });
});

test('treats a job with no tracked status as a failure', async () => {
  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves(MOCK_PRINT_JOB_ID);
  apiMock.mockApiClient.getPrintJobStatus.mockImplementation(() =>
    Promise.resolve(err(new Error('no status tracked for print job 1')))
  );

  renderScreen();
  await printBlankBallotAndWaitForFailure();
  screen.getByText('There was a problem with the printer.');
});

test('returns to the poll worker menu from the print blank ballot screen', async () => {
  expectSystemSettings(true);
  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  screen.getByText('Ballot Style');

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  expect(screen.queryByText('Ballot Style')).toBeNull();
  screen.getByText('Print Blank Ballot');
});

test('hides the Print Blank Ballot button when the setting is disabled', () => {
  expectSystemSettings(false);
  renderScreen();

  screen.getByText('Poll Worker Menu');
  expect(screen.queryByText('Print Blank Ballot')).toBeNull();
});

test('hides the Print Blank Ballot button when polls are not open', () => {
  expectSystemSettings(true);
  renderScreen({ pollsState: 'polls_closed_initial' });

  screen.getByText('Poll Worker Menu');
  expect(screen.queryByText('Print Blank Ballot')).toBeNull();
});

const multiLanguageDefinition = getMockMultiLanguageElectionDefinition(
  electionGeneralDefinition,
  ['en', 'es-US']
);
const multiLanguageElection = multiLanguageDefinition.election;
const englishBallotStyle = assertDefined(
  multiLanguageElection.ballotStyles.find(
    (bs) => bs.languages.length === 1 && bs.languages[0] === 'en'
  )
);

function mockBallotStyleSelectReturning(
  ballotStyleId: BallotStyleId,
  precinctId: PrecinctId = MOCK_BALLOT_STYLE_PRECINCT_ID
) {
  MockBallotStyleSelect.mockImplementation(({ onSelect }) => (
    <button type="button" onClick={() => onSelect(precinctId, ballotStyleId)}>
      Mock Select Ballot Style
    </button>
  ));
}

test('prints a blank ballot in the language chosen from the dropdown', async () => {
  const spanishBallotStyle = getRelatedBallotStyle({
    ballotStyles: multiLanguageElection.ballotStyles,
    sourceBallotStyleId: englishBallotStyle.id,
    targetBallotStyleLanguage: 'es-US',
  }).unsafeUnwrap();
  mockBallotStyleSelectReturning(englishBallotStyle.id);

  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: spanishBallotStyle.id,
    })
    .resolves(MOCK_PRINT_JOB_ID);

  renderScreen(
    {},
    mockPollWorkerAuth(multiLanguageDefinition),
    multiLanguageDefinition
  );

  fireEvent.click(await screen.findByText('Print Blank Ballot'));

  // Selecting a ballot style reveals a language dropdown scoped to that style.
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  screen.getByText('Language');

  // Choose Spanish from the language dropdown (defaults to English).
  await userEvent.click(
    screen.getByText(format.languageDisplayName({ languageCode: 'en' }))
  );
  await userEvent.click(
    screen.getByText(format.languageDisplayName({ languageCode: 'es-US' }))
  );

  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Ballot Printed');
});

test('prints in the default language when the dropdown is left unchanged', async () => {
  mockBallotStyleSelectReturning(englishBallotStyle.id);

  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: englishBallotStyle.id,
    })
    .resolves(MOCK_PRINT_JOB_ID);

  renderScreen(
    {},
    mockPollWorkerAuth(multiLanguageDefinition),
    multiLanguageDefinition
  );

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  screen.getByText('Language');
  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Ballot Printed');
});

test('clears a settled blank ballot job status so a reused job id is not read from cache', async () => {
  const queryClient = createQueryClient();
  const queryKey = getPrintJobStatus.queryKey(MOCK_PRINT_JOB_ID);

  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves(MOCK_PRINT_JOB_ID);

  renderScreen({}, undefined, undefined, queryClient);

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Ballot Printed');
  fireEvent.click(screen.getByText('Done'));

  await waitFor(() => {
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });
});

const scannedBallotStyle = assertDefined(election.ballotStyles[0]);
const scannedBarcodePrintRequest: BarcodePrintRequest = {
  ballotStyleId: scannedBallotStyle.id,
  precinctId: assertDefined(scannedBallotStyle.precincts[0]),
};

function lastBallotStyleSelectProps() {
  return assertDefined(MockBallotStyleSelect.mock.lastCall)[0];
}

interface LockedBallotStyleSelection {
  selectedBallotStyleId: BallotStyleId;
  selectedPrecinctOrSplitId?: string;
}

function expectLockedBallotStyleSelect(selection: LockedBallotStyleSelection) {
  expect(lastBallotStyleSelectProps()).toMatchObject({
    lockedToSelection: true,
    ...selection,
  });
}

const scannedBallotStyleSelection: LockedBallotStyleSelection = {
  selectedBallotStyleId: scannedBarcodePrintRequest.ballotStyleId,
  selectedPrecinctOrSplitId: scannedBarcodePrintRequest.precinctId,
};

function expectBarcodePrint(request = scannedBarcodePrintRequest) {
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith(request)
    .resolves(MOCK_PRINT_JOB_ID);
}

async function expectPollWorkerMenu() {
  await screen.findByText('Print Blank Ballot');
  expect(screen.queryByText('Blank Ballot Printing')).toBeNull();
}

function expectBarcodeBallotPrinting(
  mode: BarcodeActivationMode = 'ballot_printing'
) {
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    allowPrintingBlankBallotsFromVxMark: true,
    bmdEnableQrBallotActivation: true,
  });
  apiMock.setBarcodeActivationMode(mode);
}

test('a pending barcode print request opens the print screen with the scanned options locked', async () => {
  expectBarcodeBallotPrinting();
  apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);
  expectBarcodePrint();

  renderScreen();

  await screen.findByText('Blank Ballot Printing');
  expectLockedBallotStyleSelect(scannedBallotStyleSelection);

  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Ballot Printed');
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Done'));
  await expectPollWorkerMenu();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});

test('returns to the poll worker menu after a failed barcode print', async () => {
  expectBarcodeBallotPrinting();
  apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);
  apiMock.setPrintJobStatus({ outcome: 'failed', reason: 'printer-error' });
  expectBarcodePrint();

  renderScreen();

  fireEvent.click(await screen.findByText('Print Ballot'));
  await screen.findByText('Ballot Not Printed');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));

  await expectPollWorkerMenu();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});

test('Back clears a pending barcode print request', async () => {
  expectBarcodeBallotPrinting();
  apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);

  renderScreen();

  fireEvent.click(await screen.findByText('Back'));
  await expectPollWorkerMenu();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});

test('a barcode print request locks the language to the scanned ballot style', async () => {
  const spanishBallotStyle = getRelatedBallotStyle({
    ballotStyles: multiLanguageElection.ballotStyles,
    sourceBallotStyleId: englishBallotStyle.id,
    targetBallotStyleLanguage: 'es-US',
  }).unsafeUnwrap();
  const request: BarcodePrintRequest = {
    ballotStyleId: spanishBallotStyle.id,
    precinctId: assertDefined(spanishBallotStyle.precincts[0]),
  };
  expectBarcodeBallotPrinting();
  apiMock.setPendingBarcodePrintRequest(request);
  expectBarcodePrint(request);

  renderScreen(
    {},
    mockPollWorkerAuth(multiLanguageDefinition),
    multiLanguageDefinition
  );

  await screen.findByText(
    format.languageDisplayName({ languageCode: 'es-US' })
  );
  expectLockedBallotStyleSelect({
    selectedBallotStyleId: englishBallotStyle.id,
  });
  expect(screen.getByLabelText('Ballot language')).toBeDisabled();

  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Ballot Printed');
});

test('a barcode scan fills in the manual print screen', async () => {
  expectBarcodeBallotPrinting();
  expectBarcodePrint();

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  expect(lastBallotStyleSelectProps()).toMatchObject({
    disabled: false,
    selectedBallotStyleId: MOCK_BALLOT_STYLE_ID,
  });

  apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);
  await waitFor(() =>
    expectLockedBallotStyleSelect(scannedBallotStyleSelection)
  );

  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Ballot Printed');
  fireEvent.click(screen.getByText('Done'));
  await expectPollWorkerMenu();
});

test('a barcode scan during a manual print is dropped once the manual print finishes', async () => {
  expectBarcodeBallotPrinting();
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves(MOCK_PRINT_JOB_ID);

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));
  await screen.findByText('Ballot Printed');

  apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);
  await waitFor(() =>
    expectLockedBallotStyleSelect(scannedBallotStyleSelection)
  );
  screen.getByText('Ballot Printed');

  fireEvent.click(screen.getByText('Done'));
  await expectPollWorkerMenu();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});

test.each<{ description: string; expectSettings: () => void }>([
  {
    description: 'QR ballot activation is disabled',
    expectSettings: () => expectSystemSettings(true),
  },
  {
    description: 'the barcode activation mode is voter session',
    expectSettings: () => expectBarcodeBallotPrinting('voter_session'),
  },
])(
  'does not poll for barcode print requests when $description',
  async ({ expectSettings }) => {
    expectSettings();
    apiMock.setPendingBarcodePrintRequest(scannedBarcodePrintRequest);

    renderScreen();

    await expectPollWorkerMenu();
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      apiMock.mockApiClient.getPendingBarcodePrintRequest
    ).not.toHaveBeenCalled();
    expect(screen.queryByText('Blank Ballot Printing')).toBeNull();
  }
);

test('a barcode print request for a split precinct in a primary selects the split, party, and language', async () => {
  const splitsDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  expectBarcodeBallotPrinting();
  apiMock.setPendingBarcodePrintRequest({
    ballotStyleId: '4-F_zh-Hant',
    precinctId: 'precinct-c2',
  });

  renderScreen(
    { pollingPlaceId: 'precinct-c2-polling-place' },
    mockPollWorkerAuth(splitsDefinition),
    splitsDefinition
  );

  await screen.findByText('Blank Ballot Printing');
  expectLockedBallotStyleSelect({
    selectedBallotStyleId: '4-F_en',
    selectedPrecinctOrSplitId: 'precinct-c2-split-2',
  });
  screen.getByText(format.languageDisplayName({ languageCode: 'zh-Hant' }));
});

test.each<{
  description: string;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  expectedPrecinctOrSplitId: string;
}>([
  {
    description: 'precinct',
    ballotStyleId: '12',
    precinctId: '23',
    expectedPrecinctOrSplitId: '23',
  },
  {
    description: 'split',
    ballotStyleId: '5',
    precinctId: '21',
    expectedPrecinctOrSplitId: '21-1',
  },
])(
  'shows the manually selected $description in the ballot style picker',
  async ({ ballotStyleId, precinctId, expectedPrecinctOrSplitId }) => {
    mockBallotStyleSelectReturning(ballotStyleId, precinctId);
    expectSystemSettings(true);

    renderScreen();

    fireEvent.click(await screen.findByText('Print Blank Ballot'));
    expect(
      lastBallotStyleSelectProps().selectedPrecinctOrSplitId
    ).toBeUndefined();

    fireEvent.click(screen.getByText('Mock Select Ballot Style'));
    expect(lastBallotStyleSelectProps()).toMatchObject({
      lockedToSelection: false,
      selectedBallotStyleId: ballotStyleId,
      selectedPrecinctOrSplitId: expectedPrecinctOrSplitId,
    });
  }
);
