import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import {
  type BallotStyleId,
  DEFAULT_SYSTEM_SETTINGS,
  type PrecinctId,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
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
  apiMock.expectGetBarcodeActivationMode('ballot_printing');
  apiMock.expectGetElectionRecord(electionDefinition);
  apiMock.expectGetElectionState({ pollingPlaceId, pollsState: 'polls_open' });

  render(<App apiClient={apiMock.mockApiClient} />);

  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await screen.findByText('Start a New Voting Session');

  apiMock.setPendingBarcodePrintRequest({ ballotStyleId, precinctId });
  await screen.findByText('Blank Ballot Printing');
  expect(screen.getButton(precinct.name)).toBeDisabled();

  apiMock.mockApiClient.printBlankBallot
    .expectCallWith({ ballotStyleId, precinctId })
    .resolves(MOCK_PRINT_JOB_ID);
  userEvent.click(screen.getButton('Print Ballot'));
  await screen.findByText('Ballot Printed');
  userEvent.click(screen.getButton('Done'));

  await screen.findByText('Start a New Voting Session');
  expect(screen.queryByText('Blank Ballot Printing')).toBeNull();
  expect(
    apiMock.mockApiClient.clearPendingBarcodePrintRequest
  ).toHaveBeenCalledTimes(1);
});
