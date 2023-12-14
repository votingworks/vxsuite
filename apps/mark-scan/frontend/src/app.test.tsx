import React from 'react';
import {
  fakeKiosk,
  mockOf,
  suppressingConsoleOutput,
} from '@votingworks/test-utils';
import { ALL_PRECINCTS_SELECTION, MemoryHardware } from '@votingworks/utils';

import fetchMock from 'fetch-mock';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  useBallotStyleManager,
  useDisplaySettingsManager,
} from '@votingworks/mark-flow-ui';
import userEvent from '@testing-library/user-event';
import { screen } from '../test/react_testing_library';
import { advanceTimersAndPromises } from '../test/helpers/timers';
import { render } from '../test/test_utils';
import { App } from './app';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';
import { buildApp } from '../test/helpers/build_app';

jest.mock(
  '@votingworks/mark-flow-ui',
  (): typeof import('@votingworks/mark-flow-ui') => ({
    ...jest.requireActual('@votingworks/mark-flow-ui'),
    useBallotStyleManager: jest.fn(),
    useDisplaySettingsManager: jest.fn(),
  })
);

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  mockOf(useDisplaySettingsManager).mockReset();
});

it('will throw an error when using default api', async () => {
  fetchMock.get('/api', {
    body: {
      machineId: '0002',
      codeVersion: '3.14',
    },
  });
  const hardware = MemoryHardware.buildStandard();

  await suppressingConsoleOutput(async () => {
    render(<App hardware={hardware} />);
    await screen.findByText('Something went wrong');
    userEvent.click(await screen.findButton('Restart'));
    expect(window.kiosk?.reboot).toHaveBeenCalledTimes(1);
  });
});

it('Displays error boundary if the api returns an unexpected error', async () => {
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetElectionState();
  apiMock.expectGetMachineConfigToError();
  const hardware = MemoryHardware.buildStandard();
  await suppressingConsoleOutput(async () => {
    render(
      <App
        hardware={hardware}
        apiClient={apiMock.mockApiClient}
        reload={jest.fn()}
      />
    );
    await advanceTimersAndPromises();
    screen.getByText('Something went wrong');
  });
});

it('prevents context menus from appearing', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetElectionState();
  render(<App apiClient={apiMock.mockApiClient} reload={jest.fn()} />);

  const { oncontextmenu } = window;

  if (oncontextmenu) {
    const event = new MouseEvent('contextmenu');

    jest.spyOn(event, 'preventDefault');
    oncontextmenu.call(window, event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  }

  await advanceTimersAndPromises();
});

it('uses display settings management hook', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetElectionState();

  const { renderApp } = buildApp(apiMock);
  renderApp();

  await advanceTimersAndPromises();

  expect(mockOf(useDisplaySettingsManager)).toBeCalled();
});

it('uses ballot style management hook', async () => {
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState();
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '1_en',
    precinctId: electionGeneralDefinition.election.precincts[0].id,
  });
  apiMock.mockApiClient.updateCardlessVoterBallotStyle
    .expectRepeatedCallsWith({
      ballotStyleId: '1_es-US',
    })
    .resolves();

  mockOf(useBallotStyleManager).mockImplementation((params) =>
    React.useEffect(() => {
      params.updateCardlessVoterBallotStyle({ ballotStyleId: '1_es-US' });
    }, [params])
  );

  buildApp(apiMock).renderApp();

  await advanceTimersAndPromises();

  expect(mockOf(useBallotStyleManager)).toBeCalledWith(
    expect.objectContaining({
      currentBallotStyleId: '1_en',
      electionDefinition: electionGeneralDefinition,
    })
  );
});

// This test is only really here to provide coverage for the default value for
// `App`'s `reload` prop.
it('uses window.location.reload by default', async () => {
  const electionDefinition = electionGeneralDefinition;

  // Stub location in a way that's good enough for this test, but not good
  // enough for general `window.location` use.
  const reload = jest.fn();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetSystemSettings();
  apiMock.expectGetElectionDefinition(electionDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  jest.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload,
  });

  // Set up in an already-configured state.
  const hardware = MemoryHardware.buildStandard();

  render(<App hardware={hardware} apiClient={apiMock.mockApiClient} />);

  await advanceTimersAndPromises();

  // Force refresh
  apiMock.setAuthStatusPollWorkerLoggedIn(electionDefinition);
  await advanceTimersAndPromises();
  userEvent.click(await screen.findByText('Reset Accessible Controller'));
  expect(reload).toHaveBeenCalledTimes(1);
});
