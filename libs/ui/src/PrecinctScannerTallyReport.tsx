import {
  ElectionDefinition,
  Tally,
  PrecinctSelection,
  PrecinctSelectionKind,
  PartyId,
} from '@votingworks/types';
import React from 'react';
import { DateTime } from 'luxon';
import { format, find, formatFullDateTimeZone } from '@votingworks/utils';
import { ContestTally } from './ContestTally';
import {
  PrintableContainer,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  Text,
  LogoMark,
} from '.';
import { TallyReportSummary } from './TallyReportSummary';

interface Props {
  reportSavedTime: number;
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  reportPurpose: string;
  isPollsOpen: boolean;
  tally: Tally;
}

export function PrecinctScannerTallyReport({
  reportSavedTime,
  electionDefinition,
  precinctSelection,
  reportPurpose,
  isPollsOpen,
  partyId,
  tally,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === PrecinctSelectionKind.SinglePrecinct
      ? precinctSelection.precinctId
      : undefined;
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === precinctSelection.precinctId)
          .name;
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed';

  const reportTitle = `${precinctName} Polls ${pollsAction} Tally Report`;
  const electionDate = format.localeWeekdayAndDate(new Date(election.date));

  const party = election.parties.find((p) => p.id === partyId);
  const electionTitle = party
    ? `${party.fullName} ${election.title}`
    : election.title;

  return (
    <PrintableContainer data-testid={`tally-report-${partyId}-${precinctId}`}>
      <TallyReport>
        <ReportSection>
          <LogoMark />
          <Prose maxWidth={false}>
            <h1>{reportTitle}</h1>
            <h2>{electionTitle}</h2>
            <p>
              {electionDate}, {election.county.name}, {election.state}
              <br /> <br />
              This report should be <strong>{reportPurpose}.</strong>
              <br />
              <Text small as="span">
                Polls {pollsAction} and report created on{' '}
                {formatFullDateTimeZone(DateTime.fromMillis(reportSavedTime))}
              </Text>
            </p>
          </Prose>
          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
            />
            <ContestTally
              election={election}
              electionTally={tally}
              externalTallies={[]}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
      </TallyReport>
    </PrintableContainer>
  );
}
