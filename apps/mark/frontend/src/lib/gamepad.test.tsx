import { MemoryHardware, ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { Button } from 'react-gamepad';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '../../test/react_testing_library';
import { App } from '../app';

import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
} from '../../test/helpers/election';

import {
  getActiveElement,
  handleGamepadButtonDown as unwrappedHandleGamepadButtonDown,
} from './gamepad';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

function handleGamepadButtonDown(button: Button) {
  act(() => {
    unwrappedHandleGamepadButtonDown(button);
  });
}

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('gamepad controls work', async () => {
  const hardware = MemoryHardware.buildStandard();
  apiMock.expectGetMachineConfig();

  apiMock.expectGetElectionDefinition(electionGeneralDefinition);
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(
    <App
      hardware={hardware}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12',
    precinctId: '23',
  });

  await screen.findByText('Start Voting');
  screen.getByText(/Center Springfield/);

  // Go to First Contest
  handleGamepadButtonDown('DPadRight');
  await screen.findByText(contest0.title);

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1);

  // Test navigation by gamepad
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  handleGamepadButtonDown('DPadUp');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // test the edge case of rolling over

  await waitFor(() => {
    handleGamepadButtonDown('DPadUp');
    expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  });

  await waitFor(() => {
    handleGamepadButtonDown('DPadDown');
    expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);
  });

  handleGamepadButtonDown('DPadRight');
  await advanceTimersAndPromises();

  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp');
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement()).toHaveTextContent(contest1candidate0.name);
  handleGamepadButtonDown('DPadLeft');
  await advanceTimersAndPromises();
  // B is same as down
  handleGamepadButtonDown('B');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

  // select candidate
  handleGamepadButtonDown('A');
  const candidate0Option = await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: true,
  });

  // Focus should have jumped to the "Next" button because we're using keyboard nav
  expect(await screen.findByRole('button', { name: 'Next' })).toHaveFocus();

  // Return focus to candidate so we can test unselect
  candidate0Option.focus();
  handleGamepadButtonDown('A');
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: false,
  });

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(screen.getByText(contest0candidate0.name));
  fireEvent.click(screen.getByText(contest0candidate1.name));
  handleGamepadButtonDown('DPadDown'); // selects Okay button
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  expect(screen.getButton(/Okay/i)).toHaveFocus();

  await advanceTimersAndPromises();
});
