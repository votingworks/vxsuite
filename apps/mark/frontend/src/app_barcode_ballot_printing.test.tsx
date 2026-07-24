import { afterEach, beforeEach, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { anyPollingPlace, DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { screen } from '../test/react_testing_library';
import { buildApp } from '../test/helpers/build_app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

const electionGeneralDefinition = readElectionGeneralDefinition();
const pollingPlace = anyPollingPlace(electionGeneralDefinition.election);

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

function setUpBallotPrintingMode() {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    bmdEnableQrBallotActivation: true,
  });
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId: pollingPlace.id,
    pollsState: 'polls_open',
  });
  apiMock.mockApiClient.getBarcodeActivationMode
    .expectRepeatedCallsWith()
    .resolves('ballot_printing');
  apiMock.expectGetMostRecentBarcodeScan(null);
}

test('logged out shows the insert card screen until a ballot style is scanned', async () => {
  setUpBallotPrintingMode();
  buildApp(apiMock).renderApp();

  await screen.findByText('Insert Card');
});

test('poll worker still sees the poll worker screen until a ballot style is scanned', async () => {
  setUpBallotPrintingMode();
  apiMock.setAuthStatusPollWorkerLoggedIn(electionGeneralDefinition);
  buildApp(apiMock).renderApp();

  await screen.findByText(hasTextAcrossElements('Polls: Open'));
});
