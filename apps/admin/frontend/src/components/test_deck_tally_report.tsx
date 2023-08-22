import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { getContestsForPrecinct } from '@votingworks/utils';
import { find } from '@votingworks/basics';
import type { TallyReportResults } from '@votingworks/admin-backend';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

export interface TestDeckTallyReportProps {
  electionDefinition: ElectionDefinition;
  tallyReportResults: Tabulation.GroupList<TallyReportResults>;
  precinctId?: string;
}

export function TestDeckTallyReport({
  electionDefinition,
  tallyReportResults,
  precinctId,
}: TestDeckTallyReportProps): JSX.Element {
  const { election } = electionDefinition;
  return (
    <AdminTallyReportByParty
      election={election}
      contests={getContestsForPrecinct(electionDefinition, precinctId)}
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
