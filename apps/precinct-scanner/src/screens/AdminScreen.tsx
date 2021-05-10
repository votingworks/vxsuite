import React, { useCallback, useState, useContext } from 'react'
import {
  Button,
  Loading,
  Prose,
  SegmentedButton,
  Select,
} from '@votingworks/ui'
import { SelectChangeEventFunction } from '@votingworks/types'

import { DateTime } from 'luxon'
import { formatFullDateTimeZone, usbstick } from '@votingworks/utils'
import { CenteredScreen } from '../components/Layout'
import useNow from '../hooks/useNow'
import PickDateTimeModal from '../components/PickDateTimeModal'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import Modal from '../components/Modal'
import CalibrateScannerModal from '../components/CalibrateScannerModal'
import AppContext from '../contexts/AppContext'
import ExportResultsModal from '../components/ExportResultsModal'

interface Props {
  scannedBallotCount: number
  isTestMode: boolean
  updateAppPrecinctId: (appPrecinctId: string) => void
  toggleLiveMode: VoidFunction
  unconfigure: VoidFunction
  calibrate(): Promise<boolean>
  usbDriveStatus: usbstick.UsbDriveStatus
  usbDriveEject: () => void
}

const AdminScreen: React.FC<Props> = ({
  scannedBallotCount,
  isTestMode,
  updateAppPrecinctId,
  toggleLiveMode,
  unconfigure,
  calibrate,
  usbDriveStatus,
  usbDriveEject,
}) => {
  const { electionDefinition, currentPrecinctId } = useContext(AppContext)
  const { election } = electionDefinition!

  const systemDate = useNow()
  const [isSystemDateModalActive, setIsSystemDateModalActive] = useState(false)
  const [isSettingClock, setIsSettingClock] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExportingResults, setIsExportingResults] = useState(false)

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

  const changeAppPrecinctId: SelectChangeEventFunction = async (event) => {
    await updateAppPrecinctId(event.currentTarget.value)
  }

  const handleTogglingLiveMode = async () => {
    setIsLoading(true)
    await toggleLiveMode()
    setIsLoading(false)
  }

  const handleUnconfigure = async () => {
    setIsLoading(true)
    await unconfigure()
  }

  return (
    <CenteredScreen infoBarMode="admin">
      <Prose textCenter>
        <h1>Administrator Settings</h1>
        <p>
          <Select
            id="selectPrecinct"
            data-testid="selectPrecinct"
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
            <Button
              large
              onPress={handleTogglingLiveMode}
              disabled={isTestMode}
            >
              Testing Mode
            </Button>
            <Button
              large
              onPress={handleTogglingLiveMode}
              disabled={!isTestMode}
            >
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
          <Button onPress={() => setIsExportingResults(true)}>
            Export Results to USB
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
            <strong data-testid="ballot-count">{scannedBallotCount}</strong>{' '}
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
              <Button danger onPress={handleUnconfigure}>
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
      {isLoading && <Modal content={<Loading />} />}
      {isExportingResults && (
        <ExportResultsModal
          onClose={() => setIsExportingResults(false)}
          usbDriveStatus={usbDriveStatus}
          usbDriveEject={usbDriveEject}
          isTestMode={isTestMode}
          scannedBallotCount={scannedBallotCount}
        />
      )}
    </CenteredScreen>
  )
}

export default AdminScreen
