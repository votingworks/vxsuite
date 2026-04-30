/* eslint-disable vx/no-expect-to-be */
import { vi, expect, test } from 'vitest';
import { v4 as uuid } from 'uuid';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionOpenPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotStyleId,
  BallotType,
  CandidateContest,
  PageInterpretationWithFiles,
  PartyId,
  SheetOf,
  TEST_JURISDICTION,
  PageInterpretation,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { Store } from '../store';
import {
  getScannerResultsMemoized,
  isBmdMultiPagePage,
  isBmdPage,
  isHmpbPage,
} from './results';

const jurisdiction = TEST_JURISDICTION;
const electionPackageHash = 'test-election-package-hash';

function makeHmpbSheet({
  metadata,
  frontVotes = {},
  backVotes = {},
}: {
  metadata: BallotMetadata;
  frontVotes?: VotesDict;
  backVotes?: VotesDict;
}): SheetOf<PageInterpretationWithFiles> {
  function makePage(
    pageNumber: number,
    votes: VotesDict
  ): PageInterpretationWithFiles {
    return {
      imagePath: `/page-${pageNumber}-${uuid()}.png`,
      interpretation: {
        type: 'InterpretedHmpbPage',
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: {
          contests: [],
          metadata: { ...metadata, pageNumber },
          pageSize: { width: 0, height: 0 },
        },
        markInfo: {
          ballotSize: { height: 1000, width: 800 },
          marks: [],
        },
        metadata: { ...metadata, pageNumber },
        votes,
      },
    };
  }
  return [makePage(1, frontVotes), makePage(2, backVotes)];
}

const testMetadata: BallotMetadata = {
  ballotStyleId: 'card-number-3' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .ballotHash,
  isTestMode: false,
  precinctId: 'town-id-00701-precinct-id-default',
};

test('getScannerResultsMemoized correctly memoizes results based on ballot count', async () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  const zeroResultsA = await getScannerResultsMemoized({ store });
  expect(store.getBallotsCounted()).toEqual(0);
  expect(zeroResultsA).toHaveLength(1);
  expect(zeroResultsA[0].cardCounts.hmpb[0]).toBeUndefined();

  const zeroResultsB = await getScannerResultsMemoized({ store });
  expect(zeroResultsB).toBe(zeroResultsA); // should be exact same object due to memoization

  // Add a ballot to the store
  const batchId1 = store.addBatch();
  store.recordSheet({
    sheetId: uuid(),
    batchId: batchId1,
    pages: makeHmpbSheet({ metadata: testMetadata }),
    isAccepted: true,
  });
  store.finishBatch({ batchId: batchId1 });

  expect(store.getBallotsCounted()).toEqual(1);

  // Call getScannerResultsMemoized again - should return new results due to changed ballot count
  const oneResultsA = await getScannerResultsMemoized({ store });
  expect(oneResultsA).not.toBe(zeroResultsA); // Should be a different object reference
  expect(oneResultsA).toHaveLength(1); // Should have one group of results
  expect(oneResultsA[0].cardCounts.hmpb[0]).toEqual(1);

  const oneResultsB = await getScannerResultsMemoized({
    store,
  });
  expect(oneResultsB).toBe(oneResultsA); // should be exact same object due to memoization

  const batchId2 = store.addBatch();
  store.recordSheet({
    sheetId: uuid(),
    batchId: batchId2,
    pages: makeHmpbSheet({ metadata: testMetadata }),
    isAccepted: true,
  });
  store.finishBatch({ batchId: batchId2 });

  expect(store.getBallotsCounted()).toEqual(2);

  const twoResultsA = await getScannerResultsMemoized({ store });
  expect(twoResultsA).not.toBe(oneResultsA);
  expect(twoResultsA).toHaveLength(1);
  expect(twoResultsA[0].cardCounts.hmpb[0]).toEqual(2);

  const twoResultsB = await getScannerResultsMemoized({
    store,
  });
  expect(twoResultsB).toBe(twoResultsA); // should be exact same object due to memoization
});

const HMPB_PAGE: PageInterpretation = {
  type: 'InterpretedHmpbPage',
} as unknown as PageInterpretation;

const BMD_PAGE: PageInterpretation = {
  type: 'InterpretedBmdPage',
} as unknown as PageInterpretation;

const BMD_MULTI_PAGE: PageInterpretation = {
  type: 'InterpretedBmdMultiPagePage',
} as unknown as PageInterpretation;

const BLANK_PAGE: PageInterpretation = { type: 'BlankPage' };

test('isHmpbPage', () => {
  expect(isHmpbPage(HMPB_PAGE)).toEqual(true);
  expect(isHmpbPage(BMD_PAGE)).toEqual(false);
  expect(isHmpbPage(BMD_MULTI_PAGE)).toEqual(false);
  expect(isHmpbPage(BLANK_PAGE)).toEqual(false);
});

test('isBmdPage', () => {
  expect(isBmdPage(BMD_PAGE)).toEqual(true);
  expect(isBmdPage(HMPB_PAGE)).toEqual(false);
  expect(isBmdPage(BMD_MULTI_PAGE)).toEqual(false);
  expect(isBmdPage(BLANK_PAGE)).toEqual(false);
});

test('isBmdMultiPagePage', () => {
  expect(isBmdMultiPagePage(BMD_MULTI_PAGE)).toEqual(true);
  expect(isBmdMultiPagePage(HMPB_PAGE)).toEqual(false);
  expect(isBmdMultiPagePage(BMD_PAGE)).toEqual(false);
  expect(isBmdMultiPagePage(BLANK_PAGE)).toEqual(false);
});

test('getScannerResults groups by inferred party for an open primary', async () => {
  const electionDefinition = readElectionOpenPrimaryDefinition();
  const { election } = electionDefinition;
  const democraticPartyId = election.parties.find(
    (p) => p.name === 'Democratic'
  )!.id;
  const republicanPartyId = election.parties.find(
    (p) => p.name === 'Republican'
  )!.id;
  const democraticContest = election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.partyId === democraticPartyId
  )!;
  const republicanContest = election.contests.find(
    (c): c is CandidateContest =>
      c.type === 'candidate' && c.partyId === republicanPartyId
  )!;
  const nonpartisanContest = election.contests.find(
    (c): c is YesNoContest => c.type === 'yesno'
  )!;
  const ballotStyle = election.ballotStyles[0]!;

  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash,
  });

  const metadata: BallotMetadata = {
    ballotStyleId: ballotStyle.id,
    ballotType: BallotType.Precinct,
    ballotHash: electionDefinition.ballotHash,
    isTestMode: false,
    precinctId: ballotStyle.precincts[0]!,
  };
  function recordHmpbBallot(frontVotes: VotesDict): void {
    const batchId = store.addBatch();
    store.recordSheet({
      sheetId: uuid(),
      batchId,
      pages: makeHmpbSheet({ metadata, frontVotes }),
      isAccepted: true,
    });
    store.finishBatch({ batchId });
  }

  // Two democratic-only ballots
  recordHmpbBallot({
    [democraticContest.id]: [democraticContest.candidates[0]!.id],
  });
  recordHmpbBallot({
    [democraticContest.id]: [democraticContest.candidates[0]!.id],
  });
  // One republican-only ballot
  recordHmpbBallot({
    [republicanContest.id]: [republicanContest.candidates[0]!.id],
  });
  // One crossover ballot
  recordHmpbBallot({
    [democraticContest.id]: [democraticContest.candidates[0]!.id],
    [republicanContest.id]: [republicanContest.candidates[0]!.id],
    [nonpartisanContest.id]: [nonpartisanContest.yesOption.id],
  });
  // One ballot with only nonpartisan votes
  recordHmpbBallot({
    [nonpartisanContest.id]: [nonpartisanContest.yesOption.id],
  });

  const results = await getScannerResultsMemoized({ store });

  function findGroup(partyId?: PartyId) {
    return results.find((r) => r.partyId === partyId);
  }
  expect(findGroup(democraticPartyId)?.cardCounts.hmpb[0]).toEqual(2);
  expect(findGroup(republicanPartyId)?.cardCounts.hmpb[0]).toEqual(1);
  // Crossover and nonpartisan-only ballots end up in a group with no partyId.
  // Crossover ballots' partisan votes are voided, but their nonpartisan votes
  // count — both ballots' yes vote on the nonpartisan contest tally here.
  const noPartyGroup = findGroup(undefined);
  expect(noPartyGroup?.cardCounts.hmpb[0]).toEqual(2);
  expect(noPartyGroup?.contestResults[nonpartisanContest.id]).toMatchObject({
    ballots: 2,
    yesTally: 2,
    noTally: 0,
  });
});
