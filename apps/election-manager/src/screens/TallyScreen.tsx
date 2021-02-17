import React, { useContext, useState, useEffect } from 'react'
import moment from 'moment'

import {
  TallyCategory,
  InputEventFunction,
  ResultsFileType,
  Optional,
} from '../config/types'

import * as format from '../utils/format'

import AppContext from '../contexts/AppContext'
import ConverterClient from '../lib/ConverterClient'
import {
  convertSEMSFileToExternalTally,
  getPrecinctIdsInExternalTally,
} from '../utils/semsTallies'
import readFileAsync from '../lib/readFileAsync'

import Button from '../components/Button'
import Text from '../components/Text'
import Loading from '../components/Loading'
import Table, { TD } from '../components/Table'
import NavigationScreen from '../components/NavigationScreen'
import routerPaths from '../routerPaths'
import LinkButton from '../components/LinkButton'
import HorizontalRule from '../components/HorizontalRule'
import Prose from '../components/Prose'
import ImportCVRFilesModal from '../components/ImportCVRFilesModal'
import ExportFinalResultsModal from '../components/ExportFinalResultsModal'
import Modal from '../components/Modal'
import FileInputButton from '../components/FileInputButton'
import { ConfirmRemovingFileModal } from '../components/ConfirmRemovingFileModal'
import { TIME_FORMAT } from '../config/globals'

const TallyScreen: React.FC = () => {
  const {
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
    saveIsOfficialResults,
    saveExternalVoteRecordsFile,
    externalVoteRecordsFile,
    setIsTabulationRunning,
    isTabulationRunning,
    fullElectionTally,
    fullElectionExternalTally,
  } = useContext(AppContext)
  const { election } = electionDefinition!

  const [confirmingRemoveFileType, setConfirmingRemoveFileType] = useState<
    Optional<ResultsFileType>
  >(undefined)
  const [isImportCVRModalOpen, setIsImportCVRModalOpen] = useState(false)
  const [isExportResultsModalOpen, setIsExportResultsModalOpen] = useState(
    false
  )

  const cancelConfirmingRemoveFiles = () => {
    setConfirmingRemoveFileType(undefined)
  }
  const confirmRemoveFiles = (fileType: ResultsFileType) => {
    setConfirmingRemoveFileType(fileType)
  }

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'
  const [isConfirmingOfficial, setIsConfirmingOfficial] = useState(false)
  const cancelConfirmingOfficial = () => {
    setIsConfirmingOfficial(false)
  }
  const confirmOfficial = () => {
    setIsConfirmingOfficial(true)
  }
  const setOfficial = () => {
    setIsConfirmingOfficial(false)
    saveIsOfficialResults()
  }

  const getPrecinctNames = (precinctIds: readonly string[]) =>
    precinctIds
      .map((id) => election.precincts.find((p) => p.id === id)!.name)
      .join(', ')

  const castVoteRecordFileList = castVoteRecordFiles.fileList
  const hasCastVoteRecordFiles =
    !!castVoteRecordFileList.length || !!castVoteRecordFiles.lastError
  const hasAnyFiles = hasCastVoteRecordFiles || !!fullElectionExternalTally

  const [isImportExternalModalOpen, setIsImportExternalModalOpen] = useState(
    false
  )
  const [externalImportErrorMessage, setExternalImportErrorMessage] = useState(
    ''
  )

  const importExternalSEMSFile: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    if (files.length === 1) {
      setIsImportExternalModalOpen(true)
      setIsTabulationRunning(true)
      const fileContent = await readFileAsync(files[0])
      // Compute the tallies to see if there are any errors, if so display
      // an error modal.
      try {
        convertSEMSFileToExternalTally(fileContent, election)
        setIsImportExternalModalOpen(false)
        setIsTabulationRunning(false)
        saveExternalVoteRecordsFile(files[0])
      } catch (error) {
        setExternalImportErrorMessage(
          `Failed to import external file. ${error.message}`
        )
        setIsTabulationRunning(false)
      }
    }
  }

  const [hasConverter, setHasConverter] = useState(false)
  useEffect(() => {
    ;(async () => {
      try {
        await new ConverterClient('results').getFiles()
        setHasConverter(true)
      } catch {
        setHasConverter(false)
      }
    })()
  }, [])

  const fileMode = castVoteRecordFiles?.fileMode
  const fileModeText =
    fileMode === 'test'
      ? 'Currently tallying test ballots. Once you have completed L&A testing and are ready to start tallying live ballots remove all of the loaded CVR files before importing live ballot results.'
      : fileMode === 'live'
      ? 'Currently tallying live ballots.'
      : ''

  const resultsByPrecinct =
    fullElectionTally?.resultsByCategory.get(TallyCategory.Precinct) || {}
  const externalResultsByPrecinct =
    fullElectionExternalTally?.resultsByCategory.get(TallyCategory.Precinct) ||
    {}
  const resultsByScanner =
    fullElectionTally?.resultsByCategory.get(TallyCategory.Scanner) || {}
  const totalBallotCountVotingWorks =
    fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0
  const totalBallotCountExternal =
    fullElectionExternalTally?.overallTally.numberOfBallotsCounted ?? 0

  const tallyResultsTable = isTabulationRunning ? (
    <Loading>Tabulating Results…</Loading>
  ) : (
    <React.Fragment>
      <h2>Ballot Count By Precinct</h2>
      <Table>
        <tbody>
          <tr>
            <TD as="th" narrow>
              Precinct
            </TD>
            <TD as="th">Ballot Count</TD>
            <TD as="th">View Tally</TD>
          </tr>
          {[...election.precincts]
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, {
                ignorePunctuation: true,
              })
            )
            .map((precinct) => {
              const precinctBallotsCount =
                resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0
              const externalPrecinctBallotsCount =
                externalResultsByPrecinct[precinct.id]
                  ?.numberOfBallotsCounted ?? 0
              return (
                <tr key={precinct.id}>
                  <TD narrow nowrap>
                    {precinct.name}
                  </TD>
                  <TD>
                    {format.count(
                      precinctBallotsCount + externalPrecinctBallotsCount
                    )}
                  </TD>
                  <TD>
                    <LinkButton
                      small
                      to={routerPaths.tallyPrecinctReport({
                        precinctId: precinct.id,
                      })}
                    >
                      View {statusPrefix} {precinct.name} Tally Report
                    </LinkButton>
                  </TD>
                </tr>
              )
            })}
          <tr>
            <TD narrow nowrap>
              <strong>Total Ballot Count</strong>
            </TD>
            <TD>
              <strong data-testid="total-ballot-count">
                {format.count(
                  totalBallotCountVotingWorks + totalBallotCountExternal
                )}
              </strong>
            </TD>
            <TD>
              <LinkButton
                small
                to={routerPaths.tallyPrecinctReport({
                  precinctId: 'all',
                })}
              >
                View {statusPrefix} Tally Reports for All Precincts
              </LinkButton>
            </TD>
          </tr>
        </tbody>
      </Table>
      <h2>Ballot Count by Scanner</h2>
      {fullElectionExternalTally && (
        <p>
          The following results only include ballots counted with VotingWorks
          scanners. The data from the imported SEMS file is not included in
          these reports.
        </p>
      )}
      <Table>
        <tbody>
          <tr>
            <TD as="th" narrow>
              Scanner ID
            </TD>
            <TD as="th">Ballot Count</TD>
            <TD as="th">View Tally</TD>
          </tr>
          {Object.keys(resultsByScanner)
            .sort((a, b) =>
              a.localeCompare(b, 'en', {
                numeric: true,
                ignorePunctuation: true,
              })
            )
            .map((scannerId) => {
              const scannerBallotsCount =
                resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0
              return (
                <tr key={scannerId}>
                  <TD narrow nowrap>
                    {scannerId}
                  </TD>
                  <TD>{format.count(scannerBallotsCount)}</TD>
                  <TD>
                    {!!scannerBallotsCount && (
                      <LinkButton
                        small
                        to={routerPaths.tallyScannerReport({
                          scannerId,
                        })}
                      >
                        View {statusPrefix} Scanner {scannerId} Tally Report
                      </LinkButton>
                    )}
                  </TD>
                </tr>
              )
            })}
          <tr>
            <TD narrow nowrap>
              <strong>Total Ballot Count</strong>
            </TD>
            <TD>
              <strong>
                {format.count(
                  fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0
                )}
              </strong>
            </TD>
            <TD />
          </tr>
        </tbody>
      </Table>
      <h2>{statusPrefix} Tally Reports</h2>
      <p>
        <LinkButton to={routerPaths.tallyFullReport}>
          View {statusPrefix} Full Election Tally Report
        </LinkButton>
        {false && (
          <LinkButton to={routerPaths.overvoteCombinationReport}>
            {statusPrefix} Overvote Combination Report
          </LinkButton>
        )}
      </p>
    </React.Fragment>
  )

  let externalTallyRow = null
  let externalFileBallotCount = 0
  if (fullElectionExternalTally && externalVoteRecordsFile) {
    const { overallTally } = fullElectionExternalTally
    const precinctsInExternalFile = getPrecinctIdsInExternalTally(
      fullElectionExternalTally
    )
    externalFileBallotCount = overallTally.numberOfBallotsCounted
    externalTallyRow = (
      <tr>
        <TD narrow nowrap>
          {moment(externalVoteRecordsFile.lastModified).format(TIME_FORMAT)}
        </TD>
        <TD narrow nowrap>
          SEMS File ({externalVoteRecordsFile.name})
        </TD>
        <TD narrow>{format.count(externalFileBallotCount)}</TD>
        <TD>{getPrecinctNames(precinctsInExternalFile)}</TD>
      </tr>
    )
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>Election Tally Reports</h1>
        <h2>Cast Vote Record (CVR) files</h2>
        <Text>{fileModeText}</Text>
        <Table>
          <tbody>
            {hasAnyFiles ? (
              <React.Fragment>
                <tr>
                  <TD as="th" narrow nowrap>
                    File Exported At
                  </TD>
                  <TD as="th" narrow nowrap>
                    Scanner ID
                  </TD>
                  <TD as="th" nowrap narrow>
                    CVR Count
                  </TD>
                  <TD as="th" nowrap>
                    Precinct(s)
                  </TD>
                </tr>
                {castVoteRecordFileList.map(
                  ({
                    name,
                    exportTimestamp,
                    count,
                    scannerIds,
                    precinctIds,
                  }) => (
                    <tr key={name}>
                      <TD narrow nowrap>
                        {moment(exportTimestamp).format(
                          'MM/DD/YYYY hh:mm:ss A'
                        )}
                      </TD>
                      <TD narrow nowrap>
                        {scannerIds && scannerIds.join(', ')}
                      </TD>
                      <TD narrow>{format.count(count)}</TD>
                      <TD>{getPrecinctNames(precinctIds)}</TD>
                    </tr>
                  )
                )}
                {externalTallyRow}
                <tr>
                  <TD as="th" narrow nowrap>
                    Total CVRs Count
                  </TD>
                  <TD as="th" narrow>
                    {format.count(
                      castVoteRecordFileList.reduce(
                        (prev, curr) => prev + curr.count,
                        0
                      ) + externalFileBallotCount
                    )}
                  </TD>
                  <TD as="th" />
                </tr>
              </React.Fragment>
            ) : (
              <tr>
                <TD colSpan={2}>
                  <em>No CVR files loaded.</em>
                </TD>
              </tr>
            )}
          </tbody>
        </Table>
        <p>
          <Button
            onPress={() => setIsImportCVRModalOpen(true)}
            disabled={isOfficialResults}
          >
            Import CVR Files
          </Button>{' '}
          <FileInputButton
            onChange={importExternalSEMSFile}
            accept="*"
            disabled={!!fullElectionExternalTally}
          >
            Import SEMS File
          </FileInputButton>{' '}
          <Button
            disabled={!hasCastVoteRecordFiles || isOfficialResults}
            onPress={confirmOfficial}
          >
            Mark Tally Results as Official…
          </Button>
        </p>
        <p>
          <Button
            danger
            disabled={!hasCastVoteRecordFiles}
            onPress={() => confirmRemoveFiles(ResultsFileType.CastVoteRecord)}
          >
            Remove CVR Files…
          </Button>{' '}
          <Button
            danger
            disabled={!externalVoteRecordsFile}
            onPress={() => confirmRemoveFiles(ResultsFileType.SEMS)}
          >
            Remove SEMS File…
          </Button>
        </p>
        {tallyResultsTable}
        {hasConverter && hasCastVoteRecordFiles && (
          <React.Fragment>
            <h2>Export Options</h2>
            <p>
              <Button onPress={() => setIsExportResultsModalOpen(true)}>
                Save Results File
              </Button>
            </p>
          </React.Fragment>
        )}
        {!hasCastVoteRecordFiles && (
          <React.Fragment>
            <HorizontalRule />
            <h2>Pre-Election Features</h2>
            <p>
              <LinkButton to={routerPaths.printTestDecks}>
                Print Test Decks
              </LinkButton>{' '}
              <LinkButton to={routerPaths.testDecksTally}>
                View Test Ballot Deck Tally
              </LinkButton>
            </p>
          </React.Fragment>
        )}
      </NavigationScreen>
      {confirmingRemoveFileType && (
        <ConfirmRemovingFileModal
          fileType={confirmingRemoveFileType || ResultsFileType.CastVoteRecord}
          onClose={cancelConfirmingRemoveFiles}
        />
      )}
      {isConfirmingOfficial && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Mark Unofficial Tally Results as Official Tally Results?</h1>
              <p>
                Have all CVR files been loaded? Once results are marked as
                official, no additional CVRs can be loaded.
              </p>
              <p>Have all unofficial tally reports been reviewed?</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={cancelConfirmingOfficial}>Cancel</Button>
              <Button primary onPress={setOfficial}>
                Mark Tally Results as Official
              </Button>
            </React.Fragment>
          }
          onOverlayClick={cancelConfirmingOfficial}
        />
      )}
      {isImportExternalModalOpen && (
        <Modal
          onOverlayClick={() => setIsImportExternalModalOpen(false)}
          actions={
            <LinkButton
              disabled={isTabulationRunning}
              onPress={() => setIsImportExternalModalOpen(false)}
            >
              Close
            </LinkButton>
          }
          content={
            isTabulationRunning ? (
              <Loading> Tabulating Results ... </Loading>
            ) : (
              <Prose>
                <h1>Error</h1>
                <p>{externalImportErrorMessage}</p>
              </Prose>
            )
          }
        />
      )}

      {isImportCVRModalOpen && (
        <ImportCVRFilesModal onClose={() => setIsImportCVRModalOpen(false)} />
      )}
      {isExportResultsModalOpen && (
        <ExportFinalResultsModal
          onClose={() => setIsExportResultsModalOpen(false)}
        />
      )}
    </React.Fragment>
  )
}

export default TallyScreen
