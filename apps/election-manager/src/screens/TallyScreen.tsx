import React, { useContext, useState, useEffect, useRef } from 'react'
import moment from 'moment'

import { Optional } from '@votingworks/types'
import {
  TallyCategory,
  InputEventFunction,
  ResultsFileType,
} from '../config/types'

import * as format from '../utils/format'

import AppContext from '../contexts/AppContext'
import ConverterClient from '../lib/ConverterClient'
import { getPrecinctIdsInExternalTally } from '../utils/semsTallies'

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
import BallotCountsTable from '../components/BallotCountsTable'
import Modal from '../components/Modal'
import FileInputButton from '../components/FileInputButton'
import { ConfirmRemovingFileModal } from '../components/ConfirmRemovingFileModal'
import { TIME_FORMAT } from '../config/globals'
import { getPartiesWithPrimaryElections } from '../utils/election'
import ImportExternalResultsModal from '../components/ImportExternalResultsModal'

const TallyScreen: React.FC = () => {
  const {
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
    saveIsOfficialResults,
    externalVoteRecordsFile,
    isTabulationRunning,
    fullElectionExternalTally,
  } = useContext(AppContext)
  const { election } = electionDefinition!

  const externalFileInput = useRef<HTMLInputElement>(null)

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
  const partiesForPrimaries = getPartiesWithPrimaryElections(election)

  const castVoteRecordFileList = castVoteRecordFiles.fileList
  const hasCastVoteRecordFiles =
    !!castVoteRecordFileList.length || !!castVoteRecordFiles.lastError
  const hasAnyFiles = hasCastVoteRecordFiles || !!fullElectionExternalTally

  const [isImportExternalModalOpen, setIsImportExternalModalOpen] = useState(
    false
  )
  const [
    externalResultsSelectedFile,
    setExternalResultsSelectedFile,
  ] = useState<File | undefined>(undefined)

  const importExternalSEMSFile: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    if (files.length === 1) {
      setIsImportExternalModalOpen(true)
      setExternalResultsSelectedFile(files[0])
    }
  }

  const closeExternalFileImport = () => {
    setIsImportExternalModalOpen(false)
    setExternalResultsSelectedFile(undefined)
    if (externalFileInput && externalFileInput.current) {
      externalFileInput.current.value = ''
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

  const tallyResultsTable = isTabulationRunning ? (
    <Loading>Tabulating Results…</Loading>
  ) : (
    <React.Fragment>
      <h2>Ballot Counts by Precinct</h2>
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />
      <h2>Ballot Counts by Voting Method</h2>
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />
      {partiesForPrimaries.length > 0 && (
        <React.Fragment>
          <h2>Ballot Counts by Party</h2>
          <BallotCountsTable breakdownCategory={TallyCategory.Party} />
        </React.Fragment>
      )}
      <h2>Ballot Counts by Scanner</h2>
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />
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
          External Results File ({externalVoteRecordsFile.name})
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
                  <TD as="th" />
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
            innerRef={externalFileInput}
            onChange={importExternalSEMSFile}
            accept="*"
            data-testid="import-sems-button"
            disabled={!!fullElectionExternalTally || isOfficialResults}
          >
            Import External Results File
          </FileInputButton>{' '}
          <Button
            disabled={!hasCastVoteRecordFiles || isOfficialResults}
            onPress={confirmOfficial}
          >
            Mark Tally Results as Official…
          </Button>
        </p>
        {isOfficialResults ? (
          <p>
            <Button
              danger
              disabled={!hasAnyFiles}
              onPress={() => confirmRemoveFiles(ResultsFileType.All)}
            >
              Clear All Results…
            </Button>
          </p>
        ) : (
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
              Remove External Results File…
            </Button>
          </p>
        )}
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
                Have all CVR and external results files been loaded? Once
                results are marked as official, no additional CVR or external
                files can be loaded.
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
        <ImportExternalResultsModal
          onClose={closeExternalFileImport}
          selectedFile={externalResultsSelectedFile}
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
