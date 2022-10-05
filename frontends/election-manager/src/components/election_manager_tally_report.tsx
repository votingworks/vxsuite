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
  ExternalTally,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionTally,
  getLabelForVotingMethod,
  PartyIdSchema,
  Tally,
  unsafeParse,
  VotingMethod,
  Optional,
} from '@votingworks/types';
import { filterTalliesByParams, find } from '@votingworks/utils';
import React, { forwardRef } from 'react';

import { filterExternalTalliesByParams } from '../utils/external_tallies';
import { modifyTallyWithWriteInInfo } from '../lib/votecounting';
import { mergeWriteIns } from '../utils/write_ins';

export type TallyReportType = 'Official' | 'Unofficial' | 'Test Deck';

export interface Props {
  batchId?: string;
  batchLabel?: string;
  election: Election;
  fullElectionExternalTallies: FullElectionExternalTallies;
  fullElectionTally: FullElectionTally;
  generatedAtTime?: Date;
  tallyReportType: TallyReportType;
  partyId?: string;
  precinctId?: string;
  scannerId?: string;
  votingMethod?: VotingMethod;
  officialCandidateWriteIns?: Map<ContestId, Map<string, number>>; // Contest -> Candidate ID -> Count
}

export const ElectionManagerTallyReport = forwardRef<HTMLDivElement, Props>(
  (
    {
      batchId,
      batchLabel,
      election,
      fullElectionExternalTallies,
      fullElectionTally,
      generatedAtTime = new Date(),
      tallyReportType,
      partyId: partyIdFromProps,
      precinctId: precinctIdFromProps,
      scannerId,
      votingMethod,
      officialCandidateWriteIns,
    },
    ref
  ) => {
    const ballotStylePartyIds =
      partyIdFromProps !== undefined
        ? [unsafeParse(PartyIdSchema, partyIdFromProps)]
        : Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));

    const precinctIds =
      precinctIdFromProps === 'all'
        ? election.precincts.map((p) => p.id)
        : [precinctIdFromProps];

    return (
      <TallyReport className="print-only" ref={ref}>
        {ballotStylePartyIds.map((partyId) =>
          precinctIds.map((precinctId) => {
            const party = election.parties.find((p) => p.id === partyId);
            const electionTitle = party
              ? `${party.fullName} ${election.title}`
              : election.title;

            const filteredTally = filterTalliesByParams(
              fullElectionTally,
              election,
              { precinctId, scannerId, partyId, votingMethod, batchId }
            );
            const tallyForReport = officialCandidateWriteIns
              ? modifyTallyWithWriteInInfo(
                  filteredTally,
                  officialCandidateWriteIns
                )
              : filteredTally;
            const ballotCountsByVotingMethod: Tally['ballotCountsByVotingMethod'] =
              {
                ...tallyForReport.ballotCountsByVotingMethod,
              };
            let reportBallotCount = tallyForReport.numberOfBallotsCounted;
            let manualTallyForReport: Optional<ExternalTally>;
            const otherExternalTalliesForReport: ExternalTally[] = [];
            for (const t of fullElectionExternalTallies.values()) {
              const filteredExternalTally = filterExternalTalliesByParams(
                t,
                election,
                {
                  precinctId,
                  partyId,
                  scannerId,
                  batchId,
                  votingMethod,
                }
              );
              if (
                filteredExternalTally &&
                filteredExternalTally.numberOfBallotsCounted > 0
              ) {
                if (t.source === ExternalTallySourceType.Manual) {
                  manualTallyForReport = mergeWriteIns(filteredExternalTally);
                } else {
                  otherExternalTalliesForReport.push(filteredExternalTally);
                }
                ballotCountsByVotingMethod[t.votingMethod] =
                  filteredExternalTally.numberOfBallotsCounted +
                  (ballotCountsByVotingMethod[t.votingMethod] ?? 0);
                reportBallotCount +=
                  filteredExternalTally.numberOfBallotsCounted;
              }
            }

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
                    />
                    <ContestTally
                      election={election}
                      scannedTally={tallyForReport}
                      manualTally={manualTallyForReport}
                      otherExternalTallies={otherExternalTalliesForReport}
                      precinctId={precinctId}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            if (scannerId) {
              return (
                <ReportSection key={`${partyId}-${scannerId}`}>
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
                <ReportSection key={`${partyId}-${batchId}`}>
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
                <ReportSection key={`${partyId}-${votingMethod}`}>
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
                      otherExternalTallies={otherExternalTalliesForReport}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            return (
              <ReportSection
                key={partyId || 'none'}
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
                  />
                  <ContestTally
                    election={election}
                    scannedTally={tallyForReport}
                    manualTally={manualTallyForReport}
                    otherExternalTallies={otherExternalTalliesForReport}
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
ElectionManagerTallyReport.displayName = 'ElectionManagerTallyReport';
