import React from 'react'
import pluralize from 'pluralize'

import { BallotStyle, OptionalElection } from '../config/types'

import { compareName } from '../utils/sort'
import Button from '../components/Button'
import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Select from '../components/Select'
import Text from '../components/Text'
import { formatFullDateTimeZone } from '../utils/date'

interface Props {
  election: OptionalElection
  fetchElection: () => void
  getBallotStylesByPreinctId: (id: string) => BallotStyle[]
  isLoadingElection: boolean
  partyId: string
  partyName: string
  precinctId: string
  precinctName: string
  setParty: (id: string) => void
  setPrecinct: (id: string) => void
  unconfigure: () => void
  isSinglePrecinctMode: boolean
  setIsSinglePrecinctMode: (enabled: boolean) => void
  precinctBallotStyles: BallotStyle[]
}

const getMachineTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

const AdminScreen: React.FC<Props> = ({
  election,
  fetchElection,
  getBallotStylesByPreinctId,
  isLoadingElection,
  isSinglePrecinctMode,
  partyId,
  partyName,
  precinctId,
  precinctName,
  precinctBallotStyles,
  setParty,
  setPrecinct,
  setIsSinglePrecinctMode,
  unconfigure,
}) => {
  const precincts = election ? [...election.precincts].sort(compareName) : []
  const parties = election ? [...election.parties].sort(compareName) : []
  const onChangeParty = (event: React.FormEvent<HTMLSelectElement>) => {
    setParty(event.currentTarget.value)
  }
  const onChangePrecinct = (event: React.FormEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget
    setPrecinct(value)
    setIsSinglePrecinctMode(!!value)
  }
  const reset = () => {
    setPrecinct('')
    setParty('')
    setIsSinglePrecinctMode(false)
  }
  const ballotStyles = partyId
    ? precinctBallotStyles.filter((bs) => bs.partyId === partyId)
    : precinctBallotStyles
  const ballotStylesCount = ballotStyles.length
  const ballotStylesIds = ballotStyles.map((bs) => bs.id).join(', ')
  return (
    <Screen>
      <Main>
        <MainChild>
          <Prose>
            <p>Remove card when finished making changes.</p>
            {election && (
              <React.Fragment>
                <h1>Single Precinct Mode</h1>
                <p>Select a precinct. Optionally, select a party.</p>
                <Select
                  small
                  block={false}
                  value={precinctId}
                  onChange={onChangePrecinct}
                  onBlur={onChangePrecinct}
                >
                  <option value="">All precincts</option>
                  {precincts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({getBallotStylesByPreinctId(p.id).length})
                    </option>
                  ))}
                </Select>{' '}
                <Select
                  small
                  block={false}
                  disabled={!precinctId}
                  value={partyId}
                  onChange={onChangeParty}
                  onBlur={onChangeParty}
                >
                  <option value="">All parties</option>
                  {parties.map((p) => {
                    const partyLength = precinctBallotStyles.filter(
                      (bs) => bs.partyId === p.id
                    ).length
                    return (
                      <option key={p.id} value={p.id} disabled={!partyLength}>
                        {p.name} ({partyLength})
                      </option>
                    )
                  })}
                </Select>{' '}
                <Button small disabled={!precinctId} onPress={reset}>
                  Reset
                </Button>
                {isSinglePrecinctMode ? (
                  <p>
                    {`${precinctName} has ${ballotStylesCount} ballot ${pluralize(
                      'style',
                      ballotStylesCount
                    )}${
                      partyName && ` for the ${partyName} party`
                    }: ${ballotStylesIds}.`}
                  </p>
                ) : (
                  <p>
                    <em>Single Precinct Mode is disabled.</em>
                  </p>
                )}
                <h1>Current Date and Time</h1>
                <p>
                  {formatFullDateTimeZone(new Date(), getMachineTimezone())}
                </p>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {isLoadingElection ? (
              <p>Loading Election Definition from Admin Card…</p>
            ) : election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition is loaded.
                </Text>{' '}
                <Button small onPress={unconfigure}>
                  Remove
                </Button>
              </p>
            ) : (
              <React.Fragment>
                <Text warningIcon>Election definition is not Loaded.</Text>
                <p>
                  <Button onPress={fetchElection}>
                    Load Election Definition
                  </Button>
                </p>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav title="Admin Actions" />
    </Screen>
  )
}

export default AdminScreen
