import { Admin, ElectionDefinition } from '@votingworks/types';
import React from 'react';

import { unique } from '@votingworks/basics';
import {
  getContestById,
  getEmptyCardCounts,
  getPartyById,
} from '@votingworks/utils';
import { AdminTallyReport } from './admin_tally_report';
import { LabeledScannerBatch } from './utils';

export interface AdminTallyReportByPartyProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash?: string;
  tallyReportResults: Admin.TallyReportResults;
  title?: string;
  isTest: boolean;
  isOfficial: boolean;
  isForLogicAndAccuracyTesting?: boolean;
  testId: string;
  generatedAtTime: Date;
  customFilter?: Admin.FrontendReportingFilter;
  scannerBatches?: LabeledScannerBatch[];
  includeSignatureLines?: boolean;
}

/**
 * The `AdminTallyReport` component displays only a single set of election results,
 * but for primary elections all of our printed reports are separated by party. This
 * component displays the results by party, if applicable. It also adds a nonpartisan
 * contest page if there are nonpartisan contests in a primary election.
 *
 * `tallyReportResults` - results provided by the backend
 * `contests` - list of contests applicable to the reports (based on report filters)
 * `title` - if not indicated, report is assumed to be the "Full Election Tally"
 * `restrictToPartyIds` - if indicated, only these parties will be included in the report
 */
export function AdminTallyReportByParty({
  electionDefinition,
  electionPackageHash,
  tallyReportResults,
  title,
  isTest,
  isOfficial,
  isForLogicAndAccuracyTesting,
  testId,
  generatedAtTime,
  customFilter,
  scannerBatches,
  includeSignatureLines,
}: AdminTallyReportByPartyProps): JSX.Element {
  const contests = tallyReportResults.contestIds.map((contestId) =>
    getContestById(electionDefinition, contestId)
  );

  // general election case - just return a single report section
  if (!tallyReportResults.hasPartySplits) {
    return (
      <AdminTallyReport
        testId={testId}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        contests={contests}
        scannedElectionResults={tallyReportResults.scannedResults}
        manualElectionResults={tallyReportResults.manualResults}
        title={title ?? `Tally Report`}
        isTest={isTest}
        isOfficial={isOfficial}
        isForLogicAndAccuracyTesting={isForLogicAndAccuracyTesting}
        generatedAtTime={generatedAtTime}
        customFilter={customFilter}
        scannerBatches={scannerBatches}
        includeSignatureLines={includeSignatureLines}
      />
    );
  }

  // primary election - return a report section for each relevant party
  const relevantPartyIds = unique(
    contests.map((c) => (c.type === 'candidate' ? c.partyId : undefined))
  );

  const partyCompleteTallyReports: JSX.Element[] = [];

  for (const partyId of relevantPartyIds) {
    if (!partyId) continue; // non-partisan contests handled separately

    const partyCardCounts =
      // istanbul ignore next - trivial fallthrough case
      tallyReportResults.cardCountsByParty[partyId] ?? getEmptyCardCounts();
    const partyLabel = getPartyById(electionDefinition, partyId).fullName;

    partyCompleteTallyReports.push(
      <AdminTallyReport
        key={`${testId}-${partyId}`}
        testId={`${testId}-${partyId}`}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        partyLabel={partyLabel}
        contests={contests.filter(
          (c) => c.type === 'candidate' && c.partyId === partyId
        )}
        scannedElectionResults={tallyReportResults.scannedResults}
        manualElectionResults={
          partyCardCounts.manual ? tallyReportResults.manualResults : undefined
        }
        title={title ?? 'Tally Report'}
        isTest={isTest}
        isOfficial={isOfficial}
        isForLogicAndAccuracyTesting={isForLogicAndAccuracyTesting}
        cardCountsOverride={partyCardCounts}
        generatedAtTime={generatedAtTime}
        customFilter={customFilter}
        scannerBatches={scannerBatches}
        includeSignatureLines={includeSignatureLines}
      />
    );
  }

  // if there are nonpartisan contests, we must add a nonpartisan page
  // and combine the results across partisan ballots
  if (relevantPartyIds.includes(undefined)) {
    partyCompleteTallyReports.push(
      <AdminTallyReport
        key={`${testId}-nonpartisan`}
        testId={`${testId}-nonpartisan`}
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        partyLabel="Nonpartisan Contests"
        contests={contests.filter((c) => c.type === 'yesno' || !c.partyId)}
        scannedElectionResults={tallyReportResults.scannedResults}
        manualElectionResults={tallyReportResults.manualResults}
        title={title ?? 'Tally Report'}
        isTest={isTest}
        isOfficial={isOfficial}
        isForLogicAndAccuracyTesting={isForLogicAndAccuracyTesting}
        generatedAtTime={generatedAtTime}
        customFilter={customFilter}
        scannerBatches={scannerBatches}
        includeSignatureLines={includeSignatureLines}
      />
    );
  }

  return <React.Fragment>{partyCompleteTallyReports}</React.Fragment>;
}
