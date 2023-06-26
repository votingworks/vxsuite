import {
  Contests,
  Election,
  Tabulation,
  electionHasPrimaryContest,
} from '@votingworks/types';
import React from 'react';

import { find, unique } from '@votingworks/basics';
import type { TallyReportResults } from '@votingworks/admin-backend';
import { AdminTallyReport } from '@votingworks/ui';
import {
  combineElectionResults,
  combineManualElectionResults,
  getEmptyElectionResults,
} from '@votingworks/utils';

export type TallyReportType = 'Official' | 'Unofficial' | 'Test Deck';

/**
 * The `AdminTallyReport` in `libs/ui` displays only a single set of election results,
 * but for primary elections all of our printed reports are separated by party. This
 * component displays the results by party, if applicable. It also adds a nonpartisan
 * contest page if there are nonpartisan contests in a primary election.
 *
 * `tallyReportResults` - list of results for each party
 * `contests` - list of contests applicable to the reports (based on report filters)
 * `title` - if not indicated, report is assumed to be the "Full Election Tally"
 * `restrictToPartyIds` - if indicated, only these parties will be included in the report
 */
export function AdminTallyReportByParty({
  election,
  tallyReportResults,
  contests,
  title,
  tallyReportType,
  testId,
  generatedAtTime,
}: {
  election: Election;
  tallyReportResults: Tabulation.GroupList<TallyReportResults>;
  contests: Contests;
  title?: string;
  tallyReportType: TallyReportType;
  testId: string;
  generatedAtTime: Date;
}): JSX.Element {
  // general election - just return a single report section
  if (!electionHasPrimaryContest(election)) {
    const generalResults = tallyReportResults[0];
    return (
      <AdminTallyReport
        testId={testId}
        election={election}
        contests={contests}
        scannedElectionResults={
          generalResults?.scannedResults ||
          getEmptyElectionResults(election, true)
        }
        manualElectionResults={generalResults?.manualResults}
        title={
          title
            ? `${tallyReportType} ${title}`
            : `${tallyReportType} ${election.title} Tally Report`
        }
        subtitle={title ? election.title : undefined}
        generatedAtTime={generatedAtTime}
      />
    );
  }

  // primary election - return a report section for each relevant party
  const relevantPartyIds = unique(
    contests.map((c) => (c.type === 'candidate' ? c.partyId : undefined))
  );

  const partyCompleteTallyResults: TallyReportResults[] = [];
  const partyCompleteTallyReports: JSX.Element[] = [];

  for (const partyId of relevantPartyIds) {
    if (!partyId) continue; // non-partisan contests handled separately

    // if a primary, we expect the passed results to have party identifiers
    const reportResults = tallyReportResults.find(
      (results) => results.partyId === partyId
    ) || { scannedResults: getEmptyElectionResults(election, true) };
    partyCompleteTallyResults.push(reportResults);

    const party = find(election.parties, (p) => p.id === partyId);
    const partyElectionTitle = `${party.fullName} ${election.title}`;

    partyCompleteTallyReports.push(
      <AdminTallyReport
        key={`${testId}-${partyId}`}
        testId={`${testId}-${partyId}`}
        election={election}
        contests={contests.filter(
          (c) => c.type === 'candidate' && c.partyId === partyId
        )}
        scannedElectionResults={reportResults.scannedResults}
        manualElectionResults={reportResults.manualResults}
        title={
          title
            ? `${tallyReportType} ${title}`
            : `${tallyReportType} ${partyElectionTitle} Tally Report`
        }
        subtitle={title ? partyElectionTitle : undefined}
      />
    );
  }

  // if there are nonpartisan contests, we must add a nonpartisan page
  // and combine the results across partisan ballots
  if (relevantPartyIds.includes(undefined)) {
    const combinedScannedResults = combineElectionResults({
      election,
      allElectionResults: partyCompleteTallyResults.map(
        (r) => r.scannedResults
      ),
    });
    const allManualResults = partyCompleteTallyResults
      .map((r) => r.manualResults)
      .filter((r): r is Tabulation.ManualElectionResults => !!r);
    const combinedManualResults = allManualResults.length
      ? combineManualElectionResults({ election, allManualResults })
      : undefined;
    const nonpartisanElectionTitle = `${election.title} Nonpartisan Contests`;

    partyCompleteTallyReports.push(
      <AdminTallyReport
        key={`${testId}-nonpartisan`}
        testId={`${testId}-nonpartisan`}
        election={election}
        contests={contests.filter((c) => c.type === 'yesno' || !c.partyId)}
        scannedElectionResults={combinedScannedResults}
        manualElectionResults={combinedManualResults}
        title={
          title
            ? `${tallyReportType} ${title}`
            : `${tallyReportType} ${nonpartisanElectionTitle} Tally Report`
        }
        subtitle={title ? nonpartisanElectionTitle : undefined}
      />
    );
  }

  return <React.Fragment>{partyCompleteTallyReports}</React.Fragment>;
}
