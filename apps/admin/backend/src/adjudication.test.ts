import {
  ContestOptionId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { assert } from '@votingworks/basics';
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
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['lion'] },
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
    expect(cvr.votes).toEqual(votes);
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

  function expectVoteAdjudicationRecordCount(num: number): void {
    expect(store.getDebugSummary().get('vote_adjudications')).toEqual(num);
  }

  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudicationRecordCount(0);

  // toggle a vote that has a scanned mark back and forth, confirm it is idempotent
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudicationRecordCount(0);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudicationRecordCount(1);
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudicationRecordCount(1);
  setOption('lion', true);
  expectVotes({ 'zoo-council-mammal': ['lion'] });
  expectVoteAdjudicationRecordCount(1);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudicationRecordCount(2);
  setOption('lion', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudicationRecordCount(2);

  // toggle a vote without a scanned mark back and forth, confirm it is idempotent
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudicationRecordCount(2);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudicationRecordCount(3);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudicationRecordCount(3);
  setOption('zebra', false);
  expectVotes({ 'zoo-council-mammal': [] });
  expectVoteAdjudicationRecordCount(3);
  setOption('zebra', true);
  expectVotes({ 'zoo-council-mammal': ['zebra'] });
  expectVoteAdjudicationRecordCount(4);
});

test('adjudicationWriteIn', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in-0'] },
      card: { type: 'bmd' },
      multiplier: 1,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
  });

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

  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'pending',
  });

  adjudicateWriteIn({ writeInId, type: 'invalid' }, store);
  expectVotes({ 'zoo-council-mammal': [] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });

  adjudicateWriteIn(
    { writeInId, type: 'official-candidate', candidateId: 'lion' },
    store
  );
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'official-candidate',
    candidateId: 'lion',
  });

  const writeInCandidate = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Unofficial',
  });
  adjudicateWriteIn(
    { writeInId, type: 'write-in-candidate', candidateId: writeInCandidate.id },
    store
  );
  expectVotes({ 'zoo-council-mammal': ['write-in-0'] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'write-in-candidate',
    candidateId: writeInCandidate.id,
  });

  adjudicateWriteIn({ writeInId, type: 'invalid' }, store);
  expectVotes({ 'zoo-council-mammal': [] });
  expectWriteInRecord({
    status: 'adjudicated',
    adjudicationType: 'invalid',
  });
  // switching away from a write-in candidate should delete the candidate if applicable
  expect(store.getWriteInCandidates({ electionId })).toEqual([]);
});
