import React from 'react';
import { fireEvent, render, within, act, screen } from '@testing-library/react';
import { electionSample } from '@votingworks/fixtures';
import { makeVoterCard } from '@votingworks/test-utils';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';

import { App } from './app';

import { withMarkup } from '../test/helpers/with_markup';

import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  measure102Contest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fake_machine_config';

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  const machineConfig = fakeMachineConfigProvider();

  await setElectionInStorage(storage);
  await setStateInStorage(storage);

  render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
      reload={jest.fn()}
    />
  );
  await advanceTimersAndPromises();

  // Insert Voter Card
  card.insertCard(makeVoterCard(electionSample));
  await advanceTimersAndPromises();

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'));
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  const getByTextWithMarkup = withMarkup(screen.getByText);

  // Advance to multi-seat contest
  while (!screen.queryByText(measure102Contest.title)) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  const contestChoices = within(screen.getByTestId('contest-choices'));

  // Select Yes
  fireEvent.click(contestChoices.getByText('Yes'));
  expect(
    contestChoices.getByText('Yes').closest('button')!.dataset['selected']
  ).toBe('true');

  // Unselect Yes
  fireEvent.click(contestChoices.getByText('Yes'));
  expect(
    contestChoices.getByText('Yes').closest('button')!.dataset['selected']
  ).toBe('false');

  // Check that the aria label was updated to be deselected properly and is then removed
  expect(contestChoices.getByText('Yes').getAttribute('aria-label')).toContain(
    'Deselected,'
  );
  expect(
    contestChoices.getByText('No').getAttribute('aria-label')
  ).not.toContain('Deselected,');
  act(() => {
    jest.advanceTimersByTime(101);
  });
  expect(
    contestChoices.getByText('Yes').getAttribute('aria-label')
  ).not.toContain('Deselected,');

  // Select Yes
  fireEvent.click(contestChoices.getByText('Yes'));
  expect(
    contestChoices.getByText('Yes').closest('button')!.dataset['selected']
  ).toBe('true');

  // Select No
  fireEvent.click(contestChoices.getByText('No'));
  expect(
    contestChoices.getByText('No').closest('button')!.dataset['selected']
  ).toBe('false');

  // Overvote modal is displayed
  getByTextWithMarkup(
    'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
  );
  fireEvent.click(screen.getByText('Okay'));
  await advanceTimersAndPromises(); // For 200ms Delay in closing modal

  // Go to review page and confirm write in exists
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  const reviewTitle = getByTextWithMarkup(
    `${measure102Contest.section}${measure102Contest.title}`
  );
  const siblingTextContent =
    (reviewTitle.nextSibling && reviewTitle.nextSibling.textContent) || '';
  expect(siblingTextContent.trim()).toBe(
    `Yes on ${measure102Contest.shortTitle}`
  );
});
