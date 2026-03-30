import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  AdjudicationReason,
  BallotStyleGroupId,
  ContestOptionId,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file';
import { Store } from './store';
import { adjudicateCvrContest } from './adjudication';
import { AdjudicatedContestOption, WriteInRecord } from '.';

const contestId = 'zoo-council-mammal';

test('setContestAdjudicatedVotes and getAdjudicatedVotes', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const initialVotes: Tabulation.Votes = {
    'zoo-council-mammal': ['lion'],
    'best-animal-mammal': ['horse'],
  };

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  function expectVotes(votes: Tabulation.Votes) {
    const [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
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

test('adjudicateCvrContest write-in logging and candidate cleanup', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  const allFalse: Record<ContestOptionId, AdjudicatedContestOption> = {
    kangaroo: { type: 'candidate-option', hasVote: false },
    elephant: { type: 'candidate-option', hasVote: false },
    lion: { type: 'candidate-option', hasVote: false },
    zebra: { type: 'candidate-option', hasVote: false },
    'write-in-0': { type: 'write-in-option', hasVote: false },
    'write-in-1': { type: 'write-in-option', hasVote: false },
    'write-in-2': { type: 'write-in-option', hasVote: false },
  };

  function adjudicate(
    trueVotes: Record<ContestOptionId, AdjudicatedContestOption>
  ): void {
    assert(cvrId !== undefined);
    adjudicateCvrContest(
      {
        adjudicatedContestOptionById: { ...allFalse, ...trueVotes },
        cvrId,
        contestId,
        side: 'front',
      },
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

test('adjudicateCvrContest adjudicates contest and resolves tags', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
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

  const initialVotes = ['lion', 'write-in-0'];
  const initialWriteInRecords: Array<Partial<WriteInRecord>> = [
    {
      status: 'pending',
      optionId: 'write-in-0',
    },
  ];
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  function expectVotes(votes: string[]) {
    const [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
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
    adjudicateCvrContest(
      {
        adjudicatedContestOptionById: {
          kangaroo: { type: 'candidate-option', hasVote: false },
          elephant: { type: 'candidate-option', hasVote: false },
          lion: { type: 'candidate-option', hasVote: false },
          zebra: { type: 'candidate-option', hasVote: false },
          'write-in-0': { type: 'write-in-option', hasVote: false },
          'write-in-1': { type: 'write-in-option', hasVote: false },
          'write-in-2': { type: 'write-in-option', hasVote: false },
          ...trueVotes,
        },
        cvrId,
        contestId: 'zoo-council-mammal',
        side: 'front',
      },
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

  const initialContestTag = getContestTag();
  expect(initialContestTag).toBeDefined();
  expect(
    initialContestTag?.isResolved === false &&
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
    lion: { type: 'candidate-option', hasVote: true },
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
    adjudicatedContestTag?.isResolved &&
      adjudicatedContestTag?.hasMarginalMark &&
      adjudicatedContestTag?.hasWriteIn &&
      adjudicatedContestTag?.hasUnmarkedWriteIn === false
  ).toEqual(true);

  // one additional candidate and write-in with new write-in candidate
  adjudicate({
    lion: { type: 'candidate-option', hasVote: true },
    zebra: { type: 'candidate-option', hasVote: true },
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
      contestId,
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
    zebra: { type: 'candidate-option', hasVote: true },
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
    lion: { type: 'candidate-option', hasVote: true },
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
    finalContestTag?.isResolved &&
      finalContestTag?.hasMarginalMark &&
      finalContestTag?.hasWriteIn &&
      finalContestTag?.hasUnmarkedWriteIn === false
  ).toEqual(true);
});

test('blank ballot appears in adjudication queue when BlankBallot reason is enabled', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue[0]).toEqual(cvrId);
  const metadata = store.getBallotAdjudicationQueueMetadata({ electionId });
  expect(metadata.totalTally).toEqual(1);
  expect(metadata.pendingTally).toEqual(1);
});

test('blank ballot does not appear in adjudication queue when BlankBallot reason is disabled', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).not.toContain(cvrId);
});

test('marginal mark CVR does not appear in adjudication queue when MarginalMark reason is disabled', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
  });
  assert(cvrId !== undefined);

  const queue = store.getBallotAdjudicationQueue({ electionId });
  expect(queue).not.toContain(cvrId);
});
