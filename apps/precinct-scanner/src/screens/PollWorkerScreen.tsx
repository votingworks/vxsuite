import { strict as assert } from 'assert'
import React, { useContext, useEffect, useState } from 'react'
import makeDebug from 'debug'
import useInterval from '@rooks/use-interval'

import {
  Button,
  Prose,
  Loading,
  PrecinctScannerPollsReport,
  PrecinctSelectionKind,
  PrecinctSelection,
  PrecinctScannerTallyReport,
  UsbDrive,
} from '@votingworks/ui'
import {
  calculateTallyForCastVoteRecords,
  format,
  PrecinctScannerCardTally,
  Printer,
  serializeTally,
  TallySourceMachineType,
} from '@votingworks/utils'
import { CastVoteRecord, Tally, VotingMethod } from '@votingworks/types'
import pluralize from 'pluralize'
import { POLLING_INTERVAL_FOR_TOTP } from '../config/globals'
import { CenteredScreen } from '../components/Layout'
import { Absolute } from '../components/Absolute'
import { Bar } from '../components/Bar'
import ExportResultsModal from '../components/ExportResultsModal'
import Modal from '../components/Modal'

import AppContext from '../contexts/AppContext'

const debug = makeDebug('precinct-scanner:pollworker-screen')
const reportPurposes = ['Publicly Posted', 'Officially Filed']

interface Props {
  scannedBallotCount: number
  isPollsOpen: boolean
  isLiveMode: boolean
  togglePollsOpen: () => void
  getCVRsFromExport: () => Promise<CastVoteRecord[]>
  saveTallyToCard: (cardTally: PrecinctScannerCardTally) => Promise<void>
  printer: Printer
  hasPrinterAttached: boolean
  usbDrive: UsbDrive
}

const PollWorkerScreen = ({
  scannedBallotCount,
  isPollsOpen,
  togglePollsOpen,
  getCVRsFromExport,
  saveTallyToCard,
  isLiveMode,
  hasPrinterAttached: printerFromProps,
  printer,
  usbDrive,
}: Props): JSX.Element => {
  const { electionDefinition, currentPrecinctId, machineConfig } = useContext(
    AppContext
  )
  assert(electionDefinition)
  const [isHandlingTallyReport, setIsHandlingTallyReport] = useState(false)
  const [currentTally, setCurrentTally] = useState<Tally>()
  const [systemAuthenticationCode, setSystemAuthenticationCode] = useState(
    '---·---'
  )
  const [isExportingResults, setIsExportingResults] = useState(false)
  const hasPrinterAttached = printerFromProps || !window.kiosk
  const { election } = electionDefinition

  useEffect(() => {
    const calculateTally = async () => {
      const castVoteRecords = await getCVRsFromExport()
      const tally = calculateTallyForCastVoteRecords(
        election,
        new Set(castVoteRecords)
      )
      if (castVoteRecords.length !== scannedBallotCount) {
        debug(
          `Warning, ballots scanned count from status endpoint (${scannedBallotCount}) does not match number of CVRs (${castVoteRecords.length}) `
        )
      }
      if (tally.numberOfBallotsCounted !== castVoteRecords.length) {
        debug(
          `Warning, ballot count from calculated tally (${tally.numberOfBallotsCounted}) does not match number of CVRs (${castVoteRecords.length}) `
        )
      }
      setCurrentTally(tally)
    }
    void calculateTally()
  }, [election, getCVRsFromExport, scannedBallotCount])

  useInterval(
    async () => {
      const totpResult = await window.kiosk?.totp?.get()
      if (totpResult) {
        const codeChunks = totpResult.code.match(/.{1,3}/g)
        if (codeChunks) setSystemAuthenticationCode(codeChunks.join('·'))
      }
    },
    POLLING_INTERVAL_FOR_TOTP,
    true
  )

  const saveTally = async () => {
    assert(currentTally)
    const serializedTally = serializeTally(election, currentTally)
    await saveTallyToCard({
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: scannedBallotCount,
      isLiveMode,
      isPollsOpen: !isPollsOpen, // When we are saving we are about to either open or close polls and want the state to reflect what it will be after that is complete.
      tally: serializedTally,
      absenteeBallots:
        currentTally.ballotCountsByVotingMethod[VotingMethod.Absentee] ?? 0,
      precinctBallots:
        currentTally.ballotCountsByVotingMethod[VotingMethod.Precinct] ?? 0,
      metadata: [
        {
          machineId: machineConfig.machineId,
          timeSaved: Date.now(),
          ballotCount: scannedBallotCount,
        },
      ],
    })
  }

  const printTallyReport = async () => {
    await printer.print({ sides: 'one-sided' })
  }

  const precinct = election.precincts.find((p) => p.id === currentPrecinctId)

  const [confirmOpenPolls, setConfirmOpenPolls] = useState(false)
  const openConfirmOpenPollsModal = () => setConfirmOpenPolls(true)
  const closeConfirmOpenPollsModal = () => setConfirmOpenPolls(false)
  const openPollsAndHandleZeroReport = async () => {
    setIsHandlingTallyReport(true)
    if (hasPrinterAttached) {
      await printTallyReport()
    } else {
      await saveTally()
    }
    togglePollsOpen()
    setIsHandlingTallyReport(false)
    closeConfirmOpenPollsModal()
  }

  const [confirmClosePolls, setConfirmClosePolls] = useState(false)
  const openConfirmClosePollsModal = () => setConfirmClosePolls(true)
  const closeConfirmClosePollsModal = () => setConfirmClosePolls(false)
  const closePollsAndHandleTabulationReport = async () => {
    setIsHandlingTallyReport(true)
    if (hasPrinterAttached) {
      await printTallyReport()
    } else {
      await saveTally()
    }
    togglePollsOpen()
    setIsHandlingTallyReport(false)
    closeConfirmClosePollsModal()
  }

  const precinctName = precinct === undefined ? 'All Precincts' : precinct.name
  const precinctSelection: PrecinctSelection =
    precinct === undefined
      ? { kind: PrecinctSelectionKind.AllPrecincts }
      : {
          kind: PrecinctSelectionKind.SinglePrecinct,
          precinctId: precinct.id,
        }
  const currentDateTime = new Date().toLocaleString()

  return (
    <React.Fragment>
      <CenteredScreen infoBarMode="pollworker">
        <Prose textCenter>
          <h1>Poll Worker Actions</h1>
          <p>
            {isPollsOpen ? (
              <Button large onPress={openConfirmClosePollsModal}>
                Close Polls for {precinctName}
              </Button>
            ) : (
              <Button large onPress={openConfirmOpenPollsModal}>
                Open Polls for {precinctName}
              </Button>
            )}
          </p>
          {!isPollsOpen && scannedBallotCount > 0 && (
            <p>
              <Button onPress={() => setIsExportingResults(true)}>
                Export Results to USB
              </Button>
            </p>
          )}
          <p>System Authentication Code: {systemAuthenticationCode}</p>
        </Prose>
        <Absolute top left>
          <Bar>
            <div>
              Ballots Scanned:{' '}
              <strong data-testid="ballot-count">
                {format.count(scannedBallotCount)}
              </strong>{' '}
            </div>
          </Bar>
        </Absolute>
        {(confirmOpenPolls || confirmClosePolls) && !currentTally && (
          <Modal content={<Loading>Loading Tally</Loading>} />
        )}
        {confirmOpenPolls && currentTally && !isHandlingTallyReport && (
          <Modal
            content={
              hasPrinterAttached ? (
                <Prose>
                  <h1>Print Zero Report?</h1>
                  <p>
                    When opening polls,{' '}
                    {pluralize('report', reportPurposes.length, true)} will be
                    printed. Check that all tallies and ballot counts are zero.
                  </p>
                </Prose>
              ) : (
                <Prose>
                  <h1>Save Zero Report?</h1>
                  <p>
                    The <strong>Zero Report</strong> will be saved on the
                    currently inserted poll worker card. After the report is
                    saved on the card, insert the card into VxMark to print this
                    report.
                  </p>
                </Prose>
              )
            }
            actions={
              <React.Fragment>
                <Button onPress={openPollsAndHandleZeroReport} primary>
                  {hasPrinterAttached ? 'Print' : 'Save'} Report and Open Polls
                </Button>
                <Button onPress={closeConfirmOpenPollsModal}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {confirmClosePolls && currentTally && !isHandlingTallyReport && (
          <Modal
            content={
              hasPrinterAttached ? (
                <Prose>
                  <h1>Print Tabulation Report?</h1>
                  <p>
                    When closing polls,{' '}
                    {pluralize('report', reportPurposes.length, true)} will be
                    printed.
                  </p>
                </Prose>
              ) : (
                <Prose>
                  <h1>Save Tabulation Report?</h1>
                  <p>
                    The <strong>Tabulation Report</strong> will be saved on the
                    currently inserted poll worker card. After the report is
                    saved on the card, insert the card into VxMark to print this
                    report.
                  </p>
                </Prose>
              )
            }
            actions={
              <React.Fragment>
                <Button onPress={closePollsAndHandleTabulationReport} primary>
                  {hasPrinterAttached ? 'Print' : 'Save'} Report and Close Polls
                </Button>
                <Button onPress={closeConfirmClosePollsModal}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {isHandlingTallyReport && (
          <Modal
            content={
              <Loading>
                {hasPrinterAttached
                  ? 'Printing Tally Report'
                  : 'Saving to Card'}
              </Loading>
            }
          />
        )}
        {isExportingResults && (
          <ExportResultsModal
            onClose={() => setIsExportingResults(false)}
            usbDrive={usbDrive}
            isTestMode={!isLiveMode}
            scannedBallotCount={scannedBallotCount}
          />
        )}
      </CenteredScreen>
      {currentTally &&
        reportPurposes.map((reportPurpose) => {
          return (
            <React.Fragment key={reportPurpose}>
              <PrecinctScannerPollsReport
                ballotCount={scannedBallotCount}
                currentDateTime={currentDateTime}
                election={election}
                isLiveMode={isLiveMode}
                isPollsOpen={!isPollsOpen} // When we print the report we are about to change the polls status and want to reflect the new status
                machineId={machineConfig.machineId}
                precinctSelection={precinctSelection}
                reportPurpose={reportPurpose}
              />
              <PrecinctScannerTallyReport
                electionDefinition={electionDefinition}
                machineId={machineConfig.machineId}
                tally={currentTally}
                precinctSelection={precinctSelection}
                reportPurpose={reportPurpose}
                isPollsOpen={!isPollsOpen}
                isLiveMode={isLiveMode}
                currentDateTime={currentDateTime}
              />
            </React.Fragment>
          )
        })}
    </React.Fragment>
  )
}

export default PollWorkerScreen
