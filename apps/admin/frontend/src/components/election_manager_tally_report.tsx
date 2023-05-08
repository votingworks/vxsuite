import {
  ContestTally,
  LogoMark,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  TallyReportMetadata,
  TallyReportSummary,
} from '@votingworks/ui';
import {
  ContestId,
  Election,
  ManualTally,
  FullElectionTally,
  getLabelForVotingMethod,
  PartyIdSchema,
  Tally,
  unsafeParse,
  VotingMethod,
  PartyId,
  getPartyIdsWithContests,
  getPartySpecificElectionTitle,
  FullElectionManualTally,
} from '@votingworks/types';
import {
  filterTalliesByParams,
  modifyTallyWithWriteInInfo,
  NONPARTISAN_FILTER,
} from '@votingworks/utils';
import React from 'react';

import { find, Optional } from '@votingworks/basics';
import { filterManualTalliesByParams } from '../utils/manual_tallies';
import { mergeWriteIns } from '../utils/write_ins';

export type TallyReportType = 'Official' | 'Unofficial' | 'Test Deck';

export interface Props {
  batchId?: string;
  batchLabel?: string;
  election: Election;
  fullElectionManualTally?: FullElectionManualTally;
  fullElectionTally: FullElectionTally;
  generatedAtTime?: Date;
  tallyReportType: TallyReportType;
  partyId?: string;
  precinctId?: string;
  scannerId?: string;
  votingMethod?: VotingMethod;
  officialCandidateWriteIns?: Map<ContestId, Map<string, number>>; // Contest -> Candidate ID -> Count
  invalidWriteIns?: Map<ContestId, number>; // Contest -> Count
}

export function ElectionManagerTallyReport({
  batchId,
  batchLabel,
  election,
  fullElectionManualTally,
  fullElectionTally,
  generatedAtTime = new Date(),
  tallyReportType,
  partyId: reportPartyIdFromProps,
  precinctId: precinctIdFromProps,
  scannerId,
  votingMethod,
  officialCandidateWriteIns,
  invalidWriteIns,
}: Props): JSX.Element {
  const reportPartyId: Optional<PartyId> = reportPartyIdFromProps
    ? unsafeParse(PartyIdSchema, reportPartyIdFromProps)
    : undefined;

  // The report party id represents the party of the entire report. If it
  // exists, the report only contains votes from ballots associated with that
  // party. The section party id represents the party of an individual section
  // (usually a a page) within the report.
  const sectionPartyIds = (() => {
    // If the report is not specific to a party, include page for each party
    // including a page for nonpartisan races.
    if (!reportPartyId) {
      return getPartyIdsWithContests(election);
    }

    // If the report is specific to a party, there will only be a section for that
    // party or, if there are also nonpartisan races, a section for those as well.
    return election.contests.every((c) => c.type === 'candidate' && c.partyId)
      ? [reportPartyId]
      : [reportPartyId, undefined];
  })();

  const precinctIds =
    precinctIdFromProps === 'all'
      ? election.precincts.map((p) => p.id)
      : [precinctIdFromProps];

  return (
    <TallyReport>
      {sectionPartyIds.map((sectionPartyId) =>
        precinctIds.map((precinctId) => {
          const electionTitle = getPartySpecificElectionTitle(
            election,
            sectionPartyId
          );
          const filteredTally = filterTalliesByParams(
            fullElectionTally,
            election,
            {
              precinctId,
              scannerId,
              // in cases where there the entire report is party specific, we
              // need to filter votes by party for all sections, both contests for that
              // party and nonpartisan contests. Contests are still filtered by section.
              partyId: reportPartyId ?? sectionPartyId,
              votingMethod,
              batchId,
            },
            { contestPartyFilter: sectionPartyId ?? NONPARTISAN_FILTER }
          );
          const tallyForReport =
            officialCandidateWriteIns && invalidWriteIns
              ? modifyTallyWithWriteInInfo(
                  filteredTally,
                  officialCandidateWriteIns,
                  invalidWriteIns
                )
              : filteredTally;
          const ballotCountsByVotingMethod: Tally['ballotCountsByVotingMethod'] =
            {
              ...tallyForReport.ballotCountsByVotingMethod,
            };
          let reportBallotCount = tallyForReport.numberOfBallotsCounted;
          let manualTallyForReport: Optional<ManualTally>;
          if (fullElectionManualTally) {
            const filteredManualTally = filterManualTalliesByParams(
              fullElectionManualTally,
              election,
              {
                precinctId,
                partyId: reportPartyId ?? sectionPartyId,
                scannerId,
                batchId,
                votingMethod,
              }
            );
            if (
              filteredManualTally &&
              filteredManualTally.numberOfBallotsCounted > 0
            ) {
              manualTallyForReport = mergeWriteIns(filteredManualTally);
              ballotCountsByVotingMethod[fullElectionManualTally.votingMethod] =
                filteredManualTally.numberOfBallotsCounted +
                (ballotCountsByVotingMethod[
                  fullElectionManualTally.votingMethod
                ] ?? 0);
              reportBallotCount += filteredManualTally.numberOfBallotsCounted;
            }
          }

          if (precinctId) {
            const currentPrecinctName = find(
              election.precincts,
              (p) => p.id === precinctId
            ).name;
            return (
              <ReportSection key={`${sectionPartyId}-${precinctId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {tallyReportType} Precinct Tally Report for:{' '}
                    {currentPrecinctName}
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <TallyReportSummary
                    totalBallotCount={reportBallotCount}
                    ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    election={election}
                  />
                  <ContestTally
                    election={election}
                    scannedTally={tallyForReport}
                    manualTally={manualTallyForReport}
                    precinctId={precinctId}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          }

          if (scannerId) {
            return (
              <ReportSection key={`${sectionPartyId}-${scannerId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {tallyReportType} Scanner Tally Report for Scanner:{' '}
                    {scannerId}
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <TallyReportSummary
                    totalBallotCount={reportBallotCount}
                    ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    election={election}
                  />
                  <ContestTally
                    election={election}
                    scannedTally={tallyForReport}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          }

          if (batchId) {
            return (
              <ReportSection key={`${sectionPartyId}-${batchId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {tallyReportType} Batch Tally Report for {batchLabel}:
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <TallyReportSummary
                    totalBallotCount={reportBallotCount}
                    ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    election={election}
                  />
                  <ContestTally
                    election={election}
                    scannedTally={tallyForReport}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          }

          if (votingMethod) {
            const label = getLabelForVotingMethod(votingMethod);
            return (
              <ReportSection key={`${sectionPartyId}-${votingMethod}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {tallyReportType} “{label}” Ballot Tally Report
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <ContestTally
                    election={election}
                    scannedTally={tallyForReport}
                    manualTally={manualTallyForReport}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          }

          return (
            <ReportSection
              key={sectionPartyId || 'none'}
              data-testid="election-full-tally-report"
            >
              <LogoMark />
              <Prose maxWidth={false}>
                <h1>
                  {tallyReportType} {electionTitle} Tally Report
                </h1>
                <TallyReportMetadata
                  generatedAtTime={generatedAtTime}
                  election={election}
                />
              </Prose>
              <TallyReportColumns>
                <TallyReportSummary
                  totalBallotCount={reportBallotCount}
                  ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                  election={election}
                />
                <ContestTally
                  election={election}
                  scannedTally={tallyForReport}
                  manualTally={manualTallyForReport}
                />
              </TallyReportColumns>
            </ReportSection>
          );
        })
      )}
    </TallyReport>
  );
}
ElectionManagerTallyReport.displayName = 'ElectionManagerTallyReport';
