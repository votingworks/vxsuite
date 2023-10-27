import { ElectionDefinition } from '@votingworks/types';
import { find } from '@votingworks/basics';
import type { TallyReportResults } from '@votingworks/admin-backend';
import { AdminTallyReportByParty } from './admin_tally_report_by_party';

export interface TestDeckTallyReportProps {
  electionDefinition: ElectionDefinition;
  tallyReportResults: TallyReportResults;
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
      electionDefinition={electionDefinition}
      title={
        precinctId
          ? `Precinct Tally Report for ${
              find(election.precincts, (p) => p.id === precinctId).name
            }`
          : undefined
      }
      isOfficial={false}
      isTest
      isForLogicAndAccuracyTesting
      tallyReportResults={tallyReportResults}
      testId="test-deck-tally-report"
      generatedAtTime={new Date()}
    />
  );
}
