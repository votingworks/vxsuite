import React, { useState } from 'react'
import { OptionalElectionDefinition } from '@votingworks/ballot-encoder'

import {
  AppMode,
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
import {
  AMERICA_TIMEZONES,
  MONTHS_SHORT,
  formatTimeZoneName,
  formatFullDateTimeZone,
  getDaysInMonth,
} from '../utils/date'
import InputGroup from '../components/InputGroup'
import Modal from '../components/Modal'

type Meridian = 'AM' | 'PM'

interface Props {
  appMode: AppMode
  appPrecinctId: string
  ballotsPrintedCount: number
  electionDefinition: OptionalElectionDefinition
  isLiveMode: boolean
  fetchElection: VoidFunction
  updateAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
}

const getMachineTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

const AdminScreen: React.FC<Props> = ({
  appMode,
  appPrecinctId,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  fetchElection,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
}) => {
  const election = electionDefinition?.election
  const changeAppPrecinctId: SelectChangeEventFunction = (event) => {
    updateAppPrecinctId(event.currentTarget.value)
  }

  const [isFetchingElection, setIsFetchingElection] = useState(false)
  const loadElection = () => {
    setIsFetchingElection(true)
    fetchElection()
  }

  const [isTestDeck, setIsTestDeck] = useState(false)
  const showTestDeck = () => setIsTestDeck(true)
  const hideTestDeck = () => setIsTestDeck(false)

  const [isSavingDate, setIsSavingDate] = useState(false)
  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false)
  const [systemDate, setSystemDate] = useState(new Date())
  const [systemMeridian, setSystemMeridan] = useState<Meridian>(
    systemDate.getHours() < 12 ? 'AM' : 'PM'
  )
  const [timezone, setTimezone] = useState(getMachineTimezone())
  const cancelSystemDateEdit = () => {
    setSystemDate(new Date())
    setTimezone(getMachineTimezone())
    setIsSystemDateModalActive(false)
  }
  const updateSystemTime: SelectChangeEventFunction = (event) => {
    const { name, value: stringValue } = event.currentTarget
    const value = parseInt(stringValue, 10)
    let hour = systemDate.getHours()
    if (name === 'hour') {
      if (systemMeridian === 'AM') {
        hour = value % 12
      } else {
        hour = (value % 12) + 12
      }
    }
    if (name === 'meridian') {
      setSystemMeridan(stringValue as Meridian)
      if (stringValue === 'AM' && systemDate.getHours() >= 12) {
        hour = systemDate.getHours() - 12
      }
      if (stringValue === 'PM' && systemDate.getHours() < 12) {
        hour = systemDate.getHours() + 12
      }
    }
    const year = name === 'year' ? value : systemDate.getFullYear()
    const month = name === 'month' ? value : systemDate.getMonth()
    const lastDayOfMonth = getDaysInMonth(year, month)
      .slice(-1)
      .pop()
      ?.getDate()
    const day = name === 'day' ? value : systemDate.getDate()
    setSystemDate(
      new Date(
        year,
        month,
        lastDayOfMonth && day > lastDayOfMonth ? lastDayOfMonth : day,
        hour,
        name === 'minute' ? value : systemDate.getMinutes()
      )
    )
  }
  const updateTimeZone: SelectChangeEventFunction = (event) => {
    setTimezone(event.currentTarget.value)
  }
  const saveDateAndZone = async () => {
    /* istanbul ignore else */
    if (timezone) {
      try {
        setIsSavingDate(true)
        await window.kiosk?.setClock({
          isoDatetime: systemDate.toISOString(),
          IANAZone: timezone,
        })
        setSystemDate(new Date())
        setTimezone(getMachineTimezone())
        setIsSystemDateModalActive(false)
      } finally {
        setIsSavingDate(false)
      }
    }
  }

  if (isTestDeck && electionDefinition) {
    return (
      <TestBallotDeckScreen
        appName={appMode.name}
        appPrecinctId={appPrecinctId}
        electionDefinition={electionDefinition}
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
                    {[...election.precincts]
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
                <h1>Current Date and Time</h1>
                <p>{formatFullDateTimeZone(systemDate, timezone)}</p>
                <p>
                  <Button onPress={() => setIsSystemDateModalActive(true)}>
                    Update Date and Time
                  </Button>
                </p>
              </React.Fragment>
            )}
            <h1>Configuration</h1>
            {election ? (
              <p>
                <Text as="span" voteIcon>
                  Election definition is loaded.
                </Text>{' '}
                <Button small onPress={unconfigure}>
                  Remove
                </Button>
              </p>
            ) : isFetchingElection ? (
              <p>Loading Election Definition from Clerk Card…</p>
            ) : (
              <React.Fragment>
                <Text warningIcon>Election definition is not Loaded.</Text>
                <p>
                  <Button onPress={loadElection}>
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
          electionDefinition && (
            <ElectionInfo
              electionDefinition={electionDefinition}
              precinctId={appPrecinctId}
              showElectionHash
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
            <h1>{formatFullDateTimeZone(systemDate)}</h1>
            <div>
              <p>
                <InputGroup as="span">
                  <Select
                    data-testid="selectYear"
                    value={systemDate.getFullYear()}
                    name="year"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                  >
                    <option value="" disabled>
                      Year
                    </option>
                    {[...Array(11).keys()].map((i) => (
                      <option key={i} value={2020 + i}>
                        {2020 + i}
                      </option>
                    ))}
                  </Select>
                  <Select
                    data-testid="selectMonth"
                    value={systemDate.getMonth()}
                    name="month"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                    style={{
                      width: '4.7rem',
                    }}
                  >
                    <option value="" disabled>
                      Month
                    </option>
                    {MONTHS_SHORT.map((month, index) => (
                      <option key={month} value={index}>
                        {month}
                      </option>
                    ))}
                  </Select>
                  <Select
                    data-testid="selectDay"
                    value={systemDate.getDate()}
                    name="day"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                    style={{
                      width: '4.15rem',
                    }}
                  >
                    <option value="" disabled>
                      Day
                    </option>
                    {getDaysInMonth(
                      systemDate.getFullYear(),
                      systemDate.getMonth()
                    ).map((day) => (
                      <option key={day.getDate()} value={day.getDate()}>
                        {day.getDate()}
                      </option>
                    ))}
                  </Select>
                </InputGroup>
              </p>
              <p>
                <InputGroup as="span">
                  <Select
                    data-testid="selectHour"
                    value={systemDate.getHours() % 12 || 12}
                    name="hour"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                    style={{
                      width: '4rem',
                    }}
                  >
                    <option value="" disabled>
                      Hour
                    </option>
                    {[...Array(12).keys()].map((hour) => (
                      <option key={hour} value={hour + 1}>
                        {hour + 1}
                      </option>
                    ))}
                  </Select>
                  <Select
                    data-testid="selectMinute"
                    value={systemDate.getMinutes()}
                    name="minute"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                    style={{
                      width: '4.15rem',
                    }}
                  >
                    <option value="" disabled>
                      Minute
                    </option>
                    {[...Array(60).keys()].map((minute) => (
                      <option key={minute} value={minute}>
                        {minute < 10 ? `0${minute}` : minute}
                      </option>
                    ))}
                  </Select>
                  <Select
                    data-testid="selectMeridian"
                    value={systemMeridian}
                    name="meridian"
                    disabled={isSavingDate}
                    onBlur={updateSystemTime}
                    onChange={updateSystemTime}
                    style={{
                      width: '4.5rem',
                    }}
                  >
                    {['AM', 'PM'].map((meridian) => (
                      <option key={meridian} value={meridian}>
                        {meridian}
                      </option>
                    ))}
                  </Select>
                </InputGroup>
              </p>
              <p>
                <InputGroup as="span">
                  <Select
                    data-testid="selectTimezone"
                    value={timezone}
                    disabled={isSavingDate}
                    onBlur={updateTimeZone}
                    onChange={updateTimeZone}
                  >
                    <option value="UTC" disabled>
                      Select timezone…
                    </option>
                    {AMERICA_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {formatTimeZoneName(systemDate, tz)} (
                        {tz.split('/')[1].replace(/_/gi, ' ')})
                      </option>
                    ))}
                  </Select>
                </InputGroup>
              </p>
            </div>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button
              disabled={!timezone || isSavingDate}
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

export default AdminScreen
