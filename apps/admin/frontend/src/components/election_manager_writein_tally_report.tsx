import {
  ContestWriteInTally,
  LogoMark,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  TallyReportMetadata,
  Text,
} from '@votingworks/shared-frontend';
import {
  Election,
  getLabelForVotingMethod,
  PartyIdSchema,
  unsafeParse,
  VotingMethod,
} from '@votingworks/types';
import { find } from '@votingworks/basics';
import React from 'react';
import {
  combineWriteInCounts,
  CountsByContestAndCandidateName,
  filterWriteInCountsByParty,
  writeInCountsAreEmpty,
} from '../utils/write_ins';

export interface Props {
  batchId?: string;
  batchLabel?: string;
  election: Election;
  screenAdjudicatedWriteInCounts: CountsByContestAndCandidateName;
  manualWriteInCounts?: CountsByContestAndCandidateName;
  generatedAtTime?: Date;
  isOfficialResults: boolean;
  partyId?: string;
  precinctId?: string;
  scannerId?: string;
  votingMethod?: VotingMethod;
}

export function ElectionManagerWriteInTallyReport({
  batchId,
  batchLabel,
  election,
  screenAdjudicatedWriteInCounts,
  manualWriteInCounts,
  generatedAtTime = new Date(),
  isOfficialResults,
  partyId: partyIdFromProps,
  precinctId: precinctIdFromProps,
  scannerId,
  votingMethod,
}: Props): JSX.Element {
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const ballotStylePartyIds =
    partyIdFromProps !== undefined
      ? [unsafeParse(PartyIdSchema, partyIdFromProps)]
      : Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));

  const precinctIds =
    precinctIdFromProps === 'all'
      ? election.precincts.map((p) => p.id)
      : [precinctIdFromProps];

  const writeInCounts = manualWriteInCounts
    ? combineWriteInCounts([
        screenAdjudicatedWriteInCounts,
        manualWriteInCounts,
      ])
    : screenAdjudicatedWriteInCounts;

  const writeInMetadataFooter = (
    <React.Fragment>
      <br />
      <Text small as="span">
        Note: Write-in votes adjudicated to official candidates are included in
        the Full Election Tally Report and not this report.
      </Text>
    </React.Fragment>
  );

  return (
    <TallyReport>
      {ballotStylePartyIds.map((partyId) => {
        const writeInCountsFilteredByParty = filterWriteInCountsByParty(
          writeInCounts,
          election,
          partyId
        );
        if (writeInCountsAreEmpty(writeInCountsFilteredByParty)) {
          return null;
        }
        return precinctIds.map((precinctId) => {
          const party = election.parties.find((p) => p.id === partyId);
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title;

          if (precinctId) {
            const currentPrecinctName = find(
              election.precincts,
              (p) => p.id === precinctId
            ).name;
            return (
              <ReportSection key={`${partyId}-${precinctId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} Precinct Tally Report for:{' '}
                    {currentPrecinctName}
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                    footer={writeInMetadataFooter}
                  />
                </Prose>
                <TallyReportColumns />
              </ReportSection>
            );
          }

          if (scannerId) {
            return (
              <ReportSection key={`${partyId}-${scannerId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} Scanner Tally Report for Scanner: {scannerId}
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                    footer={writeInMetadataFooter}
                  />
                </Prose>
                <TallyReportColumns />
              </ReportSection>
            );
          }

          if (batchId) {
            return (
              <ReportSection key={`${partyId}-${batchId}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} Batch Tally Report for {batchLabel}:
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                    footer={writeInMetadataFooter}
                  />
                </Prose>
                <TallyReportColumns />
              </ReportSection>
            );
          }

          if (votingMethod) {
            const label = getLabelForVotingMethod(votingMethod);
            return (
              <ReportSection key={`${partyId}-${votingMethod}`}>
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} “{label}” Write-In Tally Report
                  </h1>
                  <h2>{electionTitle}</h2>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                    footer={writeInMetadataFooter}
                  />
                </Prose>
                <TallyReportColumns />
              </ReportSection>
            );
          }

          return (
            <ReportSection
              key={partyId || 'none'}
              data-testid="election-full-tally-writein-report"
            >
              <LogoMark />
              <Prose maxWidth={false}>
                <h1>
                  {statusPrefix} {electionTitle} Write-In Tally Report
                </h1>
                <TallyReportMetadata
                  generatedAtTime={generatedAtTime}
                  election={election}
                  footer={writeInMetadataFooter}
                />
              </Prose>
              <TallyReportColumns>
                <ContestWriteInTally
                  election={election}
                  writeInCounts={writeInCountsFilteredByParty}
                />
              </TallyReportColumns>
            </ReportSection>
          );
        });
      })}
    </TallyReport>
  );
}
