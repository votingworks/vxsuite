/* istanbul ignore file */
import React, { useCallback, useState, useContext } from 'react'
import { Button, Prose, SegmentedButton, Select } from '@votingworks/ui'
import { SelectChangeEventFunction } from '@votingworks/types'
import { DateTime } from 'luxon'
import { formatFullDateTimeZone } from '@votingworks/utils'
import { CenteredScreen } from '../components/Layout'
import useNow from '../hooks/useNow'
import PickDateTimeModal from '../components/PickDateTimeModal'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import Modal from '../components/Modal'
import CalibrateScannerModal from '../components/CalibrateScannerModal'
import AppContext from '../contexts/AppContext'

interface Props {
  ballotsScannedCount: number
  isLiveMode: boolean
  updateAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
  calibrate(): Promise<boolean>
}

const AdminScreen: React.FC<Props> = ({
  ballotsScannedCount,
  isLiveMode,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  calibrate,
}) => {
  const { electionDefinition, currentPrecinctId } = useContext(AppContext)
  const { election } = electionDefinition!

  const systemDate = useNow()
  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false)
  const [isSettingClock, setIsSettingClock] = useState(false)

  const setClock = useCallback(
    async (date: DateTime) => {
      setIsSettingClock(true)
      try {
        await window.kiosk?.setClock({
          isoDatetime: date.toISO(),
          IANAZone: date.zoneName,
        })
        setIsSystemDateModalActive(false)
      } finally {
        setIsSettingClock(false)
      }
    },
    [setIsSettingClock, setIsSystemDateModalActive]
  )

  const [confirmUnconfigure, setConfirmUnconfigure] = useState(false)
  const openConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(true),
    []
  )
  const closeConfirmUnconfigureModal = useCallback(
    () => setConfirmUnconfigure(false),
    []
  )

  const [isCalibratingScanner, setIsCalibratingScanner] = useState(false)
  const openCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(true),
    []
  )
  const closeCalibrateScannerModal = useCallback(
    () => setIsCalibratingScanner(false),
    []
  )

  const changeAppPrecinctId: SelectChangeEventFunction = (event) => {
    updateAppPrecinctId(event.currentTarget.value)
  }

  return (
    <CenteredScreen infoBarMode="admin">
      <Prose textCenter>
        <h1>Administrator Settings</h1>
        <p>
          <Select
            id="selectPrecinct"
            value={currentPrecinctId}
            onBlur={changeAppPrecinctId}
            onChange={changeAppPrecinctId}
            large
          >
            <option value="" disabled>
              Select precinct…
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
        <p>
          <SegmentedButton>
            <Button large onPress={toggleLiveMode} disabled={!isLiveMode}>
              Testing Mode
            </Button>
            <Button large onPress={toggleLiveMode} disabled={isLiveMode}>
              Live Election Mode
            </Button>
          </SegmentedButton>
        </p>
        <p>
          <Button large onPress={() => setIsSystemDateModalActive(true)}>
            <span role="img" aria-label="Clock">
              🕓
            </span>{' '}
            {formatFullDateTimeZone(systemDate, { includeTimezone: true })}
          </Button>
        </p>
        <p>
          <Button onPress={openCalibrateScannerModal}>Calibrate Scanner</Button>
        </p>
        <p>
          <Button danger small onPress={openConfirmUnconfigureModal}>
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Unconfigure Machine
          </Button>
        </p>
      </Prose>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned:{' '}
            <strong data-testid="ballot-count">{ballotsScannedCount}</strong>{' '}
          </div>
        </Bar>
      </Absolute>
      {isSystemDateModalActive && (
        <PickDateTimeModal
          disabled={isSettingClock}
          onCancel={() => setIsSystemDateModalActive(false)}
          onSave={setClock}
          saveLabel={isSettingClock ? 'Saving…' : 'Save'}
          value={systemDate}
        />
      )}
      {confirmUnconfigure && (
        <Modal
          content={
            <Prose>
              <h1>Unconfigure Machine?</h1>
              <p>
                Do you want to remove all election information and data from
                this machine?
              </p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button danger onPress={unconfigure}>
                Unconfigure
              </Button>
              <Button onPress={closeConfirmUnconfigureModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeConfirmUnconfigureModal}
        />
      )}
      {isCalibratingScanner && (
        <CalibrateScannerModal
          onCalibrate={calibrate}
          onCancel={closeCalibrateScannerModal}
        />
      )}
    </CenteredScreen>
  )
}

export default AdminScreen
