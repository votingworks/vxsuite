/* eslint-disable vx/no-expect-to-be */
import { vi, expect, test } from 'vitest';
import { randomUUID as uuid } from 'node:crypto';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionCombinedBallotPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotType,
  CandidateContest,
  PartyId,
  Tabulation,
  TEST_JURISDICTION,
  PageInterpretation,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import { deepEqual } from '@votingworks/basics';
import { Store } from '../store';
import { makeHmpbSheet } from '../../test/helpers/shared_helpers';
import { getScannerResultsMemoized, isBmdPage, isHmpbPage } from './results';

const jurisdiction = TEST_JURISDICTION;
const electionPackageHash = 'test-election-package-hash';

const testMetadata: BallotMetadata = {
  ballotStyleId: 'card-number-3',
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
  store.setPollingPlaceId('place-1');
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

const BLANK_PAGE: PageInterpretation = { type: 'BlankPage' };

test('isHmpbPage', () => {
  expect(isHmpbPage(HMPB_PAGE)).toEqual(true);
  expect(isHmpbPage(BMD_PAGE)).toEqual(false);
  expect(isHmpbPage(BLANK_PAGE)).toEqual(false);
});

test('isBmdPage', () => {
  expect(isBmdPage(BMD_PAGE)).toEqual(true);
  expect(isBmdPage(HMPB_PAGE)).toEqual(false);
  expect(isBmdPage(BLANK_PAGE)).toEqual(false);
});

test('getScannerResults groups by inferred party for a combined ballot primary', async () => {
  const electionDefinition = readElectionCombinedBallotPrimaryDefinition();
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
  const ballotStyle = election.ballotStyles[0];

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
    precinctId: ballotStyle.precincts[0],
  };
  function recordHmpbBallot(frontVotes: VotesDict): void {
    store.setPollingPlaceId('place-1');
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
    [democraticContest.id]: [democraticContest.candidates[0].id],
  });
  recordHmpbBallot({
    [democraticContest.id]: [democraticContest.candidates[0].id],
  });
  // One republican-only ballot
  recordHmpbBallot({
    [republicanContest.id]: [republicanContest.candidates[0].id],
  });
  // One crossover ballot
  recordHmpbBallot({
    [democraticContest.id]: [democraticContest.candidates[0].id],
    [republicanContest.id]: [republicanContest.candidates[0].id],
    [nonpartisanContest.id]: [nonpartisanContest.options[0].id],
  });
  // One ballot with only nonpartisan votes
  recordHmpbBallot({
    [nonpartisanContest.id]: [nonpartisanContest.options[0].id],
  });

  const results = await getScannerResultsMemoized({ store });

  function findGroup(partyId: PartyId | Tabulation.NoPartyId) {
    return results.find((r) => deepEqual(r.partyId, partyId));
  }
  expect(findGroup(democraticPartyId)?.cardCounts.hmpb[0]).toEqual(2);
  expect(findGroup(republicanPartyId)?.cardCounts.hmpb[0]).toEqual(1);
  // Crossover and nonpartisan-only ballots end up in the NO_PARTY_ID group.
  // Crossover ballots' partisan votes are voided, but their nonpartisan votes
  // count — both ballots' yes vote on the nonpartisan contest tally here.
  const noPartyGroup = findGroup(Tabulation.NO_PARTY_ID);
  expect(noPartyGroup?.cardCounts.hmpb[0]).toEqual(2);
  expect(noPartyGroup?.contestResults[nonpartisanContest.id]).toMatchObject({
    ballots: 2,
    tallies: expect.objectContaining({
      [nonpartisanContest.options[0].id]: 2,
      [nonpartisanContest.options[1].id]: 0,
    }),
  });
});
