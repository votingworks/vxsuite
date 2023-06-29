import {
  CandidateVote,
  Election,
  Tabulation,
  YesNoVote,
  electionHasPrimaryContest,
} from '@votingworks/types';
import {
  getRelevantContests,
  groupMapToGroupList,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import { find, mapObject } from '@votingworks/basics';
import { TestDeckBallot } from '../utils/election';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

export interface TestDeckTallyReportProps {
  election: Election;
  testDeckBallots: TestDeckBallot[];
  precinctId?: string;
}

function testDeckBallotToCastVoteRecord(
  testDeckBallot: TestDeckBallot
): Tabulation.CastVoteRecord {
  const votes: Tabulation.CastVoteRecord['votes'] = {};

  for (const [contestId, vote] of Object.entries(testDeckBallot.votes)) {
    if (vote) {
      if (typeof vote[0] === 'string') {
        // yes no vote
        const yesNoVote = vote as YesNoVote;
        votes[contestId] = [...yesNoVote];
      } else {
        // candidate vote
        const candidates = vote as CandidateVote;
        votes[contestId] = candidates.map((c) => c.id);
      }
    }
  }

  return {
    votes,
    precinctId: testDeckBallot.precinctId,
    ballotStyleId: testDeckBallot.ballotStyleId,
    votingMethod: 'precinct',
    scannerId: 'test-deck',
    batchId: 'test-deck',
    card:
      testDeckBallot.markingMethod === 'machine'
        ? { type: 'bmd' }
        : { type: 'hmpb', sheetNumber: 1 },
  };
}

export function TestDeckTallyReport({
  election,
  testDeckBallots,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const tallyReportResults = groupMapToGroupList(
    mapObject(
      tabulateCastVoteRecords({
        election,
        cvrs: testDeckBallots.map((testDeckBallot) =>
          testDeckBallotToCastVoteRecord(testDeckBallot)
        ),
        groupBy: electionHasPrimaryContest(election)
          ? { groupByParty: true }
          : undefined,
      }),
      (scannedResults) => ({ scannedResults })
    )
  );

  return (
    <AdminTallyReportByParty
      election={election}
      contests={
        precinctId
          ? getRelevantContests({
              election,
              filter: { precinctIds: [precinctId] },
            })
          : election.contests
      }
      title={
        precinctId
          ? `Precinct Tally Report for ${
              find(election.precincts, (p) => p.id === precinctId).name
            }`
          : undefined
      }
      tallyReportType="Test Deck"
      tallyReportResults={tallyReportResults}
      testId="test-deck-tally-report"
      generatedAtTime={new Date()}
    />
  );
}
