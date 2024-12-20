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
import { adjudicateVote, adjudicateWriteIn } from './adjudication';
import { WriteInRecord } from '.';

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
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });

  // toggle a vote without a scanned mark back and forth, confirm it is idempotent
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
});

test('adjudicateWriteIn', async () => {
  const store = Store.memoryStore();
  const logger = mockBaseLogger({ fn: jest.fn });
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

  const [writeInId] = store.getWriteInAdjudicationQueue({ electionId });
  assert(writeInId !== undefined);

  function expectVotes(votes: Tabulation.Votes) {
    const [cvr] = [...store.getCastVoteRecords({ electionId, filter: {} })];
    assert(cvr);
    expect(cvr.votes).toEqual(votes);
  }

  function expectWriteInRecord(expected: Partial<WriteInRecord>) {
    const [writeInRecord] = store.getWriteInRecords({ electionId, writeInId });
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

  await adjudicateWriteIn({ writeInId, type: 'invalid' }, store, logger);
  expectVotes({ 'zoo-council-mammal': [] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  expectLog('User adjudicated a write-in from unadjudicated to invalid.', {
    previousStatus: 'pending',
    status: 'invalid',
  });

  await adjudicateWriteIn(
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
  await adjudicateWriteIn(
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

  await adjudicateWriteIn({ writeInId, type: 'invalid' }, store, logger);
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

  await adjudicateWriteIn({ writeInId, type: 'reset' }, store, logger);
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'pending',
  });
  expectLog(`User adjudicated a write-in from invalid to unadjudicated.`, {
    previousStatus: 'invalid',
    status: 'pending',
  });
});
