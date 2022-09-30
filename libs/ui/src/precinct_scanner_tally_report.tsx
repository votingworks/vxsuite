import {
  ElectionDefinition,
  PartyId,
  PrecinctSelection,
  Tally,
} from '@votingworks/types';
import {
  format,
  formatFullDateTimeZone,
  getPrecinctSelectionName,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import { ContestTally } from './contest_tally';
import { LogoMark } from './logo_mark';
import { Prose } from './prose';
import {
  PrintableContainer,
  ReportSection,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { TallyReportSummary } from './tally_report_summary';
import { Text } from './text';

interface Props {
  reportSavedTime: number;
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  isPollsOpen: boolean;
  tally: Tally;
}

export function PrecinctScannerTallyReport({
  reportSavedTime,
  electionDefinition,
  precinctSelection,
  isPollsOpen,
  partyId,
  tally,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined;
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );
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
