import React from 'react';
import {
  CandidateVote,
  CastVoteRecord,
  Election,
  FullElectionTally,
  TallyCategory,
  YesNoVote,
} from '@votingworks/types';
import { computeTallyWithPrecomputedCategories } from '@votingworks/utils';
import { ElectionManagerTallyReport } from './election_manager_tally_report';
import { TestDeckBallot } from '../utils/election';

export interface TestDeckTallyReportProps {
  election: Election;
  testDeckBallots: TestDeckBallot[];
  precinctId?: string;
}

function testDeckBallotToCastVoteRecord(
  testDeckBallot: TestDeckBallot
): CastVoteRecord {
  const castVoteRecord: CastVoteRecord = {
    _precinctId: testDeckBallot.precinctId,
    _ballotStyleId: testDeckBallot.ballotStyleId,
    _ballotType: 'standard',
    _scannerId: 'test-deck',
    _batchId: 'test-deck',
    _batchLabel: 'Test Deck',
    _testBallot: true,
  };

  for (const [contestId, vote] of Object.entries(testDeckBallot.votes)) {
    if (vote) {
      if (typeof vote[0] === 'string') {
        // yes no vote
        const yesNoVote = vote as YesNoVote;
        castVoteRecord[contestId] = [...yesNoVote];
      } else {
        // candidate vote
        const candidates = vote as CandidateVote;
        castVoteRecord[contestId] = candidates.map((c) => c.id);
      }
    }
  }

  return castVoteRecord;
}

export function TestDeckTallyReport({
  election,
  testDeckBallots,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const fullElectionTally: FullElectionTally =
    computeTallyWithPrecomputedCategories(
      election,
      new Set(
        testDeckBallots.map((testDeckBallot) =>
          testDeckBallotToCastVoteRecord(testDeckBallot)
        )
      ),
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
