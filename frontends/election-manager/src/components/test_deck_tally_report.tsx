import React from 'react';
import {
  Election,
  FullElectionTally,
  Tally,
  TallyCategory,
  VotesDict,
  VotingMethod,
} from '@votingworks/types';
import { tallyVotesByContest } from '@votingworks/utils';
import { ElectionManagerTallyReport } from './election_manager_tally_report';

export interface TestDeckTallyReportProps {
  election: Election;
  votes: VotesDict[];
  precinctId?: string;
}

export function TestDeckTallyReport({
  election,
  votes,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const tally: Tally = {
    numberOfBallotsCounted: votes.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes,
    }),
    ballotCountsByVotingMethod: {
      [VotingMethod.Precinct]: votes.length,
      [VotingMethod.Absentee]: 0,
    },
  };

  const fullElectionTally: FullElectionTally = (() => {
    if (precinctId) {
      const resultsByCategory = new Map();
      resultsByCategory.set(TallyCategory.Precinct, {
        [precinctId]: tally,
      });
      return {
        overallTally: tally,
        resultsByCategory,
      };
    }
    return {
      overallTally: tally,
      resultsByCategory: new Map(),
    };
  })();

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
