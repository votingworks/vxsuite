import { afterEach, beforeEach, expect, test } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import type { BallotPageLayout, Rect } from '@votingworks/types';
import type {
  AdjudicatedCvrContest,
  AdjudicatedContestOptions,
  BallotAdjudicationData,
  BallotImages,
  ContestAdjudicationData,
  CvrContestTag,
  CvrTag,
  WriteInRecord,
} from '@votingworks/admin-backend';
import {
  HIGHLIGHT_PRIMARY_BACKGROUND,
  HIGHLIGHT_WARNING_BACKGROUND,
} from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Route, Switch } from 'react-router-dom';
import { assertDefined, err } from '@votingworks/basics';
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
        scannedVote: false,
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
      scannedVote: false,
      hasMarginalMark: false,
    })),
    tag,
  };
}

function makeBallotAdjudicationData(
  cvrId: string,
  contests: ContestAdjudicationData[],
  {
    tag = { isBlankBallot: false },
    isResolved = false,
    adjudicatedContests = [],
  }: {
    tag?: CvrTag;
    isResolved?: boolean;
    adjudicatedContests?: AdjudicatedCvrContest[];
  } = {}
): BallotAdjudicationData {
  return { cvrId, contests, tag, isResolved, adjudicatedContests };
}

function makeAdjudicatedCvrContest(
  contestId: string,
  optionVotes: Record<string, boolean> = {}
): AdjudicatedCvrContest {
  const adjudicatedContestOptionById: AdjudicatedContestOptions = {};
  for (const [optionId, hasVote] of Object.entries(optionVotes)) {
    adjudicatedContestOptionById[optionId] = {
      type: 'official-option',
      hasVote,
    };
  }
  return { contestId, adjudicatedContestOptionById };
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
  apiMock.expectGetNextCvrIdForBallotAdjudication(nextCvrId);
  apiMock.expectClaimAndLoadBallot(
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

/**
 * Builds a contest with specific initial/adjudicated vote patterns and an
 * adjudicated record. Returns the contest and the corresponding
 * AdjudicatedCvrContest entry.
 */
function makeContestWithVotes(
  contestId: string,
  initialVoteIndices: number[],
  adjudicatedVoteIndices: number[],
  tagOverrides: Partial<CvrContestTag> = {}
): { contest: ContestAdjudicationData; adjudicated: AdjudicatedCvrContest } {
  const contest = makeContestAdjudicationData(
    contestId,
    makeContestTag({ hasWriteIn: false, ...tagOverrides })
  );
  const optionVotes: Record<string, boolean> = {};
  for (const [i, option] of contest.options.entries()) {
    option.scannedVote = initialVoteIndices.includes(i);
    optionVotes[option.definition.id] = adjudicatedVoteIndices.includes(i);
  }
  const adjudicated = makeAdjudicatedCvrContest(contestId, optionVotes);
  return { contest, adjudicated };
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
  const adjData1 = makeBallotAdjudicationData(CVR_ID_1, contestData);
  const adjData2 = makeBallotAdjudicationData(CVR_ID_2, contestData);
  const adjData3 = makeBallotAdjudicationData(CVR_ID_3, contestData);

  // initial load
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData1);

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

  // starts on first ballot showing front image, no Back button on first ballot
  await screen.findByText(/Ballot ID: cvr-/);
  screen.getByText('Ballot 1 of 3');
  expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  const ballotImage = screen.getByRole('img', { name: /ballot/i });
  expect(ballotImage.style.backgroundImage).toContain(
    `mock-front-image-${CVR_ID_1}`
  );

  // switch to back side — the View button for the currently-hidden side is
  // the enabled one
  function enabledViewButton(): HTMLElement {
    const button = screen
      .getAllByRole('button', { name: 'View' })
      .find((b) => !(b as HTMLButtonElement).disabled);
    return assertDefined(button);
  }
  userEvent.click(enabledViewButton());
  // Re-query inside waitFor so a stale node reference (if React replaces the
  // button across renders) can't hide a successful state flip.
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-back-image-${CVR_ID_1}`)
  );

  // switch back to front side
  userEvent.click(enabledViewButton());
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-front-image-${CVR_ID_1}`)
  );

  // skip to second ballot
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);
  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 2 of 3');
  expect(screen.getByRole('button', { name: /Back/ })).toBeEnabled();

  // skip to third (last) ballot
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_2 });
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_3 }, adjData3);
  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 3 of 3');

  // back to second ballot — staleTime: 0 triggers a refetch
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_3 });
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);
  userEvent.click(screen.getByRole('button', { name: /Back/ }));
  await screen.findByText('Ballot 2 of 3');

  // exit navigates to adjudication start screen
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_2 });
  userEvent.click(screen.getByRole('button', { name: /Exit/ }));
  await waitFor(() =>
    expect(history.location.pathname).toEqual('/adjudication')
  );
});

test('opens to the back side when the only pending contest is on the back', async () => {
  // Front contest has no tag; back contest is the only one needing adjudication.
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData('zoo-council-mammal'),
    makeContestAdjudicationData(
      'best-animal-mammal',
      makeContestTag({ hasOvervote: true })
    ),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Ballot 1 of 1');
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-back-image-${CVR_ID_1}`)
  );

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('default side flips to next pending after confirming a contest', async () => {
  // Pending tags on both front (Zoo Council) and back (Best Animal).
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasOvervote: true })
    ),
    makeContestAdjudicationData(
      'best-animal-mammal',
      makeContestTag({ hasOvervote: true })
    ),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  // First pending is on the front, so the screen opens to the front.
  await screen.findByText('Ballot 1 of 1');
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-front-image-${CVR_ID_1}`)
  );

  // Confirm the front contest -> next pending is on the back -> flip to back.
  userEvent.click(screen.getByText('Zoo Council'));
  await screen.findByRole('button', { name: /Confirm/ });
  userEvent.click(screen.getByRole('checkbox', { name: /lion/i }));
  userEvent.click(screen.getByRole('button', { name: /Confirm/ }));
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-back-image-${CVR_ID_1}`)
  );

  // Confirm the back contest -> nothing pending -> falls back to front.
  userEvent.click(screen.getByText('Best Animal'));
  await screen.findByRole('button', { name: /Confirm/ });
  userEvent.click(screen.getByRole('checkbox', { name: /horse/i }));
  userEvent.click(screen.getByRole('button', { name: /Confirm/ }));
  await waitFor(() =>
    expect(
      screen.getByRole('img', { name: /ballot/i }).style.backgroundImage
    ).toContain(`mock-front-image-${CVR_ID_1}`)
  );

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('skip / back / exit prompt to discard when the user has unsaved adjudications', async () => {
  const adjData2 = makeBallotAdjudicationData(CVR_ID_2, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasOvervote: true })
    ),
  ]);
  const adjData1 = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData('zoo-council-mammal'),
  ]);

  // Start at ballot 2 of 2 so Skip, Back, and Exit are all visible
  // (Back only renders past the first ballot in the queue).
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_2);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves(makeHmpbBallotImages(CVR_ID_2));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Ballot 2 of 2');

  userEvent.click(screen.getByText('Zoo Council'));
  await screen.findByRole('button', { name: /Confirm/ });
  userEvent.click(screen.getByRole('checkbox', { name: /lion/i }));
  userEvent.click(screen.getByRole('button', { name: /Confirm/ }));
  await screen.findByText('Ballot 2 of 2');

  // Skip with un-Accepted edits prompts the discard modal; modal Back
  // keeps the user on this ballot and preserves the buffer.
  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Unsaved Changes');
  userEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => {
    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
  });

  // Exit triggers the same prompt; modal Back again preserves the buffer.
  userEvent.click(screen.getByRole('button', { name: /Exit/ }));
  await screen.findByText('Unsaved Changes');
  userEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => {
    expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
  });

  // Back triggers the prompt; this time Discard clears the buffer and
  // navigation proceeds to ballot 1.
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_2 });
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData1);
  userEvent.click(screen.getByRole('button', { name: /^Back$/ }));
  await screen.findByText('Unsaved Changes');
  userEvent.click(screen.getByRole('button', { name: /Discard/ }));
  await screen.findByText('Ballot 1 of 2');

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('re-opening a Confirmed contest preserves the in-progress adjudication', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasOvervote: true })
    ),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();
  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);

  userEvent.click(screen.getByText('Zoo Council'));
  await screen.findByRole('button', { name: /Confirm/ });
  expect(screen.getByRole('checkbox', { name: /lion/i })).not.toBeChecked();
  userEvent.click(screen.getByRole('checkbox', { name: /lion/i }));
  expect(screen.getByRole('checkbox', { name: /lion/i })).toBeChecked();
  userEvent.click(screen.getByRole('button', { name: /Confirm/ }));
  await screen.findByText('Ballot 1 of 1');

  // Re-open the same contest and verify the lion vote is still selected.
  userEvent.click(screen.getByText('Zoo Council'));
  await screen.findByRole('button', { name: /Confirm/ });
  expect(screen.getByRole('checkbox', { name: /lion/i })).toBeChecked();

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('accept button state depends on contest resolution', async () => {
  // disabled when unresolved write-ins exist
  const unresolvedAdjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true })
    ),
  ]);
  setupBasicMocks({ adjudicationData: unresolvedAdjData });

  const { unmount } = renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled();
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  unmount();

  // enabled when all contests resolved
  apiMock = createApiMock();
  const resolvedAdjData = makeBallotAdjudicationData(
    CVR_ID_1,
    [makeContestAdjudicationData('zoo-council-mammal', makeContestTag({}))],
    {
      adjudicatedContests: [makeAdjudicatedCvrContest('zoo-council-mammal')],
    }
  );
  setupBasicMocks({ adjudicationData: resolvedAdjData, nextCvrId: null });

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeEnabled();
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('confirmation modal back returns and accept anyway resolves and navigates to start screen', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({
        hasWriteIn: false,
        hasUndervote: true,
      })
    ),
  ]);

  const history = createMemoryHistory({
    initialEntries: [routerPaths.ballotAdjudication],
  });

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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
    expect(screen.queryByText('Incomplete Adjudication')).toBeNull();
  });
  screen.getByText(/Ballot ID/);

  // click Accept again -> modal reappears
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));
  await screen.findByText('Incomplete Adjudication');

  // click Accept Anyway -> resolves ballot and navigates to start screen
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  apiMock.expectAdjudicateCvr({ cvrId: CVR_ID_1, contests: [] });
  // invalidated queries refetch after resolve
  apiMock.expectGetBallotAdjudicationQueue([]);
  apiMock.expectGetBallotAdjudicationQueueMetadata({
    totalTally: 1,
    pendingTally: 0,
  });
  apiMock.expectGetNextCvrIdForBallotAdjudication(null, CVR_ID_1);
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
  apiMock.apiClient.getQualifiedWriteInCandidates
    .expectRepeatedCallsWith()
    .resolves([]);

  userEvent.click(screen.getByRole('button', { name: 'Accept Anyway' }));

  // verify start screen shows the completed state
  await screen.findByText('All ballots adjudicated');
});

test('clicking a contest opens contest adjudication screen', async () => {
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true })
    ),
    makeContestAdjudicationData('best-animal-mammal'),
  ]);

  // Use HMPB images so zoo-council-mammal is on front, best-animal-mammal on back
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('contest hover highlights pending yellow, resolved purple, and back-side no highlight', async () => {
  const adjData = makeBallotAdjudicationData(
    CVR_ID_1,
    [
      // front contest, pending (unresolved write-in) -> yellow highlight
      makeContestAdjudicationData(
        'zoo-council-mammal',
        makeContestTag({
          hasWriteIn: true,
        })
      ),
      // front contest, resolved -> purple highlight
      makeContestAdjudicationData(
        'best-animal-mammal',
        makeContestTag({
          hasWriteIn: true,
        })
      ),
      // back contest, pending -> no highlight when viewing front
      makeContestAdjudicationData(
        'new-zoo-either',
        makeContestTag({
          hasWriteIn: true,
        })
      ),
    ],
    {
      adjudicatedContests: [makeAdjudicatedCvrContest('best-animal-mammal')],
    }
  );

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
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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

  const ballotImage = screen.getByRole('img', { name: /ballot/i });

  function getHighlightOverlay(): HTMLElement | null {
    // the highlight overlay is a child div of the ballot image container
    return ballotImage.querySelector('div');
  }

  // no highlight initially
  expect(getHighlightOverlay()).toBeNull();

  // hover over pending front contest -> orange/warning highlight
  const zooCouncilItem = screen.getByText('Zoo Council').closest('li')!;
  fireEvent.mouseEnter(zooCouncilItem);
  const warningHighlight = getHighlightOverlay();
  expect(warningHighlight).not.toBeNull();
  expect(warningHighlight).toHaveStyle({
    background: HIGHLIGHT_WARNING_BACKGROUND,
  });

  // mouse leave clears highlight
  fireEvent.mouseLeave(zooCouncilItem);
  expect(getHighlightOverlay()).toBeNull();

  // hover over resolved front contest -> purple highlight
  const bestAnimalItem = screen.getByText('Best Animal').closest('li')!;
  fireEvent.mouseEnter(bestAnimalItem);
  const resolvedHighlight = getHighlightOverlay();
  expect(resolvedHighlight).not.toBeNull();
  expect(resolvedHighlight).toHaveStyle({
    background: HIGHLIGHT_PRIMARY_BACKGROUND,
  });
  fireEvent.mouseLeave(bestAnimalItem);

  // hover over back-side contest while viewing front -> no highlight
  const ballotMeasureItem = screen
    .getByText('Ballot Measure 1 - Part 1')
    .closest('li')!;
  fireEvent.mouseEnter(ballotMeasureItem);
  expect(getHighlightOverlay()).toBeNull();
  fireEvent.mouseLeave(ballotMeasureItem);
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('accept advances to next ballot and blank ballot callout states', async () => {
  const CVR_ID_3 = 'cvr-id-3';

  // Ballot 1: resolved non-blank ballot
  const adjData1 = makeBallotAdjudicationData(
    CVR_ID_1,
    [makeContestAdjudicationData('zoo-council-mammal')],
    { isResolved: true }
  );

  // Ballot 2: unresolved blank ballot (no adjudicated votes)
  const adjData2Unresolved = makeBallotAdjudicationData(
    CVR_ID_2,
    [
      makeContestAdjudicationData(
        'zoo-council-mammal',
        makeContestTag({
          hasWriteIn: false,
          hasUndervote: true,
        })
      ),
    ],
    { tag: { isBlankBallot: true } }
  );

  // (Ballot 2's resolved form is no longer needed in this test — the
  // wrapper doesn't refetch it after adjudicate; navigateAcceptNext
  // moves straight to ballot 3.)

  // Ballot 3: blank ballot with an adjudicated vote on one option
  const zooCouncilContest = makeContestAdjudicationData('zoo-council-mammal');
  const adjData3 = makeBallotAdjudicationData(CVR_ID_3, [zooCouncilContest], {
    tag: { isBlankBallot: true },
    isResolved: true,
    adjudicatedContests: [
      makeAdjudicatedCvrContest('zoo-council-mammal', {
        [zooCouncilContest.options[0].definition.id]: true,
      }),
    ],
  });

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData1);
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
  expect(screen.queryByText(/Blank Ballot/)).toBeNull();

  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  apiMock.expectAdjudicateCvr({ cvrId: CVR_ID_1, contests: [] });
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_2, CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2Unresolved);
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));

  // Ballot 2: blank, unresolved -> "Blank Ballot Detected"
  await screen.findByText('Ballot 2 of 3');
  await screen.findByText('Blank Ballot Detected');

  // Blank ballot callout has a View button to switch sides
  const ballotImage = screen.getByRole('img', { name: /ballot/i });
  expect(ballotImage.style.backgroundImage).toContain(
    `mock-front-image-${CVR_ID_2}`
  );
  userEvent.click(screen.getByRole('button', { name: 'View Back' }));
  expect(ballotImage.style.backgroundImage).toContain(
    `mock-back-image-${CVR_ID_2}`
  );
  userEvent.click(screen.getByRole('button', { name: 'View Front' }));
  expect(ballotImage.style.backgroundImage).toContain(
    `mock-front-image-${CVR_ID_2}`
  );

  // Blank ballot with only undervotes counts as allResolved, so Accept
  // directly resolves without a confirmation modal
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_2 });
  apiMock.expectAdjudicateCvr({ cvrId: CVR_ID_2, contests: [] });
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2, CVR_ID_3]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_3, CVR_ID_2);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_3 }, adjData3);
  userEvent.click(screen.getByRole('button', { name: /Accept/ }));

  // Ballot 3: blank with adjudicated vote -> "Blank Ballot Resolved"
  await screen.findByText('Ballot 3 of 3');
  await screen.findByText('Blank Ballot Resolved');
  screen.getByText('At least one contest now has a valid vote');
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_3 })
    .resolves();
});

test('accept on the last ballot wraps back to an earlier unresolved ballot', async () => {
  // Two ballots in the queue, with the host positioned on the LAST one
  // (CVR_ID_2). CVR_ID_1 was Skipped earlier, so it's still unresolved.
  // Accepting the last ballot must loop back to CVR_ID_1 rather than exit.
  function bmdImages(cvrId: string): BallotImages {
    const ballotCoordinates: Rect = { x: 0, y: 0, width: 1000, height: 1000 };
    return {
      cvrId,
      front: { type: 'bmd', imageUrl: `mock-${cvrId}`, ballotCoordinates },
      back: { type: 'bmd', imageUrl: `mock-${cvrId}`, ballotCoordinates },
    };
  }

  const adjData1 = makeBallotAdjudicationData(
    CVR_ID_1,
    [makeContestAdjudicationData('zoo-council-mammal')],
    { isResolved: true }
  );
  const adjData2 = makeBallotAdjudicationData(
    CVR_ID_2,
    [makeContestAdjudicationData('zoo-council-mammal')],
    { isResolved: true }
  );

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  // The bare "next ballot" query positions the host on the last ballot.
  apiMock.apiClient.getNextCvrIdForBallotAdjudication
    .expectOptionalRepeatedCallsWith()
    .resolves(CVR_ID_2);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves(bmdImages(CVR_ID_2));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(bmdImages(CVR_ID_1));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Ballot 2 of 2');

  // Accept the last ballot. Nothing comes after it, but CVR_ID_1 is still
  // unresolved, so navigateAcceptNext re-queries without a cursor and loops
  // back to CVR_ID_1 instead of exiting adjudication.
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_2 });
  apiMock.expectAdjudicateCvr({ cvrId: CVR_ID_2, contests: [] });
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  // The backend wraps around, so the single after-current lookup returns
  // CVR_ID_1 directly.
  apiMock.apiClient.getNextCvrIdForBallotAdjudication
    .expectCallWith({ currentCvrId: CVR_ID_2 })
    .resolves(CVR_ID_1);
  apiMock.apiClient.getNextCvrIdForBallotAdjudication
    .expectOptionalRepeatedCallsWith()
    .resolves(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData1);

  userEvent.click(screen.getByRole('button', { name: /Accept/ }));

  await screen.findByText('Ballot 1 of 2');

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('contest list shows correct status line captions', async () => {
  const contestEntries = [
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
  ];
  const adjData = makeBallotAdjudicationData(
    CVR_ID_1,
    contestEntries.map((e) => e.contest),
    { adjudicatedContests: contestEntries.map((e) => e.adjudicated) }
  );

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('contest list suppresses undervote captions when not in system settings', async () => {
  const contestEntries = [
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
  ];
  const adjData = makeBallotAdjudicationData(
    CVR_ID_1,
    contestEntries.map((e) => e.contest),
    { adjudicatedContests: contestEntries.map((e) => e.adjudicated) }
  );

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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
  ).toBeNull();
  expect(
    contestItem('Ballot Measure 3').queryByText('Undervote Created')
  ).toBeNull();
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('contest list shows correct option resolution bullets', async () => {
  const WRITE_IN_CANDIDATE_ID = 'write-in-candidate-1';
  const WRITE_IN_CANDIDATE_NAME = 'Mickey Mouse';

  // zoo-council-mammal: 4 official candidates + 3 write-in options
  const zooCouncil = makeContestAdjudicationData(
    'zoo-council-mammal',
    makeContestTag({
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
      scannedVote: true,
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
      scannedVote: true,
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
      scannedVote: true,
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
      scannedVote: true,
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
  zooCouncil.options[0].scannedVote = true;
  zooCouncil.options[1].hasMarginalMark = true;
  zooCouncil.options[1].scannedVote = false;

  // best-animal-mammal: vote adjudication bullets (no marginal marks, no write-ins)
  const bestAnimal = makeContestAdjudicationData(
    'best-animal-mammal',
    makeContestTag({
      hasWriteIn: false,
    })
  );
  // Mark adjudicated as Invalid (scannedVote=true, adjudicatedVote=false)
  bestAnimal.options[1].scannedVote = true;

  const adjData = makeBallotAdjudicationData(
    CVR_ID_1,
    [zooCouncil, bestAnimal],
    {
      adjudicatedContests: [
        {
          contestId: 'zoo-council-mammal',
          adjudicatedContestOptionById: {
            // Marginal marks - official options
            [zooCouncil.options[0].definition.id]: {
              type: 'official-option',
              hasVote: true,
            },
            [zooCouncil.options[1].definition.id]: {
              type: 'official-option',
              hasVote: false,
            },
            // Other official candidates (no change, but included for completeness)
            [zooCouncil.options[2].definition.id]: {
              type: 'official-option',
              hasVote: false,
            },
            [zooCouncil.options[3].definition.id]: {
              type: 'official-option',
              hasVote: false,
            },
            // Write-ins
            'write-in-0': {
              type: 'write-in-option',
              candidateType: 'official-candidate',
              hasVote: true,
              candidateId: 'zebra',
            },
            'write-in-1': {
              type: 'write-in-option',
              candidateType: 'write-in-candidate',
              hasVote: true,
              candidateName: WRITE_IN_CANDIDATE_NAME,
            },
            'write-in-2': { type: 'write-in-option', hasVote: false },
            'write-in-3': { type: 'write-in-option', hasVote: false },
          },
        },
        makeAdjudicatedCvrContest('best-animal-mammal', {
          // Undetected Mark adjudicated as Valid (scannedVote=false → true)
          [bestAnimal.options[0].definition.id]: true,
          // Mark adjudicated as Invalid (scannedVote=true → false)
          [bestAnimal.options[1].definition.id]: false,
          [bestAnimal.options[2].definition.id]: false,
        }),
      ],
    }
  );

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
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
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('multi-station mode claims ballots on mount and releases on navigation', async () => {
  const contestData = [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true })
    ),
  ];
  const adjData1 = makeBallotAdjudicationData(CVR_ID_1, contestData);
  const adjData2 = makeBallotAdjudicationData(CVR_ID_2, contestData);

  // Wrapper-level queries
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);

  // Data loader queries for ballot 1
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData1);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  // Initial mount claims CVR_ID_1

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Ballot 1 of 2');

  // Navigate to next — releases CVR_ID_1, claims CVR_ID_2
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_2 }, true);

  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 2 of 2');
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves();
});

test('Skip onto a ballot claimed by another machine shows read-only overlay and the claimed ballot ID', async () => {
  // Use distinct 4-char prefixes so the "Ballot ID: XXXX" header can be
  // distinguished between the two ballots.
  const FIRST_CVR_ID = 'aaaa-first';
  const CLAIMED_CVR_ID = 'bbbb-claimed';
  const contestData = [
    makeContestAdjudicationData(
      'zoo-council-mammal',
      makeContestTag({ hasWriteIn: true })
    ),
  ];
  const adjData1 = makeBallotAdjudicationData(FIRST_CVR_ID, contestData);

  // CLAIMED_CVR_ID is claimed by another machine; queue is [first, claimed].
  apiMock.expectGetBallotAdjudicationQueue([FIRST_CVR_ID, CLAIMED_CVR_ID]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(FIRST_CVR_ID);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  // Initial mount on FIRST_CVR_ID.
  apiMock.expectClaimAndLoadBallot({ cvrId: FIRST_CVR_ID }, adjData1);
  apiMock.expectGetBallotImages({ cvrId: FIRST_CVR_ID }, true);

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Ballot 1 of 2');
  await screen.findByText('Ballot ID: aaaa');

  // Skip from FIRST_CVR_ID advances by one position to CLAIMED_CVR_ID which
  // is held by another machine — the wrapper surfaces a `no-claim` error so
  // the screen renders the "claimed by another machine" overlay. The header
  // should still update to the claimed ballot's ID even though we never
  // loaded its adjudication data.
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: FIRST_CVR_ID });
  apiMock.apiClient.claimAndLoadBallot
    .expectCallWith({ cvrId: CLAIMED_CVR_ID })
    .resolves(err({ type: 'no-claim' }));
  apiMock.expectGetBallotImages({ cvrId: CLAIMED_CVR_ID }, true);

  userEvent.click(screen.getByRole('button', { name: /Skip/ }));
  await screen.findByText('Ballot 2 of 2');
  await screen.findByText(
    'This ballot is currently being adjudicated by another machine.'
  );
  await screen.findByText('Ballot ID: bbbb');

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: FIRST_CVR_ID })
    .resolves();
});

test('shows an error with exit when the claim+load fails', async () => {
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  // The claim+load fails with a non-"no-claim" error (e.g. the host backend
  // errored), so there's no ballot data and no claimed-by-another overlay.
  apiMock.apiClient.claimAndLoadBallot
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(err({ type: 'host-disconnect' }));
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings();

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Unable to load ballot. Please try again.');
  screen.getByRole('button', { name: 'Exit' });
});

function makePendingWriteInRecord(
  contestId: string,
  optionId: string,
  cvrId: string = CVR_ID_1
): WriteInRecord {
  return {
    status: 'pending',
    id: `wir-${contestId}-${optionId}`,
    cvrId,
    contestId,
    electionId: 'e',
    optionId,
  };
}

function addPendingWriteIns(
  contest: ContestAdjudicationData,
  numberOfWriteIns: number,
  recordedSlots: number[]
): void {
  for (let i = 0; i < numberOfWriteIns; i += 1) {
    contest.options.push({
      definition: {
        id: `write-in-${i}`,
        contestId: contest.contestId,
        name: `Write-In #${i + 1}`,
        type: 'candidate' as const,
        isWriteIn: true,
      },
      scannedVote: recordedSlots.includes(i),
      hasMarginalMark: false,
      writeInRecord: recordedSlots.includes(i)
        ? makePendingWriteInRecord(contest.contestId, `write-in-${i}`)
        : undefined,
    });
  }
}

const QUALIFIED_SYSTEM_SETTINGS: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  areWriteInCandidatesQualified: true,
};

test('auto-resolves a write-in-only contest with no qualified candidates', async () => {
  const contestId = 'zoo-council-mammal';
  const contest = makeContestAdjudicationData(
    contestId,
    makeContestTag({ hasWriteIn: true })
  );
  // Two of three write-in slots have a pending record.
  addPendingWriteIns(contest, 3, [0, 1]);
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [contest]);
  // Second ballot is just a destination to advance to after Accept.
  const adjData2 = makeBallotAdjudicationData(CVR_ID_2, [
    makeContestAdjudicationData(
      contestId,
      makeContestTag({ hasOvervote: true })
    ),
  ]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves(makeHmpbBallotImages(CVR_ID_1));
  apiMock.apiClient.getBallotImages
    .expectRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves(makeHmpbBallotImages(CVR_ID_2));
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings(QUALIFIED_SYSTEM_SETTINGS);

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  // Accept enables only when the contest list shows the contest as resolved.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Accept/ })).toBeEnabled();
  });

  const expectedAdjudication: AdjudicatedCvrContest = {
    contestId,
    adjudicatedContestOptionById: {
      zebra: { type: 'official-option', hasVote: false },
      lion: { type: 'official-option', hasVote: false },
      kangaroo: { type: 'official-option', hasVote: false },
      elephant: { type: 'official-option', hasVote: false },
      'write-in-0': { type: 'write-in-option', hasVote: false },
      'write-in-1': { type: 'write-in-option', hasVote: false },
      'write-in-2': { type: 'write-in-option', hasVote: false },
    },
  };
  apiMock.expectReleaseBallotAdjudicationClaim({ cvrId: CVR_ID_1 });
  apiMock.expectAdjudicateCvr({
    cvrId: CVR_ID_1,
    contests: [expectedAdjudication],
  });
  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1, CVR_ID_2]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_2, CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_2 }, adjData2);

  userEvent.click(screen.getByRole('button', { name: /Accept/ }));
  await screen.findByText('Ballot 2 of 2');
  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_2 })
    .resolves();
});

test('auto-resolves contests flagged with hasUnmarkedWriteIn', async () => {
  const contestId = 'zoo-council-mammal';
  const contest = makeContestAdjudicationData(
    contestId,
    makeContestTag({
      hasWriteIn: false,
      hasUnmarkedWriteIn: true,
    })
  );
  addPendingWriteIns(contest, 3, [0]);
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [contest]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings(QUALIFIED_SYSTEM_SETTINGS);

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Accept/ })).toBeEnabled();
  });

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test.each([
  { flag: 'hasOvervote' as const, label: 'hasOvervote' },
  { flag: 'hasUndervote' as const, label: 'hasUndervote' },
  { flag: 'hasMarginalMark' as const, label: 'hasMarginalMark' },
])(
  'does not auto-resolve a contest also flagged with $label',
  async ({ flag }) => {
    const contestId = 'zoo-council-mammal';
    const contest = makeContestAdjudicationData(
      contestId,
      makeContestTag({ hasWriteIn: true, [flag]: true })
    );
    addPendingWriteIns(contest, 3, [0]);
    const adjData = makeBallotAdjudicationData(CVR_ID_1, [contest]);

    apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
    apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
    apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
    apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
    apiMock.expectGetWriteInCandidates([]);
    apiMock.expectGetSystemSettings(QUALIFIED_SYSTEM_SETTINGS);

    renderInAppContext(<BallotAdjudicationScreenWrapper />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(/Ballot ID/);
    expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled();

    apiMock.apiClient.releaseBallotAdjudicationClaim
      .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
      .resolves();
  }
);

test('does not auto-resolve when qualified candidates exist for the contest', async () => {
  const contestId = 'zoo-council-mammal';
  const contest = makeContestAdjudicationData(
    contestId,
    makeContestTag({ hasWriteIn: true })
  );
  addPendingWriteIns(contest, 3, [0]);
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [contest]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([
    { id: 'qual-1', name: 'Qualified Person', electionId: 'e', contestId },
  ]);
  apiMock.expectGetSystemSettings(QUALIFIED_SYSTEM_SETTINGS);

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled();

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});

test('does not auto-resolve when areWriteInCandidatesQualified is false', async () => {
  const contestId = 'zoo-council-mammal';
  const contest = makeContestAdjudicationData(
    contestId,
    makeContestTag({ hasWriteIn: true })
  );
  addPendingWriteIns(contest, 3, [0]);
  const adjData = makeBallotAdjudicationData(CVR_ID_1, [contest]);

  apiMock.expectGetBallotAdjudicationQueue([CVR_ID_1]);
  apiMock.expectGetNextCvrIdForBallotAdjudication(CVR_ID_1);
  apiMock.expectClaimAndLoadBallot({ cvrId: CVR_ID_1 }, adjData);
  apiMock.expectGetBallotImages({ cvrId: CVR_ID_1 }, true);
  apiMock.expectGetWriteInCandidates([]);
  apiMock.expectGetSystemSettings(); // qualified mode off (default)

  renderInAppContext(<BallotAdjudicationScreenWrapper />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Ballot ID/);
  expect(screen.getByRole('button', { name: /Accept/ })).toBeDisabled();

  apiMock.apiClient.releaseBallotAdjudicationClaim
    .expectOptionalRepeatedCallsWith({ cvrId: CVR_ID_1 })
    .resolves();
});
