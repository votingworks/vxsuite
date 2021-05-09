import React, { ReactChild, useContext, useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import styled from 'styled-components'

import {
  ExternalTallySourceType,
  ResultsFileType,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import Prose from '../components/Prose'
import Table, { TD } from '../components/Table'

import NavigationScreen from '../components/NavigationScreen'
import Button, { SegmentedButton } from '../components/Button'
import {
  expandEitherNeitherContests,
  getContestsForPrecinct,
} from '../utils/election'
import Text from '../components/Text'
import {
  convertTalliesByPrecinctToFullExternalTally,
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
} from '../utils/externalTallies'
import LinkButton from '../components/LinkButton'
import { getExpectedNumberOfBallotsForContestInTally } from './ManualDataImportPrecinctScreen'
import { ConfirmRemovingFileModal } from '../components/ConfirmRemovingFileModal'

const MANUAL_DATA_NAME = 'Manually Added Data'

const SummaryInfo = styled.div`
  align-self: flex-start;
  position: sticky;
  top: 0;
`

const PrecinctRowText = styled(Text)`
  &&& {
    margin: 0;
    padding: 0;
  }
`

type EmptyValue = ''

const ManualDataImportIndexScreen: React.FC = () => {
  const {
    electionDefinition,
    fullElectionExternalTallies,
    saveExternalTallies,
  } = useContext(AppContext)
  const { election } = electionDefinition!
  const history = useHistory()

  const existingManualDataTallies = fullElectionExternalTallies.filter(
    (t) => t.source === ExternalTallySourceType.Manual
  )
  const existingManualData =
    existingManualDataTallies.length === 1
      ? existingManualDataTallies[0]
      : undefined
  const existingTalliesByPrecinct = existingManualData?.resultsByCategory.get(
    TallyCategory.Precinct
  )
  const talliesByPrecinct =
    existingTalliesByPrecinct ?? getEmptyExternalTalliesByPrecinct(election)
  const [ballotType, setBallotType] = useState<VotingMethod>(
    existingManualData?.votingMethod ?? VotingMethod.Precinct
  )
  const [isClearing, setIsClearing] = useState(false)

  const handleSettingBallotType = async (ballotType: VotingMethod) => {
    setBallotType(ballotType)

    // Note this WILL save an empty external tally if ballot type is toggled but there is not an external tally yet.
    const externalTally = convertTalliesByPrecinctToFullExternalTally(
      talliesByPrecinct,
      election,
      ballotType,
      ExternalTallySourceType.Manual,
      MANUAL_DATA_NAME,
      new Date()
    )
    // Don't modify any external tallies for non-manual data
    const newTallies = fullElectionExternalTallies.filter(
      (t) => t.source !== ExternalTallySourceType.Manual
    )
    // Add the new tally
    newTallies.push(externalTally)
    await saveExternalTallies(newTallies)
  }

  const getNumberOfBallotsForContest = (
    precinctId: string,
    contestId: string
  ): number | EmptyValue => {
    const precinctTally = talliesByPrecinct[precinctId]!
    const contestTally = precinctTally.contestTallies[contestId]!
    return contestTally.metadata.ballots
  }

  useEffect(() => {
    // If the data gets cleared, reset voting method.
    if (existingManualData === undefined) {
      setBallotType(VotingMethod.Precinct)
    }
  }, [existingManualData])

  const votingMethodName =
    ballotType === VotingMethod.Absentee ? 'Absentee' : 'Precinct'

  let totalNumberBallotsEntered = 0
  const enteredDataRows: ReactChild[] = []
  for (const precinct of election.precincts) {
    /* istanbul ignore next */
    const tally = talliesByPrecinct[precinct.id] ?? getEmptyExternalTally()
    const contestsWithWarnings = expandEitherNeitherContests(
      getContestsForPrecinct(election, precinct.id)
    ).filter((contest) => {
      const enteredNumberOfBallots = getNumberOfBallotsForContest(
        precinct.id,
        contest.id
      )
      const expectedNumberOfBallots = getExpectedNumberOfBallotsForContestInTally(
        tally,
        contest.id
      )
      return enteredNumberOfBallots !== expectedNumberOfBallots
    })
    enteredDataRows.push(
      <tr key={precinct.id}>
        <TD>
          <PrecinctRowText>{precinct.name}</PrecinctRowText>
          {contestsWithWarnings.length > 0 && (
            <PrecinctRowText warning warningIcon small>
              Data for precinct contains possible errors
            </PrecinctRowText>
          )}
        </TD>
        <TD nowrap data-testid="numBallots">
          <PrecinctRowText>{tally.numberOfBallotsCounted}</PrecinctRowText>
        </TD>
        <TD nowrap>
          <LinkButton
            small
            to={routerPaths.manualDataImportForPrecinct({
              precinctId: precinct.id,
            })}
          >
            Edit {precinct.name} {votingMethodName} Data
          </LinkButton>
        </TD>
      </tr>
    )
    totalNumberBallotsEntered += tally.numberOfBallotsCounted
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <SummaryInfo>
          <Prose>
            <h1>Manually Added External Results </h1>
            <p>
              Select the voting method for these ballots.
              <SegmentedButton>
                <Button
                  data-testid="ballottype-precinct"
                  disabled={ballotType === VotingMethod.Precinct}
                  onPress={() => handleSettingBallotType(VotingMethod.Precinct)}
                >
                  Precinct
                </Button>
                <Button
                  data-testid="ballottype-absentee"
                  disabled={ballotType === VotingMethod.Absentee}
                  onPress={() => handleSettingBallotType(VotingMethod.Absentee)}
                >
                  Absentee
                </Button>
              </SegmentedButton>
            </p>
            <Table condensed data-testid="summary-data">
              <thead>
                <tr>
                  <TD as="th">Precinct</TD>
                  <TD as="th">Ballots Entered</TD>
                  <TD as="th">Edit Ballot Data</TD>
                </tr>
              </thead>
              <tbody>
                {enteredDataRows}
                <tr>
                  <TD>
                    <strong>Total</strong>
                  </TD>
                  <TD data-testid="total-ballots-entered">
                    {totalNumberBallotsEntered}
                  </TD>
                  <TD />
                </tr>
              </tbody>
            </Table>
            <p>
              <Button
                danger
                disabled={existingManualData === undefined}
                onPress={() => setIsClearing(true)}
              >
                Clear Manual Data…
              </Button>{' '}
              <Button onPress={() => history.push(routerPaths.tally)}>
                Back to Tally
              </Button>{' '}
            </p>
          </Prose>
        </SummaryInfo>
      </NavigationScreen>
      {isClearing && (
        <ConfirmRemovingFileModal
          fileType={ResultsFileType.Manual}
          onClose={() => setIsClearing(false)}
        />
      )}
    </React.Fragment>
  )
}

export default ManualDataImportIndexScreen
