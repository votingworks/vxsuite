import { afterEach, beforeEach, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { anyPollingPlace } from '@votingworks/types';
import {
  getMockMultiLanguageElectionDefinition,
  getRelatedBallotStyle,
} from '@votingworks/utils';
import { act, fireEvent, screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { BarcodeBallotPrintingScreen } from './barcode_ballot_printing_screen';
import { mockMachineConfig } from '../../test/helpers/mock_machine_config';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiProvider } from '../api_provider';

const multiLanguageDefinition = getMockMultiLanguageElectionDefinition(
  readElectionGeneralDefinition(),
  ['en', 'es-US']
);
const { election } = multiLanguageDefinition;
const englishBallotStyle = assertDefined(
  election.ballotStyles.find(
    (bs) => bs.languages.length === 1 && bs.languages[0] === 'en'
  )
);
const spanishBallotStyle = getRelatedBallotStyle({
  ballotStyles: election.ballotStyles,
  sourceBallotStyleId: englishBallotStyle.id,
  targetBallotStyleLanguage: 'es-US',
}).unsafeUnwrap();
const precinctId = assertDefined(englishBallotStyle.precincts[0]);
// A second, distinct precinct for multi-precinct disambiguation tests.
const otherPrecinctId = assertDefined(
  election.precincts.find((p) => p.id !== precinctId)
).id;

const WAITING_TEXT = 'WAITING FOR SCAN';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function renderScreen() {
  return render(
    <ApiProvider apiClient={apiMock.mockApiClient} noAudio>
      <BarcodeBallotPrintingScreen
        electionDefinition={multiLanguageDefinition}
        electionPackageHash="test-election-package-hash"
        machineConfig={mockMachineConfig()}
        pollingPlaceId={anyPollingPlace(election).id}
        isLiveMode={false}
        whileWaiting={<div>{WAITING_TEXT}</div>}
      />
    </ApiProvider>
  );
}

test('waits when there is no scan', async () => {
  apiMock.expectGetMostRecentBarcodeScan(null);
  renderScreen();
  await screen.findByText(WAITING_TEXT);
});

test('ignores a stale scan from before the screen opened', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: JSON.stringify({ bsId: spanishBallotStyle.id }),
    timestamp: new Date(Date.now() - 10_000),
  });
  renderScreen();
  await screen.findByText(WAITING_TEXT);
});

test('ignores a scan that is not a valid ballot style QR code', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: 'not-json',
    timestamp: new Date(Date.now() + 10_000),
  });
  renderScreen();
  await screen.findByText(WAITING_TEXT);
});

test('waits when the scanned ballot style does not resolve to one precinct', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: JSON.stringify({ bsId: spanishBallotStyle.id }),
    timestamp: new Date(Date.now() + 10_000),
  });
  apiMock.mockApiClient.getPrecinctsForBallotStyle
    .expectRepeatedCallsWith({ ballotStyleId: englishBallotStyle.id })
    .resolves([]);
  renderScreen();
  await screen.findByText(WAITING_TEXT);
});

test('uses the scanned precinct to disambiguate a multi-precinct ballot style', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: JSON.stringify({
      bsId: spanishBallotStyle.id,
      pId: otherPrecinctId,
    }),
    timestamp: new Date(Date.now() + 10_000),
  });
  apiMock.mockApiClient.getPrecinctsForBallotStyle
    .expectRepeatedCallsWith({ ballotStyleId: englishBallotStyle.id })
    .resolves([precinctId, otherPrecinctId]);
  renderScreen();

  await screen.findByText('Blank Ballot Printing');
});

test('waits when the scanned precinct is not valid for the polling place', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: JSON.stringify({
      bsId: spanishBallotStyle.id,
      pId: 'not-a-real-precinct',
    }),
    timestamp: new Date(Date.now() + 10_000),
  });
  apiMock.mockApiClient.getPrecinctsForBallotStyle
    .expectRepeatedCallsWith({ ballotStyleId: englishBallotStyle.id })
    .resolves([precinctId, otherPrecinctId]);
  renderScreen();
  await screen.findByText(WAITING_TEXT);
});

test('opens the locked print screen for a fresh single-precinct scan', async () => {
  apiMock.expectGetMostRecentBarcodeScan({
    data: JSON.stringify({ bsId: spanishBallotStyle.id }),
    timestamp: new Date(Date.now() + 10_000),
  });
  apiMock.mockApiClient.getPrecinctsForBallotStyle
    .expectRepeatedCallsWith({ ballotStyleId: englishBallotStyle.id })
    .resolves([precinctId]);
  renderScreen();

  await screen.findByText('Blank Ballot Printing');

  // Going back clears the scan so it doesn't immediately re-trigger.
  apiMock.expectClearLastBarcodeScan();
  fireEvent.click(screen.getByText('Back'));
  await act(async () => {
    await Promise.resolve();
  });
});
