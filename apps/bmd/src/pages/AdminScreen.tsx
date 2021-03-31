import { DateTime } from 'luxon'
import React, { useCallback, useState } from 'react'

import { OptionalElectionDefinition } from '@votingworks/types'
import { MachineConfig, SelectChangeEventFunction } from '../config/types'

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
import VersionsData from '../components/VersionsData'

type Meridian = 'AM' | 'PM'

interface Props {
  appPrecinctId: string
  ballotsPrintedCount: number
  electionDefinition: OptionalElectionDefinition
  isLiveMode: boolean
  fetchElection: VoidFunction
  updateAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
  machineConfig: MachineConfig
}

const AdminScreen: React.FC<Props> = ({
  appPrecinctId,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  fetchElection,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  machineConfig,
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
  const [systemDate, setSystemDate] = useState(DateTime.local())
  const [systemMeridian, setSystemMeridan] = useState<Meridian>(
    systemDate.hour < 12 ? 'AM' : 'PM'
  )
  const cancelSystemDateEdit = () => {
    setSystemDate(DateTime.local())
    setIsSystemDateModalActive(false)
  }
  const updateSystemTime: SelectChangeEventFunction = (event) => {
    const { name, value: stringValue } = event.currentTarget
    const value = parseInt(stringValue, 10)
    let { hour } = systemDate
    if (name === 'hour') {
      if (systemMeridian === 'AM') {
        hour = value % 12
      } else {
        hour = (value % 12) + 12
      }
    }
    if (name === 'meridian') {
      setSystemMeridan(stringValue as Meridian)
      if (stringValue === 'AM' && systemDate.hour >= 12) {
        hour = systemDate.hour - 12
      }
      if (stringValue === 'PM' && systemDate.hour < 12) {
        hour = systemDate.hour + 12
      }
    }
    const year = name === 'year' ? value : systemDate.year
    const month = name === 'month' ? value : systemDate.month
    const lastDayOfMonth = getDaysInMonth(year, month).slice(-1).pop()?.day
    const day = name === 'day' ? value : systemDate.day
    setSystemDate(
      DateTime.fromObject({
        year,
        month,
        day: lastDayOfMonth && day > lastDayOfMonth ? lastDayOfMonth : day,
        hour,
        minute: name === 'minute' ? value : systemDate.minute,
        zone: systemDate.zone,
      })
    )
  }
  const updateTimeZone: SelectChangeEventFunction = useCallback(
    (event) => {
      setSystemDate(
        DateTime.fromObject({
          year: systemDate.year,
          month: systemDate.month,
          day: systemDate.day,
          hour: systemDate.hour,
          minute: systemDate.minute,
          second: systemDate.second,
          zone: event.currentTarget.value,
        })
      )
    },
    [systemDate]
  )
  const saveDateAndZone = async () => {
    try {
      setIsSavingDate(true)
      await window.kiosk?.setClock({
        isoDatetime: systemDate.toISO(),
        IANAZone: systemDate.zoneName,
      })
      setSystemDate(DateTime.local())
      setIsSystemDateModalActive(false)
    } finally {
      setIsSavingDate(false)
    }
  }

  if (isTestDeck && electionDefinition) {
    return (
      <TestBallotDeckScreen
        appPrecinctId={appPrecinctId}
        electionDefinition={electionDefinition}
        hideTestDeck={hideTestDeck}
        machineConfig={machineConfig}
        isLiveMode={false} // always false for Test Mode
      />
    )
  }

  const isTestDecksAvailable = !isLiveMode && machineConfig.appMode.isVxPrint
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
                {machineConfig.appMode.isVxPrint && (
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
                <p>{formatFullDateTimeZone(systemDate, true)}</p>
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
        appName={election ? machineConfig.appMode.name : ''}
        centerContent
        title="Election Admin Actions"
        footer={
          <React.Fragment>
            {electionDefinition && (
              <ElectionInfo
                electionDefinition={electionDefinition}
                precinctId={appPrecinctId}
                horizontal
              />
            )}
            <VersionsData
              machineConfig={machineConfig}
              electionHash={electionDefinition?.electionHash}
            />
          </React.Fragment>
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
      {isSystemDateModalActive && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>{formatFullDateTimeZone(systemDate)}</h1>
              <div>
                <p>
                  <InputGroup as="span">
                    <Select
                      data-testid="selectYear"
                      value={systemDate.year}
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
                      value={systemDate.month}
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
                        <option key={month} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </Select>
                    <Select
                      data-testid="selectDay"
                      value={systemDate.day}
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
                      {getDaysInMonth(systemDate.year, systemDate.month).map(
                        ({ day }) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        )
                      )}
                    </Select>
                  </InputGroup>
                </p>
                <p>
                  <InputGroup as="span">
                    <Select
                      data-testid="selectHour"
                      value={systemDate.hour % 12 || 12}
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
                      value={systemDate.minute}
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
                      value={systemDate.zoneName}
                      disabled={isSavingDate}
                      onBlur={updateTimeZone}
                      onChange={updateTimeZone}
                    >
                      <option value="UTC" disabled>
                        Select timezone…
                      </option>
                      {AMERICA_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                          {formatTimeZoneName(
                            DateTime.fromISO(systemDate.toISO(), { zone: tz })
                          )}{' '}
                          ({tz.split('/')[1].replace(/_/gi, ' ')})
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
                disabled={isSavingDate}
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
      )}
    </Screen>
  )
}

export default AdminScreen
