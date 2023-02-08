import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { electionSampleDefinition } from '@votingworks/fixtures';
import { expectPrint, makePollWorkerCard } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import userEvent from '@testing-library/user-event';
import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import {
  advanceTimers,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards';

import {
  singleSeatContestWithWriteIn,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { ApiMock, createApiMock } from '../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  const { container } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      apiClient={apiMock.mockApiClient}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);

  function getWithinKeyboard(text: string) {
    return within(screen.getByTestId('virtual-keyboard')).getByText(text);
  }

  // Start voter session
  card.insertCard(makePollWorkerCard(electionSampleDefinition.electionHash));
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('12'));
  card.removeCard();
  await advanceTimersAndPromises();

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'));
  advanceTimers();

  // ====================== END CONTEST SETUP ====================== //

  // Advance to Single-Seat Contest with Write-In
  while (!screen.queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(screen.getByText('Next'));
    advanceTimers();
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  fireEvent.click(screen.getByText('Cancel'));

  // Add Write-In Candidate
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  expect(screen.getByText('Write-In Candidate')).toBeTruthy();
  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot();

  // Enter Write-in Candidate Name
  fireEvent.click(getWithinKeyboard('B'));
  fireEvent.click(getWithinKeyboard('O'));
  fireEvent.click(getWithinKeyboard('V'));
  fireEvent.click(getWithinKeyboard('⌫ delete'));
  fireEvent.click(getWithinKeyboard('B'));
  fireEvent.click(screen.getByText('Accept'));
  advanceTimers();

  // Remove Write-In Candidate
  fireEvent.click(screen.getByText('BOB').closest('button')!);
  fireEvent.click(screen.getByText('Yes, Remove.'));
  advanceTimers();

  // Add Different Write-In Candidate
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  fireEvent.click(getWithinKeyboard('S').closest('button')!);
  fireEvent.click(getWithinKeyboard('A').closest('button')!);
  fireEvent.click(getWithinKeyboard('L').closest('button')!);
  fireEvent.click(screen.getByText('Accept'));
  expect(
    screen.getByText('SAL').closest('button')!.dataset['selected']
  ).toEqual('true');

  // Try to Select Other Candidate when max candidates are selected.
  fireEvent.click(
    screen
      .getByText(singleSeatContestWithWriteIn.candidates[0].name)
      .closest('button')!
  );
  screen.getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for ${singleSeatContestWithWriteIn.candidates[0].name}, you must first unselect the selected candidate.`
  );
  fireEvent.click(screen.getByText('Okay'));

  // Try to add another write-in when max candidates are selected.
  fireEvent.click(
    screen.getByText('add write-in candidate').closest('button')!
  );
  screen.getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for a write-in candidate, you must first unselect the selected candidate.`
  );
  fireEvent.click(screen.getByText('Okay'));

  // Go to review page and confirm write in exists
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    advanceTimers();
  }

  // Review Screen
  await screen.findByText('Review Your Votes');
  expect(screen.getByText('SAL')).toBeTruthy();
  expect(screen.getByText('(write-in)')).toBeTruthy();

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'));
  advanceTimers();
  screen.getByText('Printing Your Official Ballot');
  await expectPrint((printedElement) => {
    expect(printedElement.getByText('Official Ballot')).toBeTruthy();
    expect(printedElement.getByText('(write-in)')).toBeTruthy();
  });
});
