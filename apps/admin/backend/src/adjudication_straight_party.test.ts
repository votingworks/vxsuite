import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  AdjudicationReason,
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { mockBaseLogger } from '@votingworks/logging';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file';
import { Store } from './store';
import { adjudicateCvrContest } from './adjudication';

// Minimal election with straight-party contest, 2 parties,
// 1 single-seat and 1 multi-seat partisan candidate contest.
const electionData = JSON.stringify({
  id: 'sp-test-election',
  type: 'general',
  title: 'Straight Party Test',
  state: 'Test State',
  county: { id: 'test-county', name: 'Test County' },
  date: '2024-11-05',
  ballotLayout: { paperSize: 'letter', metadataEncoding: 'qr-code' },
  districts: [{ id: 'district-1', name: 'District 1' }],
  parties: [
    { id: 'dem', name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
    {
      id: 'rep',
      name: 'Republican',
      fullName: 'Republican Party',
      abbrev: 'R',
    },
  ],
  precincts: [
    { id: 'precinct-1', name: 'Precinct 1', districtIds: ['district-1'] },
  ],
  ballotStyles: [
    {
      id: 'ballot-style-1',
      groupId: 'ballot-style-1',
      precincts: ['precinct-1'],
      districts: ['district-1'],
    },
  ],
  ballotStrings: {},
  seal: '',
  contests: [
    {
      id: 'straight-party',
      type: 'straight-party',
      title: 'Straight Party',
    },
    {
      id: 'president',
      districtId: 'district-1',
      type: 'candidate',
      title: 'President',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        { id: 'dem-pres', name: 'Dem President', partyIds: ['dem'] },
        { id: 'rep-pres', name: 'Rep President', partyIds: ['rep'] },
      ],
    },
    {
      id: 'council',
      districtId: 'district-1',
      type: 'candidate',
      title: 'City Council',
      seats: 2,
      allowWriteIns: false,
      candidates: [
        { id: 'dem-c1', name: 'Dem Council 1', partyIds: ['dem'] },
        { id: 'dem-c2', name: 'Dem Council 2', partyIds: ['dem'] },
        { id: 'rep-c1', name: 'Rep Council 1', partyIds: ['rep'] },
        { id: 'rep-c2', name: 'Rep Council 2', partyIds: ['rep'] },
      ],
    },
  ],
});

const SYSTEM_SETTINGS_WITH_UNDERVOTE: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  adminAdjudicationReasons: [
    AdjudicationReason.Overvote,
    AdjudicationReason.Undervote,
  ],
};

function setupStore() {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(SYSTEM_SETTINGS_WITH_UNDERVOTE),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);
  return { store, electionId };
}

function addCvr({
  store,
  electionId,
  votes,
}: {
  store: Store;
  electionId: string;
  votes: Tabulation.Votes;
}): string {
  const mockFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: 'ballot-style-1' as BallotStyleGroupId,
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes,
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: mockFile,
    store,
  });
  assert(cvrId !== undefined);
  return cvrId;
}

test('derived votes returned for valid SP selection with undervoted contests', () => {
  const { store, electionId } = setupStore();
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem'],
      president: [],
      council: [],
    },
  });

  const data = store.getBallotAdjudicationData({ electionId, cvrId });

  // President: voter didn't vote, but dem-pres should be derived
  const presidentContest = data.contests.find(
    (c) => c.contestId === 'president'
  );
  assert(presidentContest !== undefined);
  expect(presidentContest.derivedOptionIds).toEqual(['dem-pres']);

  // Council: voter didn't vote, both dem candidates should be derived
  const councilContest = data.contests.find((c) => c.contestId === 'council');
  assert(councilContest !== undefined);
  expect(councilContest.derivedOptionIds).toEqual(
    expect.arrayContaining(['dem-c1', 'dem-c2'])
  );
  expect(councilContest.derivedOptionIds).toHaveLength(2);

  // Straight party contest itself should have no derived votes
  const spContest = data.contests.find((c) => c.contestId === 'straight-party');
  assert(spContest !== undefined);
  expect(spContest.derivedOptionIds).toEqual([]);
});

test('no derived votes when SP contest is overvoted', () => {
  const { store, electionId } = setupStore();
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem', 'rep'], // overvote
      president: [],
      council: [],
    },
  });

  const data = store.getBallotAdjudicationData({ electionId, cvrId });

  for (const contest of data.contests) {
    expect(contest.derivedOptionIds).toEqual([]);
  }
});

test('no derived votes when voter already filled all seats', () => {
  const { store, electionId } = setupStore();
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem'],
      president: ['rep-pres'], // already voted for someone
      council: ['rep-c1', 'rep-c2'], // already filled both seats
    },
  });

  const data = store.getBallotAdjudicationData({ electionId, cvrId });

  const presidentContest = data.contests.find(
    (c) => c.contestId === 'president'
  );
  assert(presidentContest !== undefined);
  // President already has 1 vote (rep-pres), filling the 1 seat — no expansion
  expect(presidentContest.derivedOptionIds).toEqual([]);

  const councilContest = data.contests.find((c) => c.contestId === 'council');
  assert(councilContest !== undefined);
  // Council already has 2 votes filling 2 seats — no expansion
  expect(councilContest.derivedOptionIds).toEqual([]);
});

test('derived votes update after SP overvote is adjudicated', () => {
  const { store, electionId } = setupStore();
  const logger = mockBaseLogger({ fn: vi.fn });
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem', 'rep'], // overvote
      president: [],
      council: [],
    },
  });

  // Initially no derived votes due to overvote
  let data = store.getBallotAdjudicationData({ electionId, cvrId });
  for (const contest of data.contests) {
    expect(contest.derivedOptionIds).toEqual([]);
  }

  // Adjudicate SP contest to resolve overvote — keep only 'dem'
  adjudicateCvrContest(
    {
      cvrId,
      contestId: 'straight-party',
      side: 'front',
      adjudicatedContestOptionById: {
        dem: { type: 'candidate-option', hasVote: true },
        rep: { type: 'candidate-option', hasVote: false },
      },
    },
    store,
    logger
  );

  // Now refetch — derived votes should appear
  data = store.getBallotAdjudicationData({ electionId, cvrId });

  const presidentContest = data.contests.find(
    (c) => c.contestId === 'president'
  );
  assert(presidentContest !== undefined);
  expect(presidentContest.derivedOptionIds).toEqual(['dem-pres']);

  const councilContest = data.contests.find((c) => c.contestId === 'council');
  assert(councilContest !== undefined);
  expect(councilContest.derivedOptionIds).toEqual(
    expect.arrayContaining(['dem-c1', 'dem-c2'])
  );
});

test('adjudicating a candidate contest does not affect SP derived state', () => {
  const { store, electionId } = setupStore();
  const logger = mockBaseLogger({ fn: vi.fn });
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem'],
      president: [],
      council: ['dem-c1'], // partial vote in council
    },
  });

  // Verify initial derived state
  let data = store.getBallotAdjudicationData({ electionId, cvrId });
  const presidentContest = data.contests.find(
    (c) => c.contestId === 'president'
  );
  assert(presidentContest !== undefined);
  expect(presidentContest.derivedOptionIds).toEqual(['dem-pres']);

  // Council: 1 of 2 seats filled, 1 remaining dem candidate (dem-c2) derived
  const councilContest = data.contests.find((c) => c.contestId === 'council');
  assert(councilContest !== undefined);
  expect(councilContest.derivedOptionIds).toEqual(['dem-c2']);

  // Adjudicate president contest (add rep-pres vote)
  adjudicateCvrContest(
    {
      cvrId,
      contestId: 'president',
      side: 'front',
      adjudicatedContestOptionById: {
        'dem-pres': { type: 'candidate-option', hasVote: false },
        'rep-pres': { type: 'candidate-option', hasVote: true },
      },
    },
    store,
    logger
  );

  // Refetch — president now has a manual vote so no derived votes needed
  data = store.getBallotAdjudicationData({ electionId, cvrId });
  const presidentAfter = data.contests.find((c) => c.contestId === 'president');
  assert(presidentAfter !== undefined);
  // rep-pres is adjudicated vote, seat filled → no derived votes
  expect(presidentAfter.derivedOptionIds).toEqual([]);

  // Council derived state should remain unchanged
  const councilAfter = data.contests.find((c) => c.contestId === 'council');
  assert(councilAfter !== undefined);
  expect(councilAfter.derivedOptionIds).toEqual(['dem-c2']);
});

test('tally pipeline produces correct expanded tallies after adjudication', () => {
  const { store, electionId } = setupStore();
  const logger = mockBaseLogger({ fn: vi.fn });
  const cvrId = addCvr({
    store,
    electionId,
    votes: {
      'straight-party': ['dem', 'rep'], // overvote — no expansion initially
      president: [],
      council: [],
    },
  });

  // Tally before adjudication — no expansion due to overvote
  let [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
  assert(cvr !== undefined);
  expect(cvr.votes['president']).toEqual([]);
  expect(cvr.votes['council']).toEqual([]);

  // Adjudicate SP to keep only 'dem'
  adjudicateCvrContest(
    {
      cvrId,
      contestId: 'straight-party',
      side: 'front',
      adjudicatedContestOptionById: {
        dem: { type: 'candidate-option', hasVote: true },
        rep: { type: 'candidate-option', hasVote: false },
      },
    },
    store,
    logger
  );

  // Tally after adjudication — expansion should apply
  [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
  assert(cvr !== undefined);
  expect(cvr.votes['straight-party']).toEqual(['dem']);
  expect(cvr.votes['president']).toEqual(['dem-pres']);
  expect(cvr.votes['council']).toEqual(
    expect.arrayContaining(['dem-c1', 'dem-c2'])
  );
});
