import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { electionSampleDefinition } from '@votingworks/fixtures';
import { makePollWorkerCard } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/shared';
import userEvent from '@testing-library/user-event';
import { App } from '../app';

import { advanceTimersAndPromises } from '../../test/helpers/smartcards';

import {
  contest0,
  contest0candidate0,
  contest0candidate1,
  contest1candidate0,
  setElectionInStorage,
  setStateInStorage,
} from '../../test/helpers/election';

import { getActiveElement, handleGamepadButtonDown } from './gamepad';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('gamepad controls work', async () => {
  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Start voter session
  card.insertCard(makePollWorkerCard(electionSampleDefinition.electionHash));
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('12'));
  card.removeCard();
  await advanceTimersAndPromises();

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
  expect(getActiveElement().dataset['choice']).toEqual(contest0candidate0.id);
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement().dataset['choice']).toEqual(contest0candidate1.id);
  handleGamepadButtonDown('DPadUp');
  expect(getActiveElement().dataset['choice']).toEqual(contest0candidate0.id);

  // test the edge case of rolling over
  handleGamepadButtonDown('DPadUp');
  expect(document.activeElement!.textContent).toEqual('Settings');
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement().dataset['choice']).toEqual(contest0candidate0.id);

  handleGamepadButtonDown('DPadRight');
  await advanceTimersAndPromises();
  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp');
  handleGamepadButtonDown('DPadDown');
  expect(getActiveElement().dataset['choice']).toEqual(contest1candidate0.id);
  handleGamepadButtonDown('DPadLeft');
  await advanceTimersAndPromises();
  // B is same as down
  handleGamepadButtonDown('B');
  expect(getActiveElement().dataset['choice']).toEqual(contest0candidate0.id);

  // select and unselect
  handleGamepadButtonDown('A');
  await advanceTimersAndPromises();
  expect(getActiveElement().dataset['selected']).toEqual('true');
  handleGamepadButtonDown('A');
  await advanceTimersAndPromises();
  expect(getActiveElement().dataset['selected']).toEqual('false');

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(screen.getByText(contest0candidate0.name));
  fireEvent.click(screen.getByText(contest0candidate1.name));
  handleGamepadButtonDown('DPadDown'); // selects Okay button
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  handleGamepadButtonDown('DPadDown'); // Okay button should still be selected
  expect(getActiveElement().textContent).toEqual('Okay');

  await advanceTimersAndPromises();
});
