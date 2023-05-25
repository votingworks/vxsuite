import React from 'react';
import { MemoryStorage, MemoryHardware } from '@votingworks/utils';

import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../test/react_testing_library';
import { App } from './app';

import { advanceTimersAndPromises } from '../test/helpers/timers';

import {
  countyCommissionersContest,
  electionDefinition,
  setStateInStorage,
} from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

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

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  apiMock.expectGetElectionDefinition(electionDefinition);
  await setStateInStorage(storage);

  const { container } = render(
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

  // Go to First Contest
  userEvent.click(await screen.findByText('Start Voting'));
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = countyCommissionersContest.candidates[0];
  const candidate1 = countyCommissionersContest.candidates[1];
  const candidate2 = countyCommissionersContest.candidates[2];
  const candidate3 = countyCommissionersContest.candidates[3];
  const candidate4 = countyCommissionersContest.candidates[4];

  // Advance to multi-seat contest
  while (!screen.queryByText(countyCommissionersContest.title)) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Select 5 candidates for 4 seats
  fireEvent.click(screen.getByText(candidate0.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate1.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate2.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate3.name));
  await advanceTimersAndPromises();
  fireEvent.click(screen.getByText(candidate4.name));
  await advanceTimersAndPromises();

  // Overvote modal is displayed
  screen.getByText(
    `You may only select ${countyCommissionersContest.seats} candidates in this contest. To vote for ${candidate4.name}, you must first unselect the selected candidates.`
  );

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot();

  // Go to Review Screen
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Expect to see the first four selected candidates
  expect(screen.getByText(candidate0.name)).toBeTruthy();
  expect(screen.getByText(candidate1.name)).toBeTruthy();
  expect(screen.getByText(candidate2.name)).toBeTruthy();
  expect(screen.getByText(candidate3.name)).toBeTruthy();
});
