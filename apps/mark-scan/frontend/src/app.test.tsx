import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import React from 'react';
import { suppressingConsoleOutput } from '@votingworks/test-utils';

import fetchMock from 'fetch-mock';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  useBallotStyleManager,
  useSessionSettingsManager,
} from '@votingworks/mark-flow-ui';
import {
  anyPollingPlace,
  type BallotStyleId,
  type CandidateOrderings,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { screen, waitFor } from '../test/react_testing_library.js';
import { advanceTimersAndPromises } from '../test/helpers/timers.js';
import { render } from '../test/test_utils.js';
import { App } from './app.js';
import {
  type ApiMock,
  createApiMock,
} from '../test/helpers/mock_api_client.js';
import { buildApp } from '../test/helpers/build_app.js';
import { Ballot } from './components/ballot.js';
import { BallotContext } from './contexts/ballot_context.js';
import { AppRoot } from './app_root.js';
import { AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE } from './constants.js';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock(import('@votingworks/mark-flow-ui'), async (importActual) => ({
  ...(await importActual()),
  useBallotStyleManager: vi.fn(),
  useSessionSettingsManager: vi.fn(),
}));

vi.mock(import('./components/ballot.js'), async (importActual) => {
  const actual = await importActual();
  return { ...actual, Ballot: vi.fn(actual.Ballot) };
});

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();

  vi.mocked(useSessionSettingsManager).mockReturnValue({
    onSessionEnd: vi.fn(),
  });
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  vi.mocked(useSessionSettingsManager).mockReset();
});

test('will throw an error when using default api', async () => {
  fetchMock.get('/api', {
    body: {
      machineId: '0002',
      codeVersion: '3.14',
    },
  });

  await suppressingConsoleOutput(async () => {
    render(<App />);
    await screen.findByText('Something went wrong');
  });
});

test('Displays error boundary if the api returns an unexpected error', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  apiMock.expectGetMachineConfigToError();
  await suppressingConsoleOutput(async () => {
    render(<App apiClient={apiMock.mockApiClient} />);
    await screen.findByText('Something went wrong');
  });
});

test('prevents context menus from appearing', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} />);

  const { oncontextmenu } = window;

  if (oncontextmenu) {
    const event = new PointerEvent('contextmenu');

    vi.spyOn(event, 'preventDefault');
    oncontextmenu.call(window, event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  }

  await advanceTimersAndPromises();
});

test('uses voter settings management hook', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetElectionState();

  const { renderApp } = buildApp(apiMock);
  renderApp();

  await advanceTimersAndPromises();

  expect(vi.mocked(useSessionSettingsManager)).toBeCalled();
});

test('uses ballot style management hook', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState();
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '1_en',
    precinctId: electionGeneralDefinition.election.precincts[0]!.id,
  });
  apiMock.mockApiClient.updateCardlessVoterBallotStyle
    .expectRepeatedCallsWith({
      ballotStyleId: '1_es-US',
    })
    .resolves();

  vi.mocked(useBallotStyleManager).mockImplementation((params) =>
    React.useEffect(() => {
      params.updateCardlessVoterBallotStyle({
        ballotStyleId: '1_es-US',
      });
    }, [params])
  );

  buildApp(apiMock).renderApp();

  await advanceTimersAndPromises();

  await waitFor(() =>
    expect(vi.mocked(useBallotStyleManager)).toBeCalledWith(
      expect.objectContaining({
        currentBallotStyleId: '1_en',
        electionDefinition: electionGeneralDefinition,
      })
    )
  );
});

test('sets/updates ballot style candidate orderings in BallotContext', async () => {
  const pollingPlace = anyPollingPlace(electionGeneralDefinition.election);
  const pollingPlaceId = pollingPlace.id;
  const precinctId = assertDefined(Object.keys(pollingPlace.precincts)[0]);

  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({ pollingPlaceId, pollsState: 'polls_open' });
  apiMock.setPaperHandlerState('waiting_for_ballot_data');

  const { election } = electionGeneralDefinition;
  const bs1 = assertDefined(election.ballotStyles[0]);
  const bs2 = assertDefined(election.ballotStyles[1]);

  render(<AppRoot />, { apiMock });
  await screen.findByText('Insert Card');
  await waitFor(() => apiMock.mockApiClient.assertComplete());

  let lastOrderings: CandidateOrderings | null | undefined;

  vi.mocked(Ballot).mockImplementation(() => {
    const ctx = React.useContext(BallotContext);
    lastOrderings = ctx.candidateOrderings;

    return <div data-testid={`MockBallot-${ctx.ballotStyleId}`} />;
  });

  const mockOrderings: Record<BallotStyleId, CandidateOrderings> = {
    [bs1.id]: { contest1: [{ id: 'candidate2' }, { id: 'candidate1' }] },
    [bs2.id]: { contest1: [{ id: 'candidate1' }, { id: 'candidate2' }] },
  };

  apiMock.mockApiClient.getCandidateOrderings.mockImplementation((p) =>
    Promise.resolve(mockOrderings[p.ballotStyleId] ?? null)
  );

  async function selectBallotStyle(ballotStyleId: string) {
    apiMock.setAuthStatusCardlessVoterLoggedIn({ ballotStyleId, precinctId });

    await vi.advanceTimersByTimeAsync(AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE);
    screen.getByTestId(`MockBallot-${ballotStyleId}`);

    apiMock.mockApiClient.assertComplete();
  }

  await selectBallotStyle(bs1.id);
  expect(lastOrderings).toEqual(mockOrderings[bs1.id]!);

  await selectBallotStyle(bs2.id);
  expect(lastOrderings).toEqual(mockOrderings[bs2.id]!);

  await selectBallotStyle(bs1.id);
  expect(lastOrderings).toEqual(mockOrderings[bs1.id]!);
});
