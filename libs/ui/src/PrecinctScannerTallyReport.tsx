import { Election, Tally } from '@votingworks/types'
import React from 'react'
import { format, find } from '@votingworks/utils'
import {
  PrecinctSelection,
  PrecinctSelectionKind,
} from './PrecinctScannerPollsReport'
import { ContestTally } from './ContestTally'
import {
  PrintableContainer,
  Prose,
  ReportSection,
  TallyReport,
  TallyReportColumns,
  Text,
  LogoMark,
} from '.'
import { TallyReportSummary } from './TallyReportSummary'

interface Props {
  currentDateTime: string
  election: Election
  precinctSelection: PrecinctSelection
  reportPurpose: string
  isPollsOpen: boolean
  tally: Tally
}

export const PrecinctScannerTallyReport = ({
  currentDateTime,
  election,
  precinctSelection,
  reportPurpose,
  isPollsOpen,
  tally,
}: Props): JSX.Element => {
  const precinctId =
    precinctSelection.kind === PrecinctSelectionKind.SinglePrecinct
      ? precinctSelection.precinctId
      : undefined
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === precinctSelection.precinctId)
          .name
  const pollsAction = isPollsOpen ? 'Opened' : 'Closed'
  const reportTitle = `${precinctName} Polls ${pollsAction} Tally Report`
  const electionDate = format.localeWeekdayAndDate(new Date(election.date))

  return (
    <PrintableContainer>
      <TallyReport>
        <ReportSection>
          <LogoMark />
          <Prose maxWidth={false}>
            <h1>{reportTitle}</h1>
            <h2>{election.title}</h2>
            <p>
              {electionDate}, {election.county.name}, {election.state}
              <br /> <br />
              This report should be <strong>{reportPurpose}.</strong>
              <br />
              <Text small as="span">
                Polls {pollsAction} and report created on {currentDateTime}
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
  )
}
