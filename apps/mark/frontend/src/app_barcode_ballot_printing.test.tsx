import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  type BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  type PrecinctId,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import type { BarcodePrintRequest } from '@votingworks/mark-backend';
import { render, screen } from '../test/react_testing_library.js';
import { App } from './app.js';
import {
  type ApiMock,
  createApiMock,
  MOCK_PRINT_JOB_ID,
} from '../test/helpers/mock_api_client.js';

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

const precinctId = '23' as PrecinctId;
const ballotStyleId = '12' as BallotStyleId;
const pollingPlaceId = `${precinctId}-polling-place`;
const electionDefinition = readElectionGeneralDefinition();
const precinct = find(
  electionDefinition.election.precincts,
  (p) => p.id === precinctId
);

test('a scanned barcode prints one ballot and returns to the poll worker menu', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    allowPrintingBlankBallotsFromVxMark: true,
    bmdEnableQrBallotActivation: true,
  });
  apiMock.setBarcodeActivationMode('ballot_printing');
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({ pollingPlaceId, pollsState: 'polls_open' });

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  apiMock.setPendingBarcodePrintRequest({ ballotStyleId, precinctId });
  await screen.findByText('Blank Ballot Printing');
  expect(screen.getButton(precinct.name)).toHaveAttribute(
    'data-variant',
    'primary'
  );

  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({ ballotStyleId, precinctId })
    .resolves(MOCK_PRINT_JOB_ID);
  await userEvent.click(screen.getButton('Print Ballot'));
  await screen.findByText('Ballot Printed');
  await userEvent.click(screen.getButton('Done'));

  await screen.findByText('Start a New Voting Session');
  expect(screen.queryByText('Blank Ballot Printing')).toBeNull();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});

const splitsDefinition =
  electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
const splitBarcodePrintRequest: BarcodePrintRequest = {
  ballotStyleId: '4-F_zh-Hant',
  precinctId: 'precinct-c2',
};

function renderSplitsElectionAsPollWorker() {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    allowPrintingBlankBallotsFromVxMark: true,
    bmdEnableQrBallotActivation: true,
  });
  apiMock.setBarcodeActivationMode('ballot_printing');
  apiMock.expectGetElectionRecord(splitsDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: 'precinct-c2-polling-place',
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);
  apiMock.setAuthStatusPollWorkerLoggedIn(splitsDefinition);
}

async function expectLockedSplitBallot() {
  await screen.findByText('Precinct 4 - Split 2');
  expect(screen.getButton('Fish')).toHaveAttribute('data-variant', 'primary');
  expect(screen.getButton('Mammal')).toBeDisabled();
  screen.getByText(format.languageDisplayName({ languageCode: 'zh-Hant' }));
  expect(screen.getByLabelText('Ballot language')).toBeDisabled();
}

test('a scanned barcode for a split precinct shows the scanned split, party, and language', async () => {
  renderSplitsElectionAsPollWorker();
  apiMock.setPendingBarcodePrintRequest(splitBarcodePrintRequest);

  await screen.findByText('Blank Ballot Printing');
  await expectLockedSplitBallot();
});

test('a scanned barcode fills in a split precinct on the open manual print screen', async () => {
  renderSplitsElectionAsPollWorker();

  await userEvent.click(await screen.findButton('Print Blank Ballot'));
  await screen.findByText('Blank Ballot Printing');
  expect(screen.queryByText('Precinct 4 - Split 2')).toBeNull();

  apiMock.setPendingBarcodePrintRequest(splitBarcodePrintRequest);
  await expectLockedSplitBallot();
});
