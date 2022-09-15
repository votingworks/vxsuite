import {
  ContestWriteInTally,
  LogoMark,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  TallyReportMetadata,
  Text,
} from '@votingworks/ui';
import {
  Election,
  getLabelForVotingMethod,
  PartyIdSchema,
  unsafeParse,
  VotingMethod,
  ContestId,
} from '@votingworks/types';
import { find } from '@votingworks/utils';
import React, { forwardRef } from 'react';

export interface Props {
  batchId?: string;
  batchLabel?: string;
  election: Election;
  writeInCounts: Map<ContestId, Map<string, number>>;
  generatedAtTime?: Date;
  isOfficialResults: boolean;
  partyId?: string;
  precinctId?: string;
  scannerId?: string;
  votingMethod?: VotingMethod;
}

// eslint-disable-next-line react/display-name
export const ElectionManagerWriteInTallyReport = forwardRef<
  HTMLDivElement,
  Props
>(
  (
    {
      batchId,
      batchLabel,
      election,
      writeInCounts,
      generatedAtTime = new Date(),
      isOfficialResults,
      partyId: partyIdFromProps,
      precinctId: precinctIdFromProps,
      scannerId,
      votingMethod,
    },
    ref
  ) => {
    const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

    const ballotStylePartyIds =
      partyIdFromProps !== undefined
        ? [unsafeParse(PartyIdSchema, partyIdFromProps)]
        : Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));

    const precinctIds =
      precinctIdFromProps === 'all'
        ? election.precincts.map((p) => p.id)
        : [precinctIdFromProps];

    const writeInMetadataFooter = (
      <React.Fragment>
        <br />
        <Text small as="span">
          Note: Write-in votes adjudicated to official candidates are included
          in the Full Election Tally Report and not this report.
        </Text>
      </React.Fragment>
    );

    return (
      <TallyReport className="print-only" ref={ref}>
        {ballotStylePartyIds.map((partyId) =>
          precinctIds.map((precinctId) => {
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
                      {statusPrefix} Scanner Tally Report for Scanner:{' '}
                      {scannerId}
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
                    writeInCounts={writeInCounts}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          })
        )}
      </TallyReport>
    );
  }
);
