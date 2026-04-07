import { afterEach, beforeEach, expect, test } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import type { BallotPageLayout, Rect } from '@votingworks/types';
import type {
  BallotAdjudicationData,
  BallotImages,
  ContestAdjudicationData,
  CvrContestTag,
  CvrTag,
} from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Route, Switch } from 'react-router-dom';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { BallotAdjudicationScreenWrapper } from './ballot_adjudication_screen';
import { AdjudicationStartScreen } from './adjudication_start_screen';
import { routerPaths } from '../router_paths';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const { election } = electionDefinition;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  apiMock.assertComplete();
});

const CVR_ID_1 = 'cvr-id-1';
const CVR_ID_2 = 'cvr-id-2';

function makeContestTag(overrides: Partial<CvrContestTag> = {}): CvrContestTag {
  return {
    cvrId: CVR_ID_1,
    contestId: 'zoo-council-mammal',
    source: 'scanner',
    isResolved: false,
    hasOvervote: false,
    hasUndervote: false,
    hasWriteIn: true,
    hasUnmarkedWriteIn: false,
    hasMarginalMark: false,
    ...overrides,
  };
}

function makeContestAdjudicationData(
  contestId: string,
  tag?: CvrContestTag
): ContestAdjudicationData {
  const contest = election.contests.find((c) => c.id === contestId);
  if (!contest) {
    throw new Error(`Contest ${contestId} not found`);
  }
  if (contest.type === 'candidate') {
    return {
      contestId,
      options: contest.candidates.map((candidate) => ({
        definition: {
          id: candidate.id,
          contestId,
          name: candidate.name,
          type: 'candidate' as const,
          isWriteIn: false,
        },
        initialVote: false,
        hasMarginalMark: false,
      })),
      tag,
    };
  }
  return {
    contestId,
    options: ['yes', 'no'].map((id) => ({
      definition: {
        id,
        contestId,
        name: id,
        type: 'yesno' as const,
      },
      initialVote: false,
      hasMarginalMark: false,
    })),
    tag,
  };
}

function makeBallotAdjudicationData(
  cvrId: string,
  contests: ContestAdjudicationData[],
  tag?: CvrTag
): BallotAdjudicationData {
  return { cvrId, contests, tag };
}

/**
 * Sets up the standard API expectations for rendering the ballot adjudication
 * screen. Returns the mock data for further assertions.
 */
function setupBasicMocks({
  queue = [CVR_ID_1],
  nextCvrId = CVR_ID_1,
  adjudicationData,
  isBmd = true,
}: {
  queue?: string[];
  nextCvrId?: string | null;
  adjudicationData: BallotAdjudicationData;
  isBmd?: boolean;
}) {
  apiMock.expectGetBallotAdjudicationQueue(queue);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(nextCvrId);
  apiMock.expectGetBallotAdjudicationData(
    { cvrId: adjudicationData.cvrId },
    adjudicationData
  );
  apiMock.expectGetBallotImages({ cvrId: adjudicationData.cvrId }, isBmd);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();
}

function makeHmpbPageLayout(contestIds: string[]): BallotPageLayout {
  return {
    pageSize: { width: 1000, height: 1000 },
    metadata: {
      ballotStyleId: '1M',
      precinctId: 'precinct-1',
      ballotType: BallotType.Precinct,
      ballotHash: 'test-election-hash',
      isTestMode: true,
      pageNumber: 1,
    },
    contests: contestIds.map((contestId) => ({
      contestId,
      bounds: { x: 200, y: 200, width: 600, height: 600 },
      corners: [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 200, y: 800 },
        { x: 800, y: 800 },
      ],
      options: [],
    })),
  };
}

function makeHmpbBallotImages(cvrId: string) {
  const ballotCoordinates = { x: 0, y: 0, width: 1000, height: 1000 } as const;
  return {
    cvrId,
    front: {
      type: 'hmpb' as const,
      imageUrl: `mock-front-image-${cvrId}`,
      ballotCoordinates,
      layout: makeHmpbPageLayout(['zoo-council-mammal']),
    },
    back: {
      type: 'hmpb' as const,
      imageUrl: `mock-back-image-${cvrId}`,
      ballotCoordinates,
      layout: makeHmpbPageLayout(['best-animal-mammal']),
    },
  };
}

function makeResolvedTag(
  contestId: string,
  overrides: Partial<CvrContestTag> = {}
): CvrContestTag {
  return makeContestTag({
    contestId,
    isResolved: true,
    hasWriteIn: false,
    ...overrides,
  });
}

/**
 * Builds a contest with specific initial/adjudicated vote patterns and a
 * resolved tag.
 */
function makeContestWithVotes(
  contestId: string,
  initialVoteIndices: number[],
  adjudicatedVoteIndices: number[],
  tagOverrides: Partial<CvrContestTag> = {}
): ContestAdjudicationData {
  const data = makeContestAdjudicationData(
    contestId,
    makeResolvedTag(contestId, tagOverrides)
  );
  for (const [i, option] of data.options.entries()) {
    option.initialVote = initialVoteIndices.includes(i);
    if (adjudicatedVoteIndices.includes(i) !== option.initialVote) {
      option.voteAdjudication = {
        electionId: 'e',
        cvrId: CVR_ID_1,
        contestId,
        optionId: option.definition.id,
        isVote: adjudicatedVoteIndices.includes(i),
      };
    }
  }
  return data;
}

test('ballot navigation supports back, skip, exit, and side switching', async () => {
  const CVR_ID_3 = 'cvr-id-3';
  const contestData = [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true })
    ),
    makeContestAdjudicationData('best-animal-mammal'),
  ];
  // Ballot 2: only unresolved tag is on back contest -> opens to back side
  const backTaggedContestData = [
    makeContestAdjudicationData('zoo-council-mammal'),
    makeContestAdjudicationData(
      'best-animal-mammal',
      makeContestTag({
        contestId: 'best-animal-mammal',
        hasWriteIn: true,
      })
    ),
  ];
  const adjData1 = makeBallotAdjudicationData(CVR_ID_1, contestData);
  const adjData2 = makeBallotAdjudicationData(CVR_ID_2, backTaggedContestData);
  const adjData3 = makeBallotAdjudicationData(CVR_ID_3, contestData);

  // initial load
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData1);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  // use repeated calls for ballot images since prefetch fires additional requests
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves(makeHmpbBallotImages(CVR_ID_2));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_3 })
    .resolves(makeHmpbBallotImages(CVR_ID_3));

  const history = createMemoryHistory();
  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
    history,
  });

  // starts on first ballot showing front image, no back button on first ballot
  await screen.findByText(/Ballot ID: cvr-/);
  screen.getByText('Ballot 1 of 3');
  expect(
    screen.queryByRole('button', { name: /Back/ })
  ).not.toBeInTheDocument();
  const ballotImage = screen.getByAltText('Full ballot');
  expect(ballotImage).toHaveAttribute('src', `mock-front-image-${CVR_ID_1}`);

  // switch to back side
  const viewButtons = screen.getAllByRole('button', { name: 'View' });
  // the back side's View button is the second one (front is disabled)
  userEvent.click(viewButtons[1]);
  expect(ballotImage).toHaveAttribute('src', `mock-back-image-${CVR_ID_1}`);

  // switch back to front side
  userEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);
  expect(ballotImage).toHaveAttribute('src', `mock-front-image-${CVR_ID_1}`);

  // skip to second ballot — first pending contest is on back, so opens to back
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_2 }, adjData2);
  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 2 of 3');
  expect(screen.getByRole('button', { name: /Back/ })).toBeEnabled();
  await waitFor(() => {
    expect(ballotImage).toHaveAttribute('src', `mock-back-image-${CVR_ID_2}`);
  });

  // skip to third (last) ballot
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_3 }, adjData3);
  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 3 of 3');

  // back to second ballot (data is cached from earlier visit)
  userEvent.click(screen.getByRole('button', { name: /Back/ }));
  await screen.findByText('Ballot 2 of 3');

  // exit navigates to adjudication start screen
  userEvent.click(screen.getByRole('button', { name: /Exit/ }));
  expect(history.location.pathname).toEqual('/adjudication');
});

test('accept button state depends on contest resolution', async () => {
  // disabled when unresolved write-ins exist
  const unresolvedAdjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true, isResolved: false })
    ),
  ]);
  setupBasicMocks({ adjudicationData: unresolvedAdjData });

  const { unmount } = renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled();
  unmount();

  // enabled when all contests resolved
  apiMock = createApiMock();
  const resolvedAdjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ isResolved: true })
    ),
  ]);
  setupBasicMocks({ adjudicationData: resolvedAdjData, nextCvrId: null });

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeEnabled();
});

test('confirmation modal back returns and accept anyway resolves and navigates to start screen', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({
        hasWriteIn: false,
        hasUndervote: true,
        isResolved: false,
      })
    ),
  ]);

  const history = createMemoryHistory({
    initialEntries: [routerPaths.ballotAdjudication],
  });

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(
    <Switch>
      <Route
        path={routerPaths.ballotAdjudication}
        component={BallotAdjudicationScreenWrapper}
      />
      <Route
        path={routerPaths.adjudication}
        component={AdjudicationStartScreen}
      />
    </Switch>,
    {
      electionDefinition,
      apiMock,
      history,
    }
  );

  await screen.findByText(/Ballot ID/);

  // click Accept -> modal appears
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));
  await screen.findByText('Incomplete Adjudication');

  // click Back in modal -> returns to ballot screen
  const modal = screen.getByRole('alertdialog');
  userEvent.click(within(modal).getByRole('button', { name: 'Back' }));
  await waitFor(() => {
    expect(
      screen.queryByText('Incomplete Adjudication')
    ).not.toBeInTheDocument();
  });
  screen.getByText(/Ballot ID/);

  // click Accept again -> modal reappears
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));
  await screen.findByText('Incomplete Adjudication');

  // click Accept Anyway -> resolves ballot and navigates to start screen
  apiMock.expectResolveBallotTags({ cvrId: CVR_ID_1 });
  // invalidated queries refetch after resolve
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotAdjudicationQueue([]);
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    totalTally: 1,
    pendingTally: 0,
  });
  apiMock.expectGetNextCvrIdForBallotAdjudication(null);
  // start screen fetches
  apiMock.expectGetCastVoteRecordFiles([
    {
      id: 'file-1',
      electionId: 'election-1',
      filename: 'test.jsonl',
      exportTimestamp: new Date().toISOString(),
      numCvrsImported: 1,
      precinctIds: ['precinct-1'],
      scannerIds: ['scanner-1'],
      sha256Hash: 'hash',
      createdAt: new Date().toISOString(),
    },
  ]);

  userEvent.click(screen.getByRole('button', { name: 'Accept Anyway' }));

  // verify start screen shows 1 Ballot Completed
  await screen.findByText('1 Ballot Completed');
  screen.getByText('0 Ballots Awaiting Review');
});

test('clicking a contest opens contest adjudication screen', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true, isResolved: false })
    ),
    makeContestAdjudicationData('best-animal-mammal'),
  ]);

  // Use HMPB images so zoo-council-mammal is on front, best-animal-mammal on back
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Zoo Council');

  // click front-side contest to open contest adjudication
  userEvent.click(screen.getByText('Zoo Council'));
  await screen.findByText(/Votes cast:/);

  // cancel returns to ballot adjudication screen
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByText('Zoo Council');
  screen.getByText('Best Animal');

  // click back-side contest to open contest adjudication with side='back'
  userEvent.click(screen.getByText('Best Animal'));
  await screen.findByText(/Votes cast:/);

  // cancel returns to ballot adjudication screen
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByText('Zoo Council');

  // keyboard: pressing an unrelated key does nothing
  const zooCouncilItem = screen.getByText('Zoo Council').closest('li')!;
  fireEvent.keyDown(zooCouncilItem, { key: 'a' });
  screen.getByText('Zoo Council'); // still on ballot screen

  // keyboard: repeated Enter is ignored
  fireEvent.keyDown(zooCouncilItem, { key: 'Enter', repeat: true });
  screen.getByText('Zoo Council'); // still on ballot screen

  // keyboard: Enter opens contest adjudication (data cached from first visit)
  fireEvent.keyDown(zooCouncilItem, { key: 'Enter' });
  await screen.findByText(/Votes cast:/);
});

test('contest hover highlights pending yellow, resolved purple, and back-side no highlight', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    // front contest, pending (unresolved write-in) -> yellow highlight
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({
        contestId: 'zoo-council-mammal',
        hasWriteIn: true,
        isResolved: false,
      })
    ),
    // front contest, resolved -> purple highlight
    makeContestAdjudicationData(
      'best-animal-mammal',
      makeContestTag({
        contestId: 'best-animal-mammal',
        hasWriteIn: true,
        isResolved: true,
      })
    ),
    // back contest, pending -> no highlight when viewing front
    makeContestAdjudicationData(
      'new-zoo-either',
      makeContestTag({
        contestId: 'new-zoo-either',
        hasWriteIn: true,
        isResolved: false,
      })
    ),
  ]);

  const ballotCoordinates: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
  const ballotImages: BallotImages = {
    cvrId: CVR_ID_1,
    front: {
      type: 'hmpb' as const,
      imageUrl: 'mock-front-image',
      ballotCoordinates,
      layout: makeHmpbPageLayout(['zoo-council-mammal', 'best-animal-mammal']),
    },
    back: {
      type: 'hmpb' as const,
      imageUrl: 'mock-back-image',
      ballotCoordinates,
      layout: makeHmpbPageLayout(['new-zoo-either']),
    },
  };

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(ballotImages);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Zoo Council');

  const ballotImage = screen.getByAltText('Full ballot');
  const imageWrapper = ballotImage.parentElement!;

  function getHighlightOverlay(): HTMLElement | null {
    // the highlight overlay is a positioned div sibling of the ballot image
    return imageWrapper.querySelector('div');
  }

  // no highlight initially
  expect(getHighlightOverlay()).not.toBeInTheDocument();

  // hover over pending front contest -> orange/warning highlight
  const zooCouncilItem = screen.getByText('Zoo Council').closest('li')!;
  fireEvent.mouseEnter(zooCouncilItem);
  const warningHighlight = getHighlightOverlay();
  expect(warningHighlight).toBeInTheDocument();
  expect(warningHighlight).toHaveStyle({
    background: 'rgba(220, 120, 0, 0.1)',
  });

  // mouse leave clears highlight
  fireEvent.mouseLeave(zooCouncilItem);
  expect(getHighlightOverlay()).not.toBeInTheDocument();

  // hover over resolved front contest -> purple highlight
  const bestAnimalItem = screen.getByText('Best Animal').closest('li')!;
  fireEvent.mouseEnter(bestAnimalItem);
  const resolvedHighlight = getHighlightOverlay();
  expect(resolvedHighlight).toBeInTheDocument();
  expect(resolvedHighlight).toHaveStyle({
    background: 'rgba(100, 50, 200, 0.1)',
  });
  fireEvent.mouseLeave(bestAnimalItem);

  // hover over back-side contest while viewing front -> no highlight
  const ballotMeasureItem = screen
    .getByText('Ballot Measure 1 - Part 1')
    .closest('li')!;
  fireEvent.mouseEnter(ballotMeasureItem);
  expect(getHighlightOverlay()).not.toBeInTheDocument();
  fireEvent.mouseLeave(ballotMeasureItem);
});

test('accept advances to next ballot and blank ballot callout states', async () => {
  const CVR_ID_3 = 'cvr-id-3';

  // Ballot 1: resolved non-blank ballot
  const adjData1 = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ isResolved: true })
    ),
  ]);

  // Ballot 2: unresolved blank ballot (no adjudicated votes)
  const adjData2Unresolved = makeBallotAdjudicationData(
    CVR_ID_2,
    [
      makeContestAdjudicationData(
        'zoo-council-mammal',
        makeContestTag({
          cvrId: CVR_ID_2,
          contestId: 'zoo-council-mammal',
          hasWriteIn: false,
          hasUndervote: true,
          isResolved: false,
        })
      ),
    ],
    { cvrId: CVR_ID_2, isBlankBallot: true, isResolved: false }
  );

  // Ballot 2 after resolve: confirmed blank ballot
  const adjData2Resolved = makeBallotAdjudicationData(
    CVR_ID_2,
    [
      makeContestAdjudicationData(
        'zoo-council-mammal',
        makeContestTag({
          cvrId: CVR_ID_2,
          contestId: 'zoo-council-mammal',
          hasWriteIn: false,
          hasUndervote: true,
          isResolved: true,
        })
      ),
    ],
    { cvrId: CVR_ID_2, isBlankBallot: true, isResolved: true }
  );

  // Ballot 3: blank ballot with an adjudicated vote on one option
  const adjData3 = makeBallotAdjudicationData(
    CVR_ID_3,
    [makeContestAdjudicationData('zoo-council-mammal')],
    { cvrId: CVR_ID_3, isBlankBallot: true, isResolved: true }
  );
  adjData3.contests[0].options[0].voteAdjudication = {
    electionId: 'election-1',
    cvrId: CVR_ID_3,
    contestId: 'zoo-council-mammal',
    optionId: adjData3.contests[0].options[0].definition.id,
    isVote: true,
  };

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData1);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves(makeHmpbBallotImages(CVR_ID_2));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_3 })
    .resolves(makeHmpbBallotImages(CVR_ID_3));

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  // Ballot 1: resolved non-blank, accept advances to ballot 2
  await screen.findByText('Ballot 1 of 3');
  expect(screen.queryByText(/Blank Ballot/)).not.toBeInTheDocument();

  apiMock.expectResolveBallotTags({ cvrId: CVR_ID_1 });
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData1);
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_2);
  apiMock.expectGetBallotAdjudicationData(
    { cvrId: CVR_ID_2 },
    adjData2Unresolved
  );
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));

  // Ballot 2: blank, unresolved -> "Blank Ballot Detected"
  await screen.findByText('Ballot 2 of 3');
  await screen.findByText('Blank Ballot Detected');

  // Blank ballot callout has a View button to switch sides
  const ballotImage = screen.getByAltText('Full ballot');
  expect(ballotImage).toHaveAttribute('src', `mock-front-image-${CVR_ID_2}`);
  userEvent.click(screen.getByRole('button', { name: 'View Back' }));
  expect(ballotImage).toHaveAttribute('src', `mock-back-image-${CVR_ID_2}`);
  userEvent.click(screen.getByRole('button', { name: 'View Front' }));
  expect(ballotImage).toHaveAttribute('src', `mock-front-image-${CVR_ID_2}`);

  // Blank ballot with only undervotes counts as allResolved, so Accept
  // directly resolves without a confirmation modal
  apiMock.expectResolveBallotTags({ cvrId: CVR_ID_2 });
  apiMock.expectGetBallotAdjudicationData(
    { cvrId: CVR_ID_2 },
    adjData2Resolved
  );
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_3);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_3 }, adjData3);
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));

  // Ballot 3: blank with adjudicated vote -> "Blank Ballot Resolved"
  await screen.findByText('Ballot 3 of 3');
  await screen.findByText('Blank Ballot Resolved');
  screen.getByText('At least one contest now has a valid vote');
});

test('contest list shows correct status line captions', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    // best-animal-mammal: 1 seat. 2 initial → 2 adjudicated = Overvote Confirmed
    makeContestWithVotes('best-animal-mammal', [0, 1], [0, 1], {
      hasOvervote: true,
    }),
    // best-animal-fish: 1 seat. 0 initial → 0 adjudicated = Undervote Confirmed
    makeContestWithVotes('best-animal-fish', [], [], { hasUndervote: true }),
    // zoo-council-mammal: 3 seats. 4 initial → 3 adjudicated = Overvote Resolved
    makeContestWithVotes('zoo-council-mammal', [0, 1, 2, 3], [0, 1, 2], {
      hasOvervote: true,
    }),
    // aquarium-council-fish: 2 seats. 3 initial → 1 adjudicated =
    //   Overvote Resolved; Undervote Created
    makeContestWithVotes('aquarium-council-fish', [0, 1, 2], [0], {
      hasOvervote: true,
    }),
    // new-zoo-either: yesno, 1 vote. 0 initial → 2 adjudicated = Overvote Created
    makeContestWithVotes('new-zoo-either', [], [0, 1]),
    // new-zoo-pick: yesno, 1 vote. 0 initial → 1 adjudicated = Undervote Resolved
    makeContestWithVotes('new-zoo-pick', [], [0], { hasUndervote: true }),
    // fishing: yesno, 1 vote. 1 initial → 0 adjudicated = Undervote Created
    makeContestWithVotes('fishing', [0], [], { hasUndervote: true }),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings({
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.Undervote],
  });

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findAllByText('Best Animal');

  function contestItem(name: string) {
    return within(screen.getByText(name).closest('li')!);
  }
  function contestItems(name: string) {
    return screen.getAllByText(name).map((el) => within(el.closest('li')!));
  }

  // best-animal-mammal: Overvote Confirmed
  const [bestAnimalMammal, bestAnimalFish] = contestItems('Best Animal');
  bestAnimalMammal.getByText('Overvote Confirmed');

  // best-animal-fish: Undervote Confirmed
  bestAnimalFish.getByText('Undervote Confirmed');

  // zoo-council-mammal: Overvote Resolved
  const [zooCouncil, aquariumCouncil] = contestItems('Zoo Council');
  zooCouncil.getByText('Overvote Resolved');

  // aquarium-council-fish: Overvote Resolved; Undervote Created
  aquariumCouncil.getByText('Overvote Resolved; Undervote Created');

  // new-zoo-either: Overvote Created
  contestItem('Ballot Measure 1 - Part 1').getByText('Overvote Created');

  // new-zoo-pick: Undervote Resolved
  contestItem('Ballot Measure 1 - Part 2').getByText('Undervote Resolved');

  // fishing: Undervote Created
  contestItem('Ballot Measure 3').getByText('Undervote Created');
});

test('contest list suppresses undervote captions when not in system settings', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    // best-animal-mammal: 1 seat. 2 initial → 2 adjudicated = Overvote Confirmed
    // (overvote captions should still show)
    makeContestWithVotes('best-animal-mammal', [0, 1], [0, 1], {
      hasOvervote: true,
    }),
    // new-zoo-pick: yesno, 1 vote. 0 initial → 1 adjudicated
    // "Undervote Resolved" when enabled, suppressed when disabled
    makeContestWithVotes('new-zoo-pick', [], [0], { hasUndervote: true }),
    // fishing: yesno, 1 vote. 1 initial → 0 adjudicated
    // "Undervote Created" when enabled, suppressed when disabled
    makeContestWithVotes('fishing', [0], [], { hasUndervote: true }),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  // Default system settings — no AdjudicationReason.Undervote
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Best Animal');

  function contestItem(name: string) {
    return within(screen.getByText(name).closest('li')!);
  }

  // Overvote caption still shows
  contestItem('Best Animal').getByText('Overvote Confirmed');

  // Undervote captions are suppressed
  expect(
    contestItem('Ballot Measure 1 - Part 2').queryByText('Undervote Resolved')
  ).not.toBeInTheDocument();
  expect(
    contestItem('Ballot Measure 3').queryByText('Undervote Created')
  ).not.toBeInTheDocument();
});

test('contest list shows correct option resolution bullets', async () => {
  const WRITE_IN_CANDIDATE_ID = 'write-in-candidate-1';
  const WRITE_IN_CANDIDATE_NAME = 'Mickey Mouse';

  // zoo-council-mammal: 4 official candidates + 3 write-in options
  const zooCouncil = makeContestAdjudicationData(
    'zoo-council-mammal',
    makeContestTag({
      isResolved: true,
      hasWriteIn: true,
      hasUnmarkedWriteIn: true,
      hasMarginalMark: true,
    })
  );

  // Add write-in options
  const writeInBase = {
    contestId: 'zoo-council-mammal',
    cvrId: CVR_ID_1,
    electionId: 'e',
  } as const;
  zooCouncil.options.push(
    {
      definition: {
        id: 'write-in-0',
        contestId: 'zoo-council-mammal',
        name: 'Write-In #1',
        type: 'candidate' as const,
        isWriteIn: true,
      },
      initialVote: true,
      hasMarginalMark: false,
      writeInRecord: {
        id: 'wr-0',
        optionId: 'write-in-0',
        status: 'adjudicated' as const,
        adjudicationType: 'official-candidate' as const,
        candidateId: 'zebra',
        ...writeInBase,
      },
    },
    {
      definition: {
        id: 'write-in-1',
        contestId: 'zoo-council-mammal',
        name: 'Write-In #2',
        type: 'candidate' as const,
        isWriteIn: true,
      },
      initialVote: true,
      hasMarginalMark: false,
      writeInRecord: {
        id: 'wr-1',
        optionId: 'write-in-1',
        status: 'adjudicated' as const,
        adjudicationType: 'write-in-candidate' as const,
        candidateId: WRITE_IN_CANDIDATE_ID,
        ...writeInBase,
      },
    },
    {
      definition: {
        id: 'write-in-2',
        contestId: 'zoo-council-mammal',
        name: 'Write-In #3',
        type: 'candidate' as const,
        isWriteIn: true,
      },
      initialVote: true,
      hasMarginalMark: false,
      writeInRecord: {
        id: 'wr-2',
        optionId: 'write-in-2',
        status: 'adjudicated' as const,
        adjudicationType: 'invalid' as const,
        ...writeInBase,
      },
    },
    {
      definition: {
        id: 'write-in-3',
        contestId: 'zoo-council-mammal',
        name: 'Write-In #4',
        type: 'candidate' as const,
        isWriteIn: true,
      },
      initialVote: true,
      hasMarginalMark: false,
      writeInRecord: {
        id: 'wr-3',
        optionId: 'write-in-3',
        status: 'adjudicated' as const,
        adjudicationType: 'invalid' as const,
        isUnmarked: true,
        ...writeInBase,
      },
    }
  );

  // Marginal mark on first two candidates (one valid, one invalid)
  zooCouncil.options[0].hasMarginalMark = true;
  zooCouncil.options[0].initialVote = true;
  zooCouncil.options[0].voteAdjudication = {
    electionId: 'e',
    cvrId: CVR_ID_1,
    contestId: 'zoo-council-mammal',
    optionId: 'zebra',
    isVote: true,
  };
  zooCouncil.options[1].hasMarginalMark = true;
  zooCouncil.options[1].initialVote = false;

  // best-animal-mammal: vote adjudication bullets (no marginal marks, no write-ins)
  const bestAnimal = makeContestAdjudicationData(
    'best-animal-mammal',
    makeContestTag({
      contestId: 'best-animal-mammal',
      isResolved: true,
      hasWriteIn: false,
    })
  );
  // Undetected Mark adjudicated as Valid (isVote=true, no initial vote)
  bestAnimal.options[0].voteAdjudication = {
    electionId: 'e',
    cvrId: CVR_ID_1,
    contestId: 'best-animal-mammal',
    optionId: 'horse',
    isVote: true,
  };
  // Mark adjudicated as Invalid (isVote=false, had initial vote)
  bestAnimal.options[1].initialVote = true;
  bestAnimal.options[1].voteAdjudication = {
    electionId: 'e',
    cvrId: CVR_ID_1,
    contestId: 'best-animal-mammal',
    optionId: 'otter',
    isVote: false,
  };

  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    zooCouncil,
    bestAnimal,
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectAdjudicationScreenQueries();
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetBallotAdjudicationData({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([
    {
      id: WRITE_IN_CANDIDATE_ID,
      electionId: 'e',
      contestId: 'zoo-council-mammal',
      name: WRITE_IN_CANDIDATE_NAME,
    },
  ]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Zoo Council');

  function findTextInContest(contestName: string, expectedText: string) {
    const item = within(screen.getByText(contestName).closest('li')!);
    item.getByText((_c, node) => node?.textContent === expectedText);
  }

  // Zoo Council: write-in bullets
  findTextInContest('Zoo Council', 'Write-In adjudicated for Zebra');
  findTextInContest(
    'Zoo Council',
    `Write-In adjudicated for ${WRITE_IN_CANDIDATE_NAME}`
  );
  findTextInContest('Zoo Council', 'Write-In adjudicated as Invalid');
  findTextInContest('Zoo Council', 'Ambiguous Write-In adjudicated as Invalid');

  // Zoo Council: marginal mark bullets
  findTextInContest(
    'Zoo Council',
    'Marginal Mark for Zebra adjudicated as Valid'
  );
  findTextInContest(
    'Zoo Council',
    'Marginal Mark for Lion adjudicated as Invalid'
  );

  // Best Animal: vote adjudication bullets
  findTextInContest(
    'Best Animal',
    'Undetected Mark for Horse adjudicated as Valid'
  );
  findTextInContest('Best Animal', 'Mark for Otter adjudicated as Invalid');
});
