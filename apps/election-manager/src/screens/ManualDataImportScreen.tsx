import React, { ReactChild, useContext, useState } from 'react'
import { useHistory } from 'react-router-dom'
import styled from 'styled-components'
import {
  CandidateContest,
  Contest,
  Dictionary,
  expandEitherNeitherContests,
} from '@votingworks/types'

import {
  ContestOption,
  ContestOptionTally,
  ContestTally,
  ExternalTally,
  ExternalTallySourceType,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import routerPaths from '../routerPaths'

import AppContext from '../contexts/AppContext'

import Prose from '../components/Prose'
import Table, { TD } from '../components/Table'

import NavigationScreen from '../components/NavigationScreen'
import Button, { SegmentedButton } from '../components/Button'
import Select from '../components/Select'
import {
  getContestsForPrecinct,
  getAllPossibleCandidatesForCandidateContest,
} from '../utils/election'
import TextInput from '../components/TextInput'
import Text from '../components/Text'
import {
  convertTalliesByPrecinctToFullExternalTally,
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
  getTotalNumberOfBallots,
} from '../utils/externalTallies'

const MANUAL_DATA_NAME = 'Manually Added Data'

const TallyInput = styled(TextInput)`
  width: 4em;
`

const ContestData = styled.div`
  padding: 0 0;
`

const Columns = styled.div`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  > div:first-child {
    margin-top: 1rem;
  }
  > div:last-child {
    flex: 1;
    margin-top: 1rem;
    margin-left: 2rem;
  }
`

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

// While we're holding data internally in this component tallys can be stored
// as strings or as numbers to allow the user to delete a "0" in the text boxes.
// When the data is saved empty strings are convertted back to 0s.
type EmptyValue = ''
interface TempContestOptionTally {
  readonly option: ContestOption
  readonly tally: number | EmptyValue
}

interface TempContestTallyMeta {
  readonly ballots: number | EmptyValue
  readonly undervotes: number | EmptyValue
  readonly overvotes: number | EmptyValue
}
interface TempContestTally {
  readonly contest: Contest
  readonly tallies: Dictionary<TempContestOptionTally>
  readonly metadata: TempContestTallyMeta
}

interface TempExternalTally {
  readonly contestTallies: Dictionary<TempContestTally>
  readonly numberOfBallotsCounted: number
}

const ManualDataImportScreen: React.FC = () => {
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
  const [talliesByPrecinct, setTalliesByPrecinct] = useState<
    Dictionary<TempExternalTally>
  >(existingTalliesByPrecinct ?? getEmptyExternalTalliesByPrecinct(election))
  const [ballotType, setBallotType] = useState<VotingMethod>(
    existingManualData?.votingMethod ?? VotingMethod.Precinct
  )

  const initialPrecinct = election.precincts[0]?.id
  const [currentPrecinctId, setCurrentPrecinctId] = useState(initialPrecinct)
  const currentPrecinct = election.precincts.find(
    (p) => p.id === currentPrecinctId
  )
  const currentPrecinctTally =
    talliesByPrecinct[currentPrecinctId] ?? getEmptyExternalTally()

  // Convert internal structure of contest data that allows for empty strings, to the regular
  // type by mapping any empty string values to zeros.
  const convertContestTallies = (
    contestTallies: Dictionary<TempContestTally>
  ): Dictionary<ContestTally> => {
    const convertedContestTallies: Dictionary<ContestTally> = {}
    for (const contestId of Object.keys(contestTallies)) {
      const contestTally = contestTallies[contestId]!
      const convertedOptionTallies: Dictionary<ContestOptionTally> = {}
      for (const optionId of Object.keys(contestTally.tallies)) {
        const optionTally = contestTally.tallies[optionId]!
        convertedOptionTallies[optionId] = {
          ...optionTally,
          tally: optionTally.tally === '' ? 0 : optionTally.tally,
        }
      }
      convertedContestTallies[contestId] = {
        ...contestTally,
        tallies: convertedOptionTallies,
        metadata: {
          ballots:
            contestTally.metadata.ballots === ''
              ? 0
              : contestTally.metadata.ballots,
          undervotes:
            contestTally.metadata.undervotes === ''
              ? 0
              : contestTally.metadata.undervotes,
          overvotes:
            contestTally.metadata.overvotes === ''
              ? 0
              : contestTally.metadata.overvotes,
        },
      }
    }
    return convertedContestTallies
  }

  const handleImportingData = async () => {
    // Turn the precinct tallies into a CSV SEMS file
    // Save that file as the external results file with a name implied manual data entry happened

    // Convert the temporary data structure that allows empty strings or numbers for all tallys to fill in 0s for
    // any empty strings.
    const convertedTalliesByPrecinct: Dictionary<ExternalTally> = {}
    for (const precinctId of Object.keys(talliesByPrecinct)) {
      const precinctTally = talliesByPrecinct[precinctId]!
      convertedTalliesByPrecinct[precinctId] = {
        ...precinctTally,
        contestTallies: convertContestTallies(precinctTally.contestTallies),
      }
    }

    const externalTally = convertTalliesByPrecinctToFullExternalTally(
      convertedTalliesByPrecinct,
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
    history.push(routerPaths.tally)
  }

  const getValueForInput = (
    precinctId: string,
    contestId: string,
    dataKey: string
  ): number | EmptyValue => {
    const precinctTally = talliesByPrecinct[precinctId]!
    const contestTally = precinctTally.contestTallies[contestId]!
    switch (dataKey) {
      case 'numBallots':
        return contestTally.metadata.ballots
      case 'overvotes':
        return contestTally.metadata.overvotes
      case 'undervotes':
        return contestTally.metadata.undervotes
      default:
        return contestTally.tallies[dataKey]?.tally !== undefined
          ? contestTally.tallies[dataKey]!.tally
          : 0
    }
  }

  const getNumericalValueForTally = (tally: number | EmptyValue): number => {
    if (tally === '') {
      return 0
    }
    return tally
  }

  const getExpectedNumberOfBallots = (
    precinctId: string,
    contestId: string
  ): number => {
    const precinctTally = talliesByPrecinct[precinctId]!
    const contestTally = precinctTally.contestTallies[contestId]!
    const numSeats =
      contestTally.contest.type === 'candidate'
        ? (contestTally.contest as CandidateContest).seats
        : 1
    const sumOfCandidateVotes = Object.values(contestTally.tallies).reduce(
      (prevValue, optionTally) =>
        prevValue +
        (optionTally ? getNumericalValueForTally(optionTally.tally) : 0),
      0
    )
    return Math.ceil(
      (getNumericalValueForTally(contestTally.metadata.overvotes) +
        getNumericalValueForTally(contestTally.metadata.undervotes) +
        sumOfCandidateVotes) /
        numSeats
    )
  }

  const updateContestData = (
    contestId: string,
    dataKey: string,
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const contestTally = currentPrecinctTally.contestTallies[contestId]!
    const stringValue = event.currentTarget.value
    let numericalValue = parseInt(stringValue, 10)
    if (stringValue === '') {
      numericalValue = 0
    }
    const valueToSave = stringValue === '' ? '' : numericalValue
    if (Number.isNaN(numericalValue)) {
      return
    }
    let newContestTally = contestTally
    switch (dataKey) {
      case 'numBallots':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            ballots: valueToSave,
          },
        }
        break
      case 'overvotes':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            overvotes: valueToSave,
          },
        }
        break
      case 'undervotes':
        newContestTally = {
          ...contestTally,
          metadata: {
            ...contestTally.metadata,
            undervotes: valueToSave,
          },
        }
        break
      default:
        newContestTally = {
          ...contestTally,
          tallies: {
            ...contestTally.tallies,
            [dataKey]: {
              option: contestTally.tallies[dataKey]!.option,
              tally: valueToSave,
            },
          },
        }
    }
    const newContestTallies = {
      ...currentPrecinctTally.contestTallies,
      [contestId]: newContestTally,
    }
    const numberBallotsInPrecinct = getTotalNumberOfBallots(
      convertContestTallies(newContestTallies),
      election
    )
    setTalliesByPrecinct({
      ...talliesByPrecinct,
      [currentPrecinctId]: {
        numberOfBallotsCounted: numberBallotsInPrecinct,
        contestTallies: newContestTallies,
      },
    })
  }

  let totalNumberBallotsEntered = 0
  const enteredDataRows: ReactChild[] = []
  for (const precinct of election.precincts) {
    const contestsWithWarnings = expandEitherNeitherContests(
      getContestsForPrecinct(election, precinct.id)
    ).filter((contest) => {
      const enteredNumberOfBallots = getNumericalValueForTally(
        getValueForInput(precinct.id, contest.id, 'numBallots')
      )
      const expectedNumberOfBallots = getExpectedNumberOfBallots(
        precinct.id,
        contest.id
      )
      return enteredNumberOfBallots !== expectedNumberOfBallots
    })
    const tally = talliesByPrecinct[precinct.id] ?? getEmptyExternalTally()
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
        <TD narrow nowrap data-testid="numBallots">
          <PrecinctRowText>{tally.numberOfBallotsCounted}</PrecinctRowText>
        </TD>
      </tr>
    )
    totalNumberBallotsEntered += tally.numberOfBallotsCounted
  }
  const currentContests = expandEitherNeitherContests(
    getContestsForPrecinct(election, currentPrecinctId)
  )

  return (
    <React.Fragment>
      <NavigationScreen>
        <Columns>
          <SummaryInfo>
            <Prose>
              <h1>Manually Add External Results </h1>
              <p>Select the voting method for these ballots.</p>
              <SegmentedButton>
                <Button
                  data-testid="ballottype-precinct"
                  disabled={ballotType === VotingMethod.Precinct}
                  onPress={() => setBallotType(VotingMethod.Precinct)}
                >
                  Precinct
                </Button>
                <Button
                  data-testid="ballottype-absentee"
                  disabled={ballotType === VotingMethod.Absentee}
                  onPress={() => setBallotType(VotingMethod.Absentee)}
                >
                  Absentee
                </Button>
              </SegmentedButton>
              <p>Select precinct to enter results for:</p>
              <Select
                data-testid="selectPrecinct"
                value={currentPrecinctId}
                name="precinct"
                onChange={(e) => setCurrentPrecinctId(e.currentTarget.value)}
                onBlur={(e) => setCurrentPrecinctId(e.currentTarget.value)}
              >
                <option value="" disabled>
                  Precinct
                </option>
                {election.precincts.map((precinct) => (
                  <option key={precinct.id} value={precinct.id}>
                    {precinct.name}
                  </option>
                ))}
              </Select>
              <h3>Summary of entered data:</h3>
              <Table condensed data-testid="summary-data">
                <thead>
                  <tr>
                    <TD as="th">Precinct</TD>
                    <TD as="th" narrow>
                      Ballots Entered
                    </TD>
                  </tr>
                </thead>
                <tbody>
                  {enteredDataRows}
                  <tr>
                    <TD>
                      <strong>Total</strong>
                    </TD>
                    <TD narrow data-testid="total-ballots-entered">
                      {totalNumberBallotsEntered}
                    </TD>
                  </tr>
                </tbody>
              </Table>
              <p>
                Once you have entered data for <strong>all</strong> precincts,
                save and import the dataset.{' '}
              </p>
              <Button onPress={() => history.push(routerPaths.tally)}>
                Back to Tally
              </Button>{' '}
              <Button primary onPress={handleImportingData}>
                Save Manual Data
              </Button>
            </Prose>
          </SummaryInfo>
          <Prose maxWidth={false}>
            {currentPrecinct && (
              <React.Fragment>
                <h3>Contest Results for {currentPrecinct.name}</h3>
                {currentContests.map((contest) => {
                  let contestTitle = contest.title
                  if (contest.partyId) {
                    const party = election.parties.find(
                      (p) => p.id === contest.partyId
                    )
                    if (party) {
                      contestTitle = `${contestTitle} - ${party.fullName}`
                    }
                  }
                  const enteredNumberOfBallots = getNumericalValueForTally(
                    getValueForInput(
                      currentPrecinctId,
                      contest.id,
                      'numBallots'
                    )
                  )
                  const expectedNumberOfBallots = getExpectedNumberOfBallots(
                    currentPrecinctId,
                    contest.id
                  )
                  const invalidNumberOfBallotsWarning =
                    enteredNumberOfBallots ===
                    expectedNumberOfBallots ? null : (
                      <Text warning warningIcon small>
                        The ballots entered for this contest sum to{' '}
                        {expectedNumberOfBallots} but you have specified that
                        there were {enteredNumberOfBallots} ballots cast.
                      </Text>
                    )
                  return (
                    <ContestData key={contest.id}>
                      <h4>{contestTitle} </h4>
                      {contest.type === 'candidate' &&
                        getAllPossibleCandidatesForCandidateContest(
                          contest
                        ).map((candidate) => (
                          <React.Fragment key={candidate.id}>
                            {candidate.name}:{' '}
                            <TallyInput
                              name={`${contest.id}-${candidate.id}`}
                              data-testid={`${contest.id}-${candidate.id}`}
                              value={getValueForInput(
                                currentPrecinctId,
                                contest.id,
                                candidate.id
                              )}
                              onChange={(e) =>
                                updateContestData(contest.id, candidate.id, e)
                              }
                            />
                            <br />
                          </React.Fragment>
                        ))}
                      {contest.type === 'yesno' && (
                        <React.Fragment>
                          Yes:{' '}
                          <TallyInput
                            name={`${contest.id}-yes`}
                            data-testid={`${contest.id}-yes`}
                            value={getValueForInput(
                              currentPrecinctId,
                              contest.id,
                              'yes'
                            )}
                            onChange={(e) =>
                              updateContestData(contest.id, 'yes', e)
                            }
                          />
                          <br />
                          No:{' '}
                          <TallyInput
                            name={`${contest.id}-no`}
                            data-testid={`${contest.id}-no`}
                            value={getValueForInput(
                              currentPrecinctId,
                              contest.id,
                              'no'
                            )}
                            onChange={(e) =>
                              updateContestData(contest.id, 'no', e)
                            }
                          />
                          <br />
                        </React.Fragment>
                      )}
                      Total Ballots Cast:{' '}
                      <TallyInput
                        name={`${contest.id}-numBallots`}
                        data-testid={`${contest.id}-numBallots`}
                        value={getValueForInput(
                          currentPrecinctId,
                          contest.id,
                          'numBallots'
                        )}
                        onChange={(e) =>
                          updateContestData(contest.id, 'numBallots', e)
                        }
                      />{' '}
                      Undervotes:{' '}
                      <TallyInput
                        name={`${contest.id}-undervotes`}
                        data-testid={`${contest.id}-undervotes`}
                        value={getValueForInput(
                          currentPrecinctId,
                          contest.id,
                          'undervotes'
                        )}
                        onChange={(e) =>
                          updateContestData(contest.id, 'undervotes', e)
                        }
                      />{' '}
                      Overvotes:{' '}
                      <TallyInput
                        name={`${contest.id}-overvotes`}
                        data-testid={`${contest.id}-overvotes`}
                        value={getValueForInput(
                          currentPrecinctId,
                          contest.id,
                          'overvotes'
                        )}
                        onChange={(e) =>
                          updateContestData(contest.id, 'overvotes', e)
                        }
                      />
                      {invalidNumberOfBallotsWarning}
                    </ContestData>
                  )
                })}
              </React.Fragment>
            )}
          </Prose>
        </Columns>
      </NavigationScreen>
    </React.Fragment>
  )
}

export default ManualDataImportScreen
