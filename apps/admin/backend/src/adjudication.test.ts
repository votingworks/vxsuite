import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  AdjudicationReason,
  ContestOptionId,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import {
  electionCombinedBallotPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file.js';
import { Store } from './store.js';
import { adjudicateCvr } from './adjudication.js';
import { AdjudicatedContestOption, WriteInRecord } from './index.js';

const contestId = 'zoo-council-mammal';

test('setContestAdjudicatedVotes and getAdjudicatedVotes', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);
  const { election } = store.getElection(electionId)!.electionDefinition;

  const initialVotes: Tabulation.Votes = {
    'zoo-council-mammal': ['lion'],
    'best-animal-mammal': ['horse'],
  };

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: initialVotes,
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  function expectVotes(votes: Tabulation.Votes) {
    const [cvr] = [
      ...store.getCastVoteRecords({ electionId, election, filter: {} }),
    ];
    assert(cvr);
    expect(cvr.votes).toEqual({
      ...initialVotes,
      ...votes,
    });
  }

  // initially no adjudicated votes
  expect(store.getAdjudicatedVotes({ cvrId })).toBeUndefined();
  expectVotes({});

  // adjudicate a contest: remove lion, add zebra
  store.setContestAdjudicatedVotes({
    cvrId,
    contestId,
    votes: ['zebra'],
  });
  expect(store.getAdjudicatedVotes({ cvrId })).toEqual({
    'zoo-council-mammal': ['zebra'],
  });
  expectVotes({ 'zoo-council-mammal': ['zebra'] });

  // adjudicate same contest again: restore lion
  store.setContestAdjudicatedVotes({
    cvrId,
    contestId,
    votes: ['lion'],
  });
  expect(store.getAdjudicatedVotes({ cvrId })).toEqual({
    'zoo-council-mammal': ['lion'],
  });
  expectVotes({ 'zoo-council-mammal': ['lion'] });

  // adjudicate a different contest
  store.setContestAdjudicatedVotes({
    cvrId,
    contestId: 'best-animal-mammal',
    votes: ['fox'],
  });
  expect(store.getAdjudicatedVotes({ cvrId })).toEqual({
    'zoo-council-mammal': ['lion'],
    'best-animal-mammal': ['fox'],
  });
  expectVotes({
    'zoo-council-mammal': ['lion'],
    'best-animal-mammal': ['fox'],
  });

  // adjudicate to empty votes
  store.setContestAdjudicatedVotes({
    cvrId,
    contestId,
    votes: [],
  });
  expect(store.getAdjudicatedVotes({ cvrId })).toEqual({
    'zoo-council-mammal': [],
    'best-animal-mammal': ['fox'],
  });
  expectVotes({
    'zoo-council-mammal': [],
    'best-animal-mammal': ['fox'],
  });
});

test('adjudicateCvr write-in logging and candidate cleanup', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in-0'] },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const allFalse: Record<ContestOptionId, AdjudicatedContestOption> = {
    kangaroo: { type: 'official-option', hasVote: false },
    elephant: { type: 'official-option', hasVote: false },
    lion: { type: 'official-option', hasVote: false },
    zebra: { type: 'official-option', hasVote: false },
    'write-in-0': { type: 'write-in-option', hasVote: false },
    'write-in-1': { type: 'write-in-option', hasVote: false },
    'write-in-2': { type: 'write-in-option', hasVote: false },
  };

  function adjudicate(
    trueVotes: Record<ContestOptionId, AdjudicatedContestOption>
  ): void {
    assert(cvrId !== undefined);
    adjudicateCvr(
      {
        cvrId,
        contests: [
          {
            adjudicatedContestOptionById: { ...allFalse, ...trueVotes },
            contestId,
          },
        ],
      },
      'test-machine',
      store,
      logger
    );
  }

  const writeInId = store.getWriteInRecords({
    castVoteRecordId: cvrId,
    contestId,
    electionId,
  })[0]?.id;
  assert(writeInId !== undefined);

  function expectWriteInRecord(expected: Partial<WriteInRecord>) {
    const [writeInRecord] = store.getWriteInRecords({
      electionId,
      writeInId: expected.id || writeInId,
    });
    expect(writeInRecord).toMatchObject(expected);
  }

  function expectWriteInLog(
    optionId: string,
    message: string,
    attributes: Record<string, unknown>
  ) {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.WriteInAdjudicated,
      'election_manager',
      {
        disposition: 'success',
        message,
        cvrId,
        contestId,
        optionId,
        ...attributes,
      }
    );
  }

  // mark write-in as invalid
  adjudicate({});
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  expectWriteInLog(
    'write-in-0',
    'User adjudicated a write-in from unadjudicated to invalid.',
    { previousStatus: 'pending', status: 'invalid' }
  );

  // mark write-in as official candidate
  adjudicate({
    'write-in-0': {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'lion',
      candidateType: 'official-candidate',
    },
  });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'official-candidate',
    candidateId: 'lion',
  });
  expectWriteInLog(
    'write-in-0',
    'User adjudicated a write-in from invalid to a vote for an official candidate (lion).',
    {
      previousStatus: 'invalid',
      status: 'official-candidate',
      candidateId: 'lion',
    }
  );

  // switch to write-in candidate
  const writeInCandidate = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Unofficial',
  });
  adjudicate({
    'write-in-0': {
      type: 'write-in-option',
      hasVote: true,
      candidateName: 'Unofficial',
      candidateType: 'write-in-candidate',
    },
  });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'write-in-candidate',
    candidateId: writeInCandidate.id,
  });
  expectWriteInLog(
    'write-in-0',
    `User adjudicated a write-in from a vote for an official candidate (lion) to a vote for a write-in candidate (${writeInCandidate.id}).`,
    {
      previousStatus: 'official-candidate',
      previousCandidateId: 'lion',
      status: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    }
  );

  // switch away from write-in candidate → should delete the candidate record
  adjudicate({});
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  expect(store.getWriteInCandidates({ electionId })).toEqual([]);
  expectWriteInLog(
    'write-in-0',
    `User adjudicated a write-in from a vote for a write-in candidate (${writeInCandidate.id}) to invalid.`,
    {
      previousStatus: 'write-in-candidate',
      previousCandidateId: writeInCandidate.id,
      status: 'invalid',
    }
  );
});

test('deleteQualifiedWriteInCandidate resets all write-ins in the affected CVR-contest, not just those adjudicated for the deleted candidate', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // CVR has two write-ins on a single multi-seat contest (zoo-council-mammal
  // has 3 seats, so up to 3 write-in slots per ballot).
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in-0', 'write-in-1'] },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const alice = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Alice',
  });
  const bob = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Bob',
  });

  // Adjudicate write-in-0 → Alice (the to-be-deleted candidate) and
  // write-in-1 → Bob (the candidate that will remain).
  const allFalse: Record<ContestOptionId, AdjudicatedContestOption> = {
    kangaroo: { type: 'official-option', hasVote: false },
    elephant: { type: 'official-option', hasVote: false },
    lion: { type: 'official-option', hasVote: false },
    zebra: { type: 'official-option', hasVote: false },
    'write-in-0': { type: 'write-in-option', hasVote: false },
    'write-in-1': { type: 'write-in-option', hasVote: false },
    'write-in-2': { type: 'write-in-option', hasVote: false },
  };
  adjudicateCvr(
    {
      cvrId,
      contests: [
        {
          adjudicatedContestOptionById: {
            ...allFalse,
            'write-in-0': {
              type: 'write-in-option',
              hasVote: true,
              candidateType: 'write-in-candidate',
              candidateName: 'Alice',
            },
            'write-in-1': {
              type: 'write-in-option',
              hasVote: true,
              candidateType: 'write-in-candidate',
              candidateName: 'Bob',
            },
          },
          contestId,
        },
      ],
    },
    'test-machine',
    store,
    logger
  );

  // Sanity: both write-ins are now adjudicated for their respective candidates.
  const writeInsBefore = store.getWriteInRecords({
    electionId,
    castVoteRecordId: cvrId,
    contestId,
  });
  const aliceWriteInBefore = writeInsBefore.find(
    (wi) => wi.optionId === 'write-in-0'
  );
  const bobWriteInBefore = writeInsBefore.find(
    (wi) => wi.optionId === 'write-in-1'
  );
  assert(
    aliceWriteInBefore?.status === 'adjudicated' &&
      aliceWriteInBefore.adjudicationType === 'write-in-candidate' &&
      aliceWriteInBefore.candidateId === alice.id
  );
  assert(
    bobWriteInBefore?.status === 'adjudicated' &&
      bobWriteInBefore.adjudicationType === 'write-in-candidate' &&
      bobWriteInBefore.candidateId === bob.id
  );

  // Delete Alice. The CVR-contest is going to be re-adjudicated as a whole
  // (adjudicated_votes is cleared for this contest), so both write-ins must
  // also reset to pending to keep the write_ins table consistent. Otherwise
  // the re-adjudication UI would show write-in-1 as already adjudicated
  // while the CVR says nothing is adjudicated for this contest.
  const affectedBallotCount = store.deleteQualifiedWriteInCandidate(alice.id);
  expect(affectedBallotCount).toEqual(1);

  const writeInsAfter = store.getWriteInRecords({
    electionId,
    castVoteRecordId: cvrId,
    contestId,
  });
  const aliceWriteInAfter = writeInsAfter.find(
    (wi) => wi.optionId === 'write-in-0'
  );
  const bobWriteInAfter = writeInsAfter.find(
    (wi) => wi.optionId === 'write-in-1'
  );
  expect(aliceWriteInAfter?.status).toEqual('pending');
  expect(bobWriteInAfter?.status).toEqual('pending');
});

test('adjudicateCvr adjudicates contest and resolves tags', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(
      typedAs<SystemSettings>({
        ...DEFAULT_SYSTEM_SETTINGS,
        adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
      })
    ),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);
  const { election } = store.getElection(electionId)!.electionDefinition;

  const initialVotes = ['lion', 'write-in-0'];
  const initialWriteInRecords: Array<Partial<WriteInRecord>> = [
    {
      status: 'pending',
      optionId: 'write-in-0',
    },
  ];
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      markScores: {
        'zoo-council-mammal': {
          lion: 1.0,
          'write-in-0': 0.9,
          zebra: 0.06,
          'write-in-1': 0,
        },
      },
      votes: { 'zoo-council-mammal': initialVotes },
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  function expectVotes(votes: string[]) {
    const [cvr] = [
      ...store.getCastVoteRecords({ electionId, election, filter: {} }),
    ];
    assert(cvr);
    expect(cvr.votes[contestId]).toEqual(votes);
  }

  function expectWriteInRecords(expected: Array<Partial<WriteInRecord>>) {
    const writeInRecords = store.getWriteInRecords({
      electionId,
      contestId,
      castVoteRecordId: cvrId,
    });
    expect(writeInRecords).toMatchObject(expected);
  }

  function adjudicate(
    trueVotes: Record<ContestOptionId, AdjudicatedContestOption>
  ): void {
    assert(cvrId !== undefined);
    adjudicateCvr(
      {
        cvrId,
        contests: [
          {
            adjudicatedContestOptionById: {
              kangaroo: { type: 'official-option', hasVote: false },
              elephant: { type: 'official-option', hasVote: false },
              lion: { type: 'official-option', hasVote: false },
              zebra: { type: 'official-option', hasVote: false },
              'write-in-0': { type: 'write-in-option', hasVote: false },
              'write-in-1': { type: 'write-in-option', hasVote: false },
              'write-in-2': { type: 'write-in-option', hasVote: false },
              ...trueVotes,
            },
            contestId: 'zoo-council-mammal',
          },
        ],
      },
      'test-machine',
      store,
      logger
    );
  }

  expectVotes(initialVotes);
  expectWriteInRecords(initialWriteInRecords);

  function getContestTag() {
    assert(cvrId !== undefined);
    const adjData = store.getBallotAdjudicationData({ electionId, cvrId });
    return adjData.contests.find((c) => c.contestId === contestId)?.tag;
  }

  function isContestAdjudicated() {
    assert(cvrId !== undefined);
    const adjData = store.getBallotAdjudicationData({ electionId, cvrId });
    return adjData.adjudicatedContests.some((c) => c.contestId === contestId);
  }

  const initialContestTag = getContestTag();
  expect(initialContestTag).toBeDefined();
  expect(
    !isContestAdjudicated() &&
      initialContestTag?.hasMarginalMark &&
      initialContestTag?.hasWriteIn &&
      initialContestTag?.hasUnmarkedWriteIn === false
  ).toEqual(true);

  // remove both initial votes
  adjudicate({});
  expectVotes([]);
  expectWriteInRecords([
    {
      status: 'adjudicated',
      adjudicationType: 'invalid',
      optionId: 'write-in-0',
    },
  ]);

  // write-in as official candidate, re-add lion
  adjudicate({
    lion: { type: 'official-option', hasVote: true },
    'write-in-0': {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'elephant',
      candidateType: 'official-candidate',
    },
  });
  expectVotes(['lion', 'write-in-0']);
  expectWriteInRecords([
    {
      status: 'adjudicated',
      adjudicationType: 'official-candidate',
      optionId: 'write-in-0',
      candidateId: 'elephant',
    },
  ]);
  const adjudicatedContestTag = getContestTag();
  expect(adjudicatedContestTag).toBeDefined();
  expect(
    isContestAdjudicated() &&
      adjudicatedContestTag?.hasMarginalMark &&
      adjudicatedContestTag?.hasWriteIn &&
      adjudicatedContestTag?.hasUnmarkedWriteIn === false
  ).toEqual(true);

  // one additional candidate and write-in with new write-in candidate
  adjudicate({
    lion: { type: 'official-option', hasVote: true },
    zebra: { type: 'official-option', hasVote: true },
    'write-in-0': {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'elephant',
      candidateType: 'official-candidate',
    },
    'write-in-1': {
      type: 'write-in-option',
      hasVote: true,
      candidateName: 'siena',
      candidateType: 'write-in-candidate',
    },
  });
  expectVotes(['lion', 'write-in-0', 'zebra', 'write-in-1']);
  const newWriteInCandidate = store
    .getWriteInCandidates({
      electionId,
      contestIds: [contestId],
    })
    .find((c) => c.name === 'siena');
  assert(newWriteInCandidate !== undefined);
  expectWriteInRecords([
    {
      status: 'adjudicated',
      adjudicationType: 'official-candidate',
      optionId: 'write-in-0',
      candidateId: 'elephant',
    },
    {
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      optionId: 'write-in-1',
      candidateId: newWriteInCandidate.id,
      isUndetected: true,
      isUnmarked: true,
    },
  ]);

  // remove the initial votes, keep the two new votes;
  // write-in previously adjudicated for new candidate should
  // be adjudicated for the same write-in candidate with the same id
  adjudicate({
    zebra: { type: 'official-option', hasVote: true },
    'write-in-1': {
      type: 'write-in-option',
      hasVote: true,
      candidateName: 'siena',
      candidateType: 'write-in-candidate',
    },
  });
  expectVotes(['zebra', 'write-in-1']);
  expectWriteInRecords([
    {
      status: 'adjudicated',
      adjudicationType: 'invalid',
      optionId: 'write-in-0',
    },
    {
      status: 'adjudicated',
      adjudicationType: 'write-in-candidate',
      optionId: 'write-in-1',
      candidateId: newWriteInCandidate.id,
      isUndetected: true,
      isUnmarked: true,
    },
  ]);

  // normal adjudication to finish, which should delete the write-in record
  // for the undetected write-in record instead of marking it as invalid
  adjudicate({
    lion: { type: 'official-option', hasVote: true },
    'write-in-0': {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'elephant',
      candidateType: 'official-candidate',
    },
  });
  expectVotes(['lion', 'write-in-0']);
  expectWriteInRecords([
    {
      status: 'adjudicated',
      adjudicationType: 'official-candidate',
      optionId: 'write-in-0',
      candidateId: 'elephant',
    },
  ]);
  const finalContestTag = getContestTag();
  expect(finalContestTag).toBeDefined();
  expect(
    isContestAdjudicated() &&
      finalContestTag?.hasMarginalMark &&
      finalContestTag?.hasWriteIn &&
      finalContestTag?.hasUnmarkedWriteIn === false
  ).toEqual(true);
});

test('blank ballot appears in adjudication queue when BlankBallot reason is enabled', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(
      typedAs<SystemSettings>({
        ...DEFAULT_SYSTEM_SETTINGS,
        adminAdjudicationReasons: [AdjudicationReason.BlankBallot],
      })
    ),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const blankVotes: Tabulation.Votes = {
    'zoo-council-mammal': [],
    'best-animal-mammal': [],
    'new-zoo-either': [],
    'new-zoo-pick': [],
    fishing: [],
  };

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: blankVotes,
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue[0]).toEqual(cvrId);
  const metadata = store.getBallotAdjudicationQueueMetadata({ electionId });
  expect(metadata.totalTally).toEqual(1);
  expect(metadata.pendingTally).toEqual(1);
});

test('blank ballot does not appear in adjudication queue when BlankBallot reason is disabled', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const blankVotes: Tabulation.Votes = {
    'zoo-council-mammal': [],
    'best-animal-mammal': [],
    'new-zoo-either': [],
    'new-zoo-pick': [],
    fishing: [],
  };

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: blankVotes,
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).not.toContain(cvrId);
});

test('marginal mark CVR does not appear in adjudication queue when MarginalMark reason is disabled', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['zebra', 'lion', 'kangaroo'] },
      markScores: {
        'zoo-council-mammal': { zebra: 0.5, lion: 0.5, kangaroo: 0.06 },
      },
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).not.toContain(cvrId);
});

test('CVR with only an unmarked write-in appears in adjudication queue', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // the mock helper detects 'write-in-unmarked-0' as an unmarked write-in
  // and sets has_write_in on the CVR, which should put it in the queue
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: {
        'zoo-council-mammal': ['zebra', 'lion', 'write-in-unmarked-0'],
      },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).toContain(cvrId);
});

test('adjudicateCvr applies multiple contests in a single transaction and marks resolved', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);
  const { election } = store.getElection(electionId)!.electionDefinition;

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      markScores: {
        'zoo-council-mammal': { lion: 1.0, kangaroo: 0.06 },
        'best-animal-mammal': { horse: 1.0, otter: 0.06 },
      },
      votes: {
        'zoo-council-mammal': ['lion'],
        'best-animal-mammal': ['horse'],
      },
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 1,
    },
  ];
  const [cvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(cvrId !== undefined);

  // Sanity: cvr is not yet resolved.
  expect(store.isCvrAdjudicated({ cvrId })).toEqual(false);

  // Submit two contest adjudications + the resolve mark in one call.
  adjudicateCvr(
    {
      cvrId,
      contests: [
        {
          contestId: 'zoo-council-mammal',
          adjudicatedContestOptionById: {
            lion: { type: 'official-option', hasVote: true },
            kangaroo: { type: 'official-option', hasVote: true },
          },
        },
        {
          contestId: 'best-animal-mammal',
          adjudicatedContestOptionById: {
            horse: { type: 'official-option', hasVote: false },
            otter: { type: 'official-option', hasVote: true },
          },
        },
      ],
    },
    'test-machine',
    store,
    logger
  );

  // Both contests' adjudicated_votes are written.
  const [cvr] = [
    ...store.getCastVoteRecords({ electionId, election, filter: {} }),
  ];
  assert(cvr);
  expect(new Set(cvr.votes['zoo-council-mammal'])).toEqual(
    new Set(['lion', 'kangaroo'])
  );
  expect(cvr.votes['best-animal-mammal']).toEqual(['otter']);

  // The cvr is marked resolved.
  expect(store.isCvrAdjudicated({ cvrId })).toEqual(true);
});

test('combined ballot primary crossover vote', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { electionData } =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const cvrMetadata = {
    ballotStyleGroupId: 'ballot-style-1',
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    card: { type: 'bmd' },
  } as const;

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...cvrMetadata,
      // Crossover: votes in both Dem and Rep partisan contests.
      votes: {
        'governor-democratic': ['alice-jones'],
        'governor-republican': ['dave-wilson'],
      },
      multiplier: 1,
    },
    {
      ...cvrMetadata,
      // Single-party Dem.
      votes: { 'governor-democratic': ['alice-jones'] },
      multiplier: 1,
    },
  ];
  const [crossoverCvrId, singlePartyCvrId] = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });
  assert(crossoverCvrId !== undefined);
  assert(singlePartyCvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).toContain(crossoverCvrId);
  expect(queue).not.toContain(singlePartyCvrId);
  const metadata = store.getBallotAdjudicationQueueMetadata({ electionId });
  expect(metadata).toEqual({ totalTally: 1, pendingTally: 1 });
  expect(
    store.getBallotAdjudicationData({ electionId, cvrId: crossoverCvrId }).tag
  ).toEqual({ isBlankBallot: false, hasCrossoverVote: true });
  expect(
    store.getBallotAdjudicationData({ electionId, cvrId: singlePartyCvrId }).tag
  ).toEqual({ isBlankBallot: false, hasCrossoverVote: false });
});
