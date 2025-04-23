import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  BallotStyleGroupId,
  ContestOptionId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file';
import { Store } from './store';
import {
  adjudicateCvrContest,
  adjudicateVote,
  adjudicateWriteIn,
} from './adjudication';
import { AdjudicatedContestOption, VoteAdjudication, WriteInRecord } from '.';

const contestId = 'zoo-council-mammal';

test('adjudicateVote', () => {
  const store = Store.memoryStore();
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

  function expectVotes(votes: Tabulation.Votes) {
    const [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
    assert(cvr);
    expect(cvr.votes).toEqual({
      ...initialVotes,
      ...votes,
    });
  }

  function expectVoteAdjudications(
    voteAdjudications: Array<Partial<VoteAdjudication>>
  ) {
    assert(cvrId !== undefined);
    expect(
      store.getVoteAdjudications({ electionId, contestId, cvrId })
    ).toEqual(
      voteAdjudications.map((adj) => ({
        contestId,
        cvrId,
        electionId,
        ...adj,
      }))
    );
  }

  function setOption(optionId: ContestOptionId, isVote: boolean): void {
    assert(cvrId !== undefined);
    adjudicateVote(
      {
        electionId,
        cvrId,
        contestId,
        optionId,
        isVote,
      },
      store
    );
  }

  expectVotes({ 'zoo-council-mammal': ['lion'] });

  // toggle a vote that has a scanned mark back and forth, confirm it is idempotent
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudications([]);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudications([{ optionId: 'lion', isVote: false }]);
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudications([]);
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudications([]);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudications([{ optionId: 'lion', isVote: false }]);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudications([{ optionId: 'lion', isVote: false }]);

  // toggle a vote without a scanned mark back and forth, confirm it is idempotent
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudications([{ optionId: 'lion', isVote: false }]);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudications([
    { optionId: 'lion', isVote: false },
    { optionId: 'zebra', isVote: true },
  ]);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudications([
    { optionId: 'lion', isVote: false },
    { optionId: 'zebra', isVote: true },
  ]);
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudications([{ optionId: 'lion', isVote: false }]);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudications([
    { optionId: 'lion', isVote: false },
    { optionId: 'zebra', isVote: true },
  ]);
});

test('adjudicateWriteIn', () => {
  const store = Store.memoryStore();
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

  const [writeInId] = store.getCvrContestWriteInIds({ cvrId, contestId });
  assert(writeInId !== undefined);

  function expectVotes(votes: Tabulation.Votes) {
    const [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
    assert(cvr);
    expect(cvr.votes).toEqual(votes);
  }

  function expectWriteInRecord(expected: Partial<WriteInRecord>) {
    const [writeInRecord] = store.getWriteInRecords({
      electionId,
      writeInId: expected.id || writeInId,
    });
    expect(writeInRecord).toMatchObject(expected);
  }

  function expectLog(message: string, attributes: Record<string, unknown>) {
    expect(logger.log).lastCalledWith(
      LogEventId.WriteInAdjudicated,
      'election_manager',
      {
        disposition: 'success',
        message,
        cvrId,
        contestId: 'zoo-council-mammal',
        optionId: 'write-in-0',
        ...attributes,
      }
    );
  }

  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'pending',
  });

  adjudicateWriteIn({ writeInId, type: 'invalid' }, store, logger);
  expectVotes({ 'zoo-council-mammal': [] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  expectLog('User adjudicated a write-in from unadjudicated to invalid.', {
    previousStatus: 'pending',
    status: 'invalid',
  });

  adjudicateWriteIn(
    { writeInId, type: 'official-candidate', candidateId: 'lion' },
    store,
    logger
  );
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'official-candidate',
    candidateId: 'lion',
  });
  expectLog(
    'User adjudicated a write-in from invalid to a vote for an official candidate (lion).',
    {
      previousStatus: 'invalid',
      status: 'official-candidate',
      candidateId: 'lion',
    }
  );

  const writeInCandidate = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Unofficial',
  });
  adjudicateWriteIn(
    { writeInId, type: 'write-in-candidate', candidateId: writeInCandidate.id },
    store,
    logger
  );
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'write-in-candidate',
    candidateId: writeInCandidate.id,
  });
  expectLog(
    `User adjudicated a write-in from a vote for an official candidate (lion) to a vote for a write-in candidate (${writeInCandidate.id}).`,
    {
      previousStatus: 'official-candidate',
      previousCandidateId: 'lion',
      status: 'write-in-candidate',
      candidateId: writeInCandidate.id,
    }
  );

  adjudicateWriteIn({ writeInId, type: 'invalid' }, store, logger);
  expectVotes({ 'zoo-council-mammal': [] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  // switching away from a write-in candidate should delete the candidate if applicable
  expect(store.getWriteInCandidates({ electionId })).toEqual([]);
  expectLog(
    `User adjudicated a write-in from a vote for a write-in candidate (${writeInCandidate.id}) to invalid.`,
    {
      previousStatus: 'write-in-candidate',
      previousCandidateId: writeInCandidate.id,
      status: 'invalid',
    }
  );

  adjudicateWriteIn({ writeInId, type: 'reset' }, store, logger);
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'pending',
  });
  expectLog(`User adjudicated a write-in from invalid to unadjudicated.`, {
    previousStatus: 'invalid',
    status: 'pending',
  });

  // create an undetected write-in record
  const undetectedWriteInRecordId = store.addWriteIn({
    castVoteRecordId: cvrId,
    contestId,
    electionId,
    isUndetected: true,
    optionId: 'write-in-1',
    side: 'front',
  });
  expectWriteInRecord({
    id: undetectedWriteInRecordId,
    status: 'pending',
    isUndetected: true,
  });

  // it should be deleted when it is adjudicated as invalid
  // since we don't maintain undetected records marked invalid
  adjudicateWriteIn(
    { writeInId: undetectedWriteInRecordId, type: 'invalid' },
    store,
    logger
  );
  const [writeInRecord] = store.getWriteInRecords({
    electionId,
    writeInId: undetectedWriteInRecordId,
  });
  expect(writeInRecord).toBeUndefined();
});

test('adjudicateCvrContest', () => {
  const store = Store.memoryStore();
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
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
      votes: { 'zoo-council-mammal': initialVotes },
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
});
