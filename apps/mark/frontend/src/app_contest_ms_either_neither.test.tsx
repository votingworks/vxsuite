import React from 'react';
import {
  fireEvent,
  render,
  RenderResult,
  screen,
} from '@testing-library/react';
import {
  MemoryStorage,
  MemoryCard,
  MemoryHardware,
  singlePrecinctSelectionFor,
} from '@votingworks/shared';
import { Route } from 'react-router-dom';
import {
  getBallotStyle,
  getContestDistrictName,
  getContests,
  vote,
} from '@votingworks/types';
import { expectPrint, makePollWorkerCard } from '@votingworks/test-utils';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { assert, assertDefined, find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { App } from './app';
import { PrintPage } from './pages/print_page';

import { render as renderWithBallotContext } from '../test/test_utils';
import { withMarkup } from '../test/helpers/with_markup';
import { advanceTimersAndPromises } from '../test/helpers/smartcards';

import {
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

const electionDefinition = electionWithMsEitherNeitherDefinition;
const { election } = electionDefinition;
const eitherNeitherContestId = '750000015';
const pickOneContestId = '750000016';
const eitherNeitherContest = find(
  election.contests,
  (c) => c.id === eitherNeitherContestId
);
const pickOneContest = find(
  election.contests,
  (c) => c.id === pickOneContestId
);
assert(eitherNeitherContest.type === 'yesno');
assert(pickOneContest.type === 'yesno');

const ballotStyleId = '1';
const precinctId = '6526';

function expectPrintedVotes(
  printedElement: RenderResult,
  expectedVotes: {
    eitherNeither: string;
    pickOne: string;
  }
) {
  const getByTextWithMarkup = withMarkup(printedElement.getAllByText);
  // Because eitherNeitherContest and pickOneContest have the same title in the
  // fixture we're using, we have to use their index to get the correct one.
  const eitherNeitherContestReviewTitle = getByTextWithMarkup(
    eitherNeitherContest.title
  )[0];
  expect(
    eitherNeitherContestReviewTitle?.nextSibling?.textContent?.trim()
  ).toEqual(expectedVotes.eitherNeither);
  const pickOneContestReviewTitle = getByTextWithMarkup(
    pickOneContest.title
  )[1];
  expect(pickOneContestReviewTitle?.nextSibling?.textContent?.trim()).toEqual(
    expectedVotes.pickOne
  );
}

test('Renders Ballot with EitherNeither: blank', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId,
    precinctId,
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId,
        })!,
        election,
      }),
      {
        [eitherNeitherContestId]: [],
        [pickOneContestId]: [],
      }
    ),
  });
  await expectPrint((printedElement) => {
    expectPrintedVotes(printedElement, {
      eitherNeither: '[no selection]',
      pickOne: '[no selection]',
    });
  });
});

test('Renders Ballot with EitherNeither: Either & blank', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId,
    precinctId,
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId,
        })!,
        election,
      }),
      {
        [eitherNeitherContestId]: ['yes'],
        [pickOneContestId]: [],
      }
    ),
  });
  await expectPrint((printedElement) => {
    expectPrintedVotes(printedElement, {
      eitherNeither: assertDefined(eitherNeitherContest.yesOption).label,
      pickOne: '[no selection]',
    });
  });
});

test('Renders Ballot with EitherNeither: Neither & firstOption', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId,
    precinctId,
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId,
        })!,
        election,
      }),
      {
        [eitherNeitherContestId]: ['no'],
        [pickOneContestId]: ['yes'],
      }
    ),
  });
  await expectPrint((printedElement) => {
    expectPrintedVotes(printedElement, {
      eitherNeither: assertDefined(eitherNeitherContest.noOption).label,
      pickOne: assertDefined(pickOneContest.yesOption).label,
    });
  });
});

test('Renders Ballot with EitherNeither: blank & secondOption', async () => {
  renderWithBallotContext(<Route path="/print" component={PrintPage} />, {
    ballotStyleId,
    precinctId,
    route: '/print',
    electionDefinition,
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election,
          ballotStyleId,
        })!,
        election,
      }),
      {
        [eitherNeitherContestId]: [],
        [pickOneContestId]: ['no'],
      }
    ),
  });
  await expectPrint((printedElement) => {
    expectPrintedVotes(printedElement, {
      eitherNeither: '[no selection]',
      pickOne: assertDefined(pickOneContest.noOption).label,
    });
  });
});

test('Can vote on a Mississippi Either Neither Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard();
  const hardware = MemoryHardware.buildStandard();
  const storage = new MemoryStorage();
  apiMock.expectGetMachineConfig();

  await setElectionInStorage(storage, electionDefinition);
  await setStateInStorage(storage, {
    appPrecinct: singlePrecinctSelectionFor(precinctId),
  });

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
  card.insertCard(makePollWorkerCard(electionDefinition.electionHash));
  await advanceTimersAndPromises();
  userEvent.click(screen.getByText('2'));
  card.removeCard();
  await advanceTimersAndPromises();

  // Go to First Contest
  fireEvent.click(screen.getByText('Start Voting'));
  await advanceTimersAndPromises();

  // ====================== END CONTEST SETUP ====================== //

  const getByTextWithMarkup = withMarkup(screen.getByText);

  // Advance to multi-seat contest
  while (!screen.queryByText(eitherNeitherContest.title)) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Select and Unselect Options
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.yesOption).label)
  );
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.noOption).label)
  );
  await advanceTimersAndPromises(); // allow "deselection" timer to run
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.noOption).label)
  );
  await advanceTimersAndPromises(); // allow "deselection" timer to run

  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.yesOption).label)
  );
  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.noOption).label)
  );
  await advanceTimersAndPromises(); // allow "deselection" timer to run
  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.noOption).label)
  );
  await advanceTimersAndPromises(); // allow "deselection" timer to run

  // Go to Review Screen
  while (!screen.queryByText('Review Your Votes')) {
    fireEvent.click(screen.getByText('Next'));
    await advanceTimersAndPromises();
  }

  // Confirm there is no vote
  const districtName = getContestDistrictName(election, eitherNeitherContest);
  let contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  expect(contestReviewTitle?.nextSibling?.textContent?.trim()).toEqual(
    'You may still vote in this contest.'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Go to Review Screen with no votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  const reviewVote = contestReviewTitle.nextSibling;
  expect(reviewVote?.textContent?.trim()).toEqual(
    'You may still vote in this contest.'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for either and first option
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.yesOption).label)
  );
  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.yesOption).label)
  );

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  const eitherAndFirst = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  ).nextSibling;
  expect(eitherAndFirst?.textContent?.trim()).toEqual(
    'FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A'
  );
  expect(eitherAndFirst?.nextSibling?.textContent?.trim()).toEqual(
    'FOR Initiative Measure No. 65'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for neither and second option
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.noOption).label)
  );
  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.noOption).label)
  );

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  const neitherAndSecond = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  ).nextSibling;
  expect(neitherAndSecond?.textContent?.trim()).toEqual(
    'AGAINST BOTH Initiative Measure No. 65 AND Alternative Measure No. 65 A'
  );
  expect(neitherAndSecond?.nextSibling?.textContent?.trim()).toEqual(
    'FOR Alternative Measure 65 A'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for none and second option
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.noOption).label)
  );

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  const noneAndSecond = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  ).nextSibling;
  expect(noneAndSecond?.textContent?.trim()).toEqual(
    'You may still vote in this contest.'
  );
  expect(noneAndSecond?.nextSibling?.textContent?.trim()).toEqual(
    'FOR Alternative Measure 65 A'
  );

  // Go to Contest Screen
  fireEvent.click(contestReviewTitle);
  await advanceTimersAndPromises();

  // Vote for either and no option
  fireEvent.click(
    screen.getByText(assertDefined(eitherNeitherContest.yesOption).label)
  );
  fireEvent.click(
    screen.getByText(assertDefined(pickOneContest.noOption).label)
  );

  // Go to Review Screen to confirm votes
  fireEvent.click(screen.getByText('Review'));
  await advanceTimersAndPromises();
  contestReviewTitle = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  );
  const eitherAndNone = getByTextWithMarkup(
    `${districtName}${eitherNeitherContest.title}`
  ).nextSibling;
  expect(eitherAndNone?.textContent?.trim()).toEqual(
    'FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A'
  );
  expect(eitherAndNone?.nextSibling?.textContent?.trim()).toEqual(
    'You may still vote in this contest.'
  );
});
