import React from 'react';

import { MemoryStorage, MemoryHardware } from '@votingworks/utils';
import { fireEvent, render, screen } from '../../test/react_testing_library';
import { App } from '../app';

import { advanceTimersAndPromises } from '../../test/helpers/timers';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
  electionDefinition,
  setStateInStorage,
} from '../../test/helpers/election';

import { getActiveElement, handleGamepadButtonDown } from './gamepad';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

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
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();
  apiMock.expectGetElectionDefinition(electionDefinition);
  await setStateInStorage(storage);

  render(
    <App
      hardware={hardware}
      storage={storage}
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
  await advanceTimersAndPromises();

  // First Contest Page
  screen.getByText(contest0.title);

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
  handleGamepadButtonDown('DPadUp');
  expect(document.activeElement!.textContent).toEqual('Next');
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement()).toHaveTextContent(contest0candidate0.name);

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

  // select and unselect
  handleGamepadButtonDown('A');
  await advanceTimersAndPromises();
  screen.getByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: true,
  });
  handleGamepadButtonDown('A');
  await advanceTimersAndPromises();
  screen.getByRole('option', {
    name: new RegExp(contest0candidate0.name),
    selected: false,
  });

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(screen.getByText(contest0candidate0.name));
  fireEvent.click(screen.getByText(contest0candidate1.name));
  handleGamepadButtonDown('DPadDown'); // selects Okay button
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  expect(getActiveElement().textContent).toEqual('Okay');

  await advanceTimersAndPromises();
});
