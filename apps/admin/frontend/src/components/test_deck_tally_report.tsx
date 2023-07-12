import { Election, Tabulation } from '@votingworks/types';
import { getRelevantContests } from '@votingworks/utils';
import { find } from '@votingworks/basics';
import type { TallyReportResults } from '@votingworks/admin-backend';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

export interface TestDeckTallyReportProps {
  election: Election;
  tallyReportResults: Tabulation.GroupList<TallyReportResults>;
  precinctId?: string;
}

export function TestDeckTallyReport({
  election,
  tallyReportResults,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
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
