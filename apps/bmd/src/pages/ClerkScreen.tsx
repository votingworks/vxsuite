import React, { useState } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'

import {
  AppMode,
  InputChangeEventFunction,
  SelectChangeEventFunction,
  VoidFunction,
} from '../config/types'

import TestBallotDeckScreen from './TestBallotDeckScreen'

import Button, { SegmentedButton } from '../components/Button'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import Sidebar from '../components/Sidebar'
import ElectionInfo from '../components/ElectionInfo'
import Screen from '../components/Screen'
import Select from '../components/Select'
import TextInput from '../components/TextInput'
import {
  twelveHourTime,
  weekdayAndDate,
  inputDate,
  inputTime,
} from '../utils/date'
import { AMERICA_TIMEZONES } from '../config/globals'
import InputGroup from '../components/InputGroup'
import Modal from '../components/Modal'

interface Props {
  appMode: AppMode
  appPrecinctId: string
  ballotsPrintedCount: number
  election: OptionalElection
  isLiveMode: boolean
  fetchElection: VoidFunction
  isFetchingElection: boolean
  setAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
}

const getMachineTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone
const getLabelByIANAZone = (IANAZone: string) =>
  AMERICA_TIMEZONES.find((tz) => tz.IANAZone === IANAZone)?.label || ''
const getIANAZoneByLabel = (label: string) =>
  AMERICA_TIMEZONES.find((tz) => tz.label === label)?.IANAZone || 'unknown'

const ClerkScreen = ({
  appMode,
  appPrecinctId,
  ballotsPrintedCount,
  election,
  isLiveMode,
  fetchElection,
  isFetchingElection,
  setAppPrecinctId,
  toggleLiveMode,
  unconfigure,
}: Props) => {
  const changeAppPrecinctId: SelectChangeEventFunction = (event) => {
    setAppPrecinctId(event.currentTarget.value)
  }

  const [isTestDeck, setIsTestDeck] = useState(false)
  const showTestDeck = () => setIsTestDeck(true)
  const hideTestDeck = () => setIsTestDeck(false)

  const [isSavingDate, setIsSavingDate] = useState(false)
  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false)
  const [systemDate, setSystemDate] = useState(new Date())
  const [systemTimezoneLabel, setSystemTimezoneLabel] = useState(
    getLabelByIANAZone(getMachineTimezone())
  )
  const cancelSystemDateEdit = () => {
    setSystemDate(new Date())
    setSystemTimezoneLabel(getLabelByIANAZone(getMachineTimezone()))
    setIsSystemDateModalActive(false)
  }
  const updateSystemDate: InputChangeEventFunction = (event) => {
    const datePart = new Date(event.currentTarget.value)
    setSystemDate(
      new Date(
        datePart.getFullYear(),
        datePart.getMonth(),
        datePart.getDate(),
        systemDate.getHours(),
        systemDate.getMinutes()
      )
    )
  }
  const updateSystemTime: InputChangeEventFunction = (event) => {
    const [hours, minutes] = event.currentTarget.value.split(':')
    setSystemDate(
      new Date(
        systemDate.getFullYear(),
        systemDate.getMonth(),
        systemDate.getDate(),
        parseInt(hours, 10),
        parseInt(minutes, 10)
      )
    )
  }
  const updateTimeZone: SelectChangeEventFunction = (event) => {
    setSystemTimezoneLabel(event.currentTarget.value)
  }
  const saveDateAndZone = async () => {
    setIsSavingDate(true)
    try {
      await window.kiosk?.setClock({
        isoDatetime: systemDate.toISOString(),
        IANAZone: getIANAZoneByLabel(systemTimezoneLabel),
      })
      setIsSavingDate(false)
      setIsSystemDateModalActive(false)
    } catch (error) {
      setIsSavingDate(false)
    }
  }

  if (isTestDeck && election) {
    return (
      <TestBallotDeckScreen
        appName={appMode.name}
        appPrecinctId={appPrecinctId}
        election={election}
        hideTestDeck={hideTestDeck}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }

  const isTestDecksAvailable = !isLiveMode && appMode.isVxPrint
  return (
    <Screen flexDirection="row-reverse" voterMode={false}>
      <Main padded>
        <MainChild maxWidth={false}>
          <Prose>
            {election && (
              <React.Fragment>
                <h1>
                  <label htmlFor="selectPrecinct">Precinct</label>
                </h1>
                <p>
                  <Select
                    id="selectPrecinct"
                    value={appPrecinctId}
                    onBlur={changeAppPrecinctId}
                    onChange={changeAppPrecinctId}
                  >
                    <option value="" disabled>
                      Select a precinct for this device…
                    </option>
                    {election.precincts
                      .sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, {
                          ignorePunctuation: true,
                        })
                      )
                      .map((precinct) => (
                        <option key={precinct.id} value={precinct.id}>
                          {precinct.name}
                        </option>
                      ))}
                  </Select>
                </p>
                <h1>Testing Mode</h1>
                <p>
                  <SegmentedButton>
                    <Button
                      onPress={toggleLiveMode}
                      primary={!isLiveMode}
                      disabled={!isLiveMode}
                    >
                      Testing Mode
                    </Button>
                    <Button
                      onPress={toggleLiveMode}
                      primary={isLiveMode}
                      disabled={isLiveMode}
                    >
                      Live Election Mode
                    </Button>
                  </SegmentedButton>
                </p>
                {appMode.isVxPrint && (
                  <React.Fragment>
                    <p>
                      <Button
                        small
                        disabled={!isTestDecksAvailable}
                        onPress={showTestDeck}
                      >
                        View Test Ballot Decks
                      </Button>{' '}
                      {isLiveMode && (
                        <Text as="small" muted>
                          (Available in testing mode)
                        </Text>
                      )}
                    </p>
                    <Text as="h1">Stats</Text>
                    <Text>
                      Printed and Tallied Ballots:{' '}
                      <strong>{ballotsPrintedCount}</strong>{' '}
                    </Text>
                  </React.Fragment>
                )}
                <h1>Current Time, Date, and Timezone</h1>
                <p>
                  Time: <strong>{twelveHourTime(systemDate.toString())}</strong>
                  <br />
                  Date: <strong>{weekdayAndDate(systemDate.toString())}</strong>
                  <br />
                  Timezone: <strong>{systemTimezoneLabel || 'unknown'}</strong>
                </p>
                <p>
                  <Button onPress={() => setIsSystemDateModalActive(true)}>
                    Update Time, Date, and Timezone
                  </Button>
                </p>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {isFetchingElection ? (
              <p>Loading Election Definition from Clerk Card…</p>
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
      <Sidebar
        appName={election ? appMode.name : ''}
        centerContent
        title="Election Admin Actions"
        footer={
          election && (
            <ElectionInfo
              election={election}
              precinctId={appPrecinctId}
              horizontal
            />
          )
        }
      >
        {election && (
          <Prose>
            <h2>Instructions</h2>
            <p>
              Switching Precinct or Live Mode will reset tally and printed
              ballots count.
            </p>
            <p>Remove card when finished.</p>
          </Prose>
        )}
      </Sidebar>
      <Modal
        isOpen={isSystemDateModalActive}
        centerContent
        content={
          <Prose textCenter>
            <h1>
              {twelveHourTime(systemDate.toString())},{' '}
              {weekdayAndDate(systemDate.toString())}
            </h1>
            <div>
              <InputGroup>
                <TextInput
                  type="time"
                  value={inputTime(systemDate)}
                  disabled={isSavingDate}
                  onChange={updateSystemTime}
                />
                <TextInput
                  type="date"
                  min="2020-10-01"
                  value={inputDate(systemDate)}
                  disabled={isSavingDate}
                  onChange={updateSystemDate}
                />
                <Select
                  id="datetime"
                  value={systemTimezoneLabel}
                  onBlur={updateTimeZone}
                  disabled={isSavingDate}
                  onChange={updateTimeZone}
                >
                  <option value="" disabled>
                    Select timezone…
                  </option>
                  {AMERICA_TIMEZONES.map((timezone) => (
                    <option key={timezone.label} value={timezone.label}>
                      {timezone.label}
                    </option>
                  ))}
                </Select>
              </InputGroup>
            </div>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button
              disabled={!systemTimezoneLabel || isSavingDate}
              primary={!isSavingDate}
              onPress={saveDateAndZone}
            >
              {isSavingDate ? 'Saving…' : 'Save'}
            </Button>
            <Button disabled={isSavingDate} onPress={cancelSystemDateEdit}>
              Cancel
            </Button>
          </React.Fragment>
        }
      />
    </Screen>
  )
}

export default ClerkScreen
