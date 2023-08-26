import React from 'react';
import {
  Candidate,
  CastVoteRecord,
  Dictionary,
  Election,
  TallyCategory,
  VotesDict,
} from '@votingworks/types';
import { computeTallyWithPrecomputedCategories } from '@votingworks/utils';
import { ElectionManagerTallyReport } from './election_manager_tally_report';
import { TestDeckBallot } from '../utils/election';

export interface TestDeckTallyReportProps {
  election: Election;
  testDeckBallots: TestDeckBallot[];
  precinctId?: string;
}

function votesDictToIdDict(votesDict: VotesDict): Dictionary<string[]> {
  const idDict: Dictionary<string[]> = {};
  for (const [contestId, votes] of Object.entries(votesDict)) {
    if (!votes) continue;
    if (votes.length === 0) {
      idDict[contestId] = [];
    }
    if (typeof votes[0] === 'string') {
      idDict[contestId] = votes as unknown as string[];
    } else {
      idDict[contestId] = (votes as unknown as Candidate[]).map((v) => v.id);
    }
  }
  return idDict;
}

export function TestDeckTallyReport({
  election,
  testDeckBallots,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const castVoteRecords: CastVoteRecord[] = testDeckBallots.map(
    (testDeckBallot) => {
      return {
        _ballotStyleId: testDeckBallot.ballotStyleId,
        _batchId: 'test-deck',
        _batchLabel: 'Test Deck',
        _scannerId: 'test-deck',
        _ballotType: 'standard',
        _precinctId: testDeckBallot.precinctId,
        _testBallot: true,
        ...votesDictToIdDict(testDeckBallot.votes),
      };
    }
  );

  const fullElectionTally = computeTallyWithPrecomputedCategories(
    election,
    new Set(castVoteRecords),
    [TallyCategory.Precinct, TallyCategory.Party]
  );

  return (
    <ElectionManagerTallyReport
      precinctId={precinctId}
      election={election}
      tallyReportType="Test Deck"
      fullElectionTally={fullElectionTally}
      fullElectionExternalTallies={new Map()}
    />
  );
}
