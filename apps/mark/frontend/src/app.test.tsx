import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import React from 'react';
import { suppressingConsoleOutput } from '@votingworks/test-utils';

import fetchMock from 'fetch-mock';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  useBallotStyleManager,
  useSessionSettingsManager,
} from '@votingworks/mark-flow-ui';
import { userEvent } from '@testing-library/user-event';
import type { BallotStyleId, CandidateOrderings } from '@votingworks/types';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
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
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState();

  const { renderApp } = buildApp(apiMock);
  renderApp();

  await advanceTimersAndPromises();

  expect(useSessionSettingsManager).toBeCalled();
});

test('uses ballot style management hook', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState();
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '1_G_es-US',
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
    expect(useBallotStyleManager).toBeCalledWith(
      expect.objectContaining({
        currentBallotStyleId: '1_G_es-US',
        electionDefinition: electionGeneralDefinition,
      })
    )
  );
});

const precinctId = '23';
const pollingPlaceId = `${precinctId}-polling-place`;

test('PAT device tutorial is shown when PAT key is pressed during voter session', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });

  // Start as cardless voter
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Wait for voter screen to appear
  await screen.findByText('Start Voting');

  // Pressing a non PAT button doesn't trigger the PAT tutorial
  await userEvent.keyboard('0');
  // No page change
  await screen.findByText('Start Voting');

  // Press PAT key '1' (PAT_MOVE) to trigger PAT tutorial
  await userEvent.keyboard('1');

  // PAT calibration page should be shown
  await screen.findByText(
    'Personal Assistive Technology Device Identification'
  );
});

test('PAT device tutorial can be skipped', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });

  // Start as cardless voter
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId,
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Wait for voter screen to appear
  await screen.findByText('Start Voting');

  // Press PAT key to trigger PAT tutorial
  await userEvent.keyboard('2');

  // PAT calibration page should be shown
  await screen.findByText(
    'Personal Assistive Technology Device Identification'
  );

  // Skip the tutorial
  await userEvent.click(screen.getByRole('button', { name: /skip/i }));

  // Should return to voter screen
  await screen.findByText('Start Voting');
});

test('PAT device tutorial is not triggered when not in voter session', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    pollingPlaceId,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} />);

  // Wait for insert card screen (no voter logged in)
  await screen.findByText('Insert Card');

  // Press PAT key - should NOT trigger tutorial since not in voter session
  await userEvent.keyboard('1');

  // Should still be on insert card screen (no PAT calibration page)
  expect(
    screen.queryByText('Personal Assistive Technology Device Identification')
  ).not.toBeInTheDocument();
  screen.getByText('Insert Card');
});

test('sets/updates ballot style candidate orderings in BallotContext', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionRecord(electionGeneralDefinition);
  apiMock.expectGetElectionState({ pollingPlaceId, pollsState: 'polls_open' });

  const { election } = electionGeneralDefinition;
  const bs1 = assertDefined(election.ballotStyles[0]);
  const bs2 = assertDefined(election.ballotStyles[1]);

  vi.mocked(Ballot).mockThrow('unexpected Ballot render');

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

    await vi.advanceTimersByTimeAsync(AUTH_STATUS_POLLING_INTERVAL_MS);
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
