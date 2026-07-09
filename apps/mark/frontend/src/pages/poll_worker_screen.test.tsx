import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  asElectionDefinition,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  anyPollingPlace,
  BallotStyleId,
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  formatElectionHashes,
  InsertedSmartCardAuth,
  PrecinctId,
} from '@votingworks/types';

import {
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';

import { assertDefined, DateWithoutTime } from '@votingworks/basics';
import {
  format,
  getMockMultiLanguageElectionDefinition,
  getRelatedBallotStyle,
} from '@votingworks/utils';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '../../test/react_testing_library';

import { render } from '../../test/test_utils';

import { PollWorkerScreen, PollworkerScreenProps } from './poll_worker_screen';
import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';

const MOCK_SECTION_SESSION_START_ID = 'MockSectionSessionStart';
const MockSectionSessionStart = vi.spyOn(
  pollWorkerComponents,
  'SectionSessionStart'
);

const MOCK_BALLOT_STYLE_PRECINCT_ID = 'precinct-1' as PrecinctId;
const MOCK_BALLOT_STYLE_ID = 'ballot-style-1' as BallotStyleId;
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
  electionDefinition: ElectionDefinition = electionGeneralDefinition
) {
  return render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
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

test('switching out of test mode on election day', () => {
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
  userEvent.click(screen.getByText('Switch to Official Ballot Mode'));
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
  const pollingPlaceId = pollingPlace.id;

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

test('prints a blank ballot for the selected ballot style', async () => {
  expectSystemSettings(true);
  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({
      precinctId: MOCK_BALLOT_STYLE_PRECINCT_ID,
      ballotStyleId: MOCK_BALLOT_STYLE_ID,
    })
    .resolves();

  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  screen.getByText('Select a Ballot Style to Print');

  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  fireEvent.click(screen.getByText('Print Ballot'));

  // The progress modal is shown for a fixed duration, not gated on the print
  // job (which completes near-instantly).
  await screen.findByText('Printing Ballot');
  expect(screen.queryByText('Ballot Printed')).toBeNull();

  act(() => {
    vi.advanceTimersByTime(BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  });

  await screen.findByText('Ballot Printed');
  fireEvent.click(screen.getByText('Done'));

  await waitFor(() => {
    expect(screen.queryByText('Ballot Printed')).toBeNull();
  });
});

test('returns to the poll worker menu from the print blank ballot screen', async () => {
  expectSystemSettings(true);
  renderScreen();

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  screen.getByText('Select a Ballot Style to Print');

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  expect(screen.queryByText('Select a Ballot Style to Print')).toBeNull();
  screen.getByText('Print Blank Ballot');
});

test('hides the Print Blank Ballot button when the setting is disabled', () => {
  expectSystemSettings(false);
  renderScreen();

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

function mockBallotStyleSelectReturning(ballotStyleId: BallotStyleId) {
  MockBallotStyleSelect.mockImplementation(({ onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect(MOCK_BALLOT_STYLE_PRECINCT_ID, ballotStyleId)}
    >
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
    .resolves();

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
  userEvent.click(
    screen.getByText(format.languageDisplayName({ languageCode: 'en' }))
  );
  userEvent.click(
    screen.getByText(format.languageDisplayName({ languageCode: 'es-US' }))
  );

  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Printing Ballot');
  act(() => {
    vi.advanceTimersByTime(BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  });
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
    .resolves();

  renderScreen(
    {},
    mockPollWorkerAuth(multiLanguageDefinition),
    multiLanguageDefinition
  );

  fireEvent.click(await screen.findByText('Print Blank Ballot'));
  fireEvent.click(screen.getByText('Mock Select Ballot Style'));
  screen.getByText('Language');
  fireEvent.click(screen.getByText('Print Ballot'));

  await screen.findByText('Printing Ballot');
  act(() => {
    vi.advanceTimersByTime(BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
  });
  await screen.findByText('Ballot Printed');
});
