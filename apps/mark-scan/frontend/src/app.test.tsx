import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import React from 'react';
import { suppressingConsoleOutput } from '@votingworks/test-utils';

import fetchMock from 'fetch-mock';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  useBallotStyleManager,
  useSessionSettingsManager,
} from '@votingworks/mark-flow-ui';
import { BallotStyleId } from '@votingworks/types';
import { screen } from '../test/react_testing_library';
import { advanceTimersAndPromises } from '../test/helpers/timers';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { buildApp } from '../test/helpers/build_app';

const electionGeneralDefinition = readElectionGeneralDefinition();

vi.mock(import('@votingworks/mark-flow-ui'), async (importActual) => ({
  ...(await importActual()),
  useBallotStyleManager: vi.fn(),
  useSessionSettingsManager: vi.fn(),
}));

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
    const event = new MouseEvent('contextmenu');

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
    ballotStyleId: '1_en' as BallotStyleId,
    precinctId: electionGeneralDefinition.election.precincts[0].id,
  });
  apiMock.mockApiClient.updateCardlessVoterBallotStyle
    .expectRepeatedCallsWith({
      ballotStyleId: '1_es-US' as BallotStyleId,
    })
    .resolves();

  vi.mocked(useBallotStyleManager).mockImplementation((params) =>
    React.useEffect(() => {
      params.updateCardlessVoterBallotStyle({
        ballotStyleId: '1_es-US' as BallotStyleId,
      });
    }, [params])
  );

  buildApp(apiMock).renderApp();

  await advanceTimersAndPromises();

  expect(vi.mocked(useBallotStyleManager)).toBeCalledWith(
    expect.objectContaining({
      currentBallotStyleId: '1_en',
      electionDefinition: electionGeneralDefinition,
    })
  );
});
