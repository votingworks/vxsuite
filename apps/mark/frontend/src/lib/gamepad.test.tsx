import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { Button } from 'react-gamepad';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { BallotStyleId } from '@votingworks/types';
import {
  act,
  fireEvent,
  render,
  screen,
} from '../../test/react_testing_library';
import { App } from '../app';

import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
} from '../../test/helpers/election';

import { handleGamepadButtonDown as unwrappedHandleGamepadButtonDown } from './gamepad';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

function handleGamepadButtonDown(button: Button) {
  act(() => {
    unwrappedHandleGamepadButtonDown(button);
  });
}

function getActiveElement() {
  return document.activeElement;
}

let apiMock: ApiMock;

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  apiMock = createApiMock();
  apiMock.expectGetSystemSettings();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('gamepad controls work', async () => {
  apiMock.expectGetMachineConfig();

  apiMock.expectGetElectionRecord(readElectionGeneralDefinition());
  apiMock.expectGetElectionState({
    precinctSelection: ALL_PRECINCTS_SELECTION,
    pollsState: 'polls_open',
  });

  render(<App apiClient={apiMock.mockApiClient} reload={vi.fn()} />);
  await advanceTimersAndPromises();

  // Start voter session
  apiMock.setAuthStatusCardlessVoterLoggedIn({
    ballotStyleId: '12' as BallotStyleId,
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

  await vi.waitFor(() => {
    handleGamepadButtonDown('DPadUp');
    expect(getActiveElement()).toHaveTextContent(contest0candidate1.name);
  });

  await vi.waitFor(() => {
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
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: true,
  });

  handleGamepadButtonDown('A');
  await screen.findByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: false,
  });

  // Confirm 'Continue' is only active element on page. Modal is "true" modal.
  fireEvent.click(screen.getByText(contest0candidate0.name));
  fireEvent.click(screen.getByText(contest0candidate1.name));
  handleGamepadButtonDown('DPadDown'); // selects Okay button
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  expect(screen.getButton(/Continue/i)).toHaveFocus();

  await advanceTimersAndPromises();
});
