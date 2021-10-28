import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils';
import { Route } from 'react-router-dom';
import {
  getBallotStyle,
  getContests,
  parseElection,
  vote,
} from '@votingworks/types';
import { asElectionDefinition } from '@votingworks/fixtures';
import { makeVoterCard } from '@votingworks/test-utils';
import electionSample from './data/electionSample.json';

import App from './App';
import PrintPage from './pages/PrintPage';

import { render as renderWithBallotContext } from '../test/testUtils';
import withMarkup from '../test/helpers/withMarkup';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
  measure420Contest,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election';
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig';

jest.setTimeout(10_000);

beforeEach(() => {
  jest.useFakeTimers();
  window.location.href = '/';
});

const election = parseElection(electionSample);
const electionDefinition = asElectionDefinition(parseElection(electionSample));

test('Renders Ballot with EitherNeither: blank', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '12',
    precinctId: '23',
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId: '12',
        })!,
        election,
      }),
      {
        '420A': [],
        '420B': [],
      }
    ),
  });
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title);
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    '[no selection]'
  );
});

test('Renders Ballot with EitherNeither: Either & blank', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '12',
    precinctId: '23',
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId: '12',
        })!,
        election,
      }),
      {
        '420A': ['yes'],
        '420B': [],
      }
    ),
  });
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title);
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    `• ${measure420Contest.eitherOption.label}`
  );
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe('• [no selection]');
});

test('Renders Ballot with EitherNeither: Neither & firstOption', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '12',
    precinctId: '23',
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId: '12',
        })!,
        election,
      }),
      {
        '420A': ['no'],
        '420B': ['yes'],
      }
    ),
  });
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title);
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    `• ${measure420Contest.neitherOption.label}`
  );
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe(`• ${measure420Contest.firstOption.label}`);
});

test('Renders Ballot with EitherNeither: blank & secondOption', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '12',
    precinctId: '23',
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId: '12',
        })!,
        election,
      }),
      {
        '420A': [],
        '420B': ['no'],
      }
    ),
  });
  await advanceTimersAndPromises();
  const getByTextWithMarkup = withMarkup(screen.getByText);
  const contestReviewTitle = getByTextWithMarkup(measure420Contest.title);
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    '• [no selection]'
  );
  expect(
    contestReviewTitle?.nextSibling?.nextSibling?.textContent?.trim()
  ).toBe(`• ${measure420Contest.secondOption.label}`);
});

test('Can vote on a Mississippi Either Neither Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = await MemoryHardware.buildStandard();
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
  card.insertCard(makeVoterCard(election));
  await advanceTimersAndPromises();

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'));
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  const getByTextWithMarkup = withMarkup(screen.getByText);

  // Advance to multi-seat contest
  while (!screen.queryByText(measure420Contest.title)) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Select and Unselect Options
  fireEvent.click(screen.getByText(measure420Contest.eitherOption.label));
  fireEvent.click(screen.getByText(measure420Contest.neitherOption.label));
  await advanceTimersAndPromises(); // allow "deselection" timer to run
  fireEvent.click(screen.getByText(measure420Contest.neitherOption.label));
  await advanceTimersAndPromises(); // allow "deselection" timer to run

  fireEvent.click(screen.getByText(measure420Contest.firstOption.label));
  fireEvent.click(screen.getByText(measure420Contest.secondOption.label));
  await advanceTimersAndPromises(); // allow "deselection" timer to run
  fireEvent.click(screen.getByText(measure420Contest.secondOption.label));
  await advanceTimersAndPromises(); // allow "deselection" timer to run

  // Go to Review Screen
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Confirm there is no vote
  let contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  );
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for either and first option
  fireEvent.click(screen.getByText(measure420Contest.eitherOption.label));
  fireEvent.click(screen.getByText(measure420Contest.firstOption.label));

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  );
  const eitherAndFirst = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling;
  expect(eitherAndFirst?.textContent?.trim()).toBe('For either');
  expect(eitherAndFirst?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420A'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for neither and second option
  fireEvent.click(screen.getByText(measure420Contest.neitherOption.label));
  fireEvent.click(screen.getByText(measure420Contest.secondOption.label));

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  );
  const neitherAndSecond = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling;
  expect(neitherAndSecond?.textContent?.trim()).toBe('Against both');
  expect(neitherAndSecond?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420B'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for none and second option
  fireEvent.click(screen.getByText(measure420Contest.neitherOption.label));

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  );
  const noneAndSecond = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling;
  expect(noneAndSecond?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  );
  expect(noneAndSecond?.nextSibling?.textContent?.trim()).toBe(
    'FOR Measure 420B'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for either and no option
  fireEvent.click(screen.getByText(measure420Contest.eitherOption.label));
  fireEvent.click(screen.getByText(measure420Contest.secondOption.label));

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  );
  const eitherAndNone = getByTextWithMarkup(
    `${measure420Contest.section}${measure420Contest.title}`
  ).nextSibling;
  expect(eitherAndNone?.textContent?.trim()).toBe('For either');
  expect(eitherAndNone?.nextSibling?.textContent?.trim()).toBe(
    'You may still vote in this contest.'
  );
});
