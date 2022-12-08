import React from 'react';
import {
  Dictionary,
  Election,
  FullElectionTally,
  getBallotStyle,
  PartyId,
  Tally,
  TallyCategory,
  VotingMethod,
} from '@votingworks/types';
import { tallyVotesByContest } from '@votingworks/utils';
import { ElectionManagerTallyReport } from './election_manager_tally_report';
import {
  getPartiesWithPrimaryElections,
  TestDeckBallot,
} from '../utils/election';

export interface TestDeckTallyReportProps {
  election: Election;
  testDeckBallots: TestDeckBallot[];
  precinctId?: string;
}

function getTallyFromTestDeckBallots({
  election,
  testDeckBallots,
  partyId,
}: {
  election: Election;
  testDeckBallots: TestDeckBallot[];
  partyId?: PartyId;
}): Tally {
  let filteredTestDeckBallots = testDeckBallots;

  if (partyId) {
    filteredTestDeckBallots = testDeckBallots.filter((testDeckBallot) => {
      return (
        getBallotStyle({
          election,
          ballotStyleId: testDeckBallot.ballotStyleId,
        })?.partyId === partyId
      );
    });
  }

  return {
    numberOfBallotsCounted: filteredTestDeckBallots.length,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes: filteredTestDeckBallots.map(({ votes }) => votes),
      filterContestsByParty: partyId,
    }),
    ballotCountsByVotingMethod: {
      [VotingMethod.Precinct]: filteredTestDeckBallots.length,
      [VotingMethod.Absentee]: 0,
    },
  };
}

export function TestDeckTallyReport({
  election,
  testDeckBallots,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const overallTally = getTallyFromTestDeckBallots({
    election,
    testDeckBallots,
  });

  const fullElectionTally: FullElectionTally = (() => {
    const resultsByCategory = new Map();

    if (precinctId) {
      resultsByCategory.set(TallyCategory.Precinct, {
        [precinctId]: overallTally,
      });
    }

    const primaryParties = getPartiesWithPrimaryElections(election);
    if (primaryParties.length > 1) {
      const resultsByParty: Dictionary<Tally> = {};
      for (const party of primaryParties) {
        resultsByParty[party.id] = getTallyFromTestDeckBallots({
          election,
          testDeckBallots,
          partyId: party.id,
        });
      }

      resultsByCategory.set(TallyCategory.Party, resultsByParty);
    }

    return {
      overallTally,
      resultsByCategory,
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
