import React, { useContext, useState, useEffect, useCallback } from 'react'
import pluralize from 'pluralize'
import moment from 'moment'

import { CastVoteRecordLists, TallyCategory } from '../config/types'

import { computeFullElectionTally } from '../lib/votecounting'
import * as format from '../utils/format'

import AppContext from '../contexts/AppContext'
import ConverterClient from '../lib/ConverterClient'

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

const TallyScreen: React.FC = () => {
  const {
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
    saveCastVoteRecordFiles,
    saveIsOfficialResults,
    setFullElectionTally,
    setIsTabulationRunning,
    isTabulationRunning,
    fullElectionTally,
  } = useContext(AppContext)
  const { election } = electionDefinition!

  const [isConfimingRemoveCVRs, setIsConfirmingRemoveCVRs] = useState(false)
  const [isImportCVRModalOpen, setIsImportCVRModalOpen] = useState(false)
  const [isExportResultsModalOpen, setIsExportResultsModalOpen] = useState(
    false
  )

  const cancelConfirmingRemoveCVRs = () => {
    setIsConfirmingRemoveCVRs(false)
  }
  const confirmRemoveCVRs = () => {
    setIsConfirmingRemoveCVRs(true)
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

  const computeVoteCounts = useCallback(
    async (castVoteRecords: CastVoteRecordLists) => {
      setIsTabulationRunning(true)
      const fullTally = await computeFullElectionTally(
        election,
        castVoteRecords
      )
      setFullElectionTally(fullTally)
      setIsTabulationRunning(false)
    },
    [setFullElectionTally]
  )

  useEffect(() => {
    computeVoteCounts(castVoteRecordFiles.castVoteRecords)
  }, [computeVoteCounts, castVoteRecordFiles])

  const resetCastVoteRecordFiles = () => {
    saveCastVoteRecordFiles()
    setIsConfirmingRemoveCVRs(false)
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

  const [hasElectionConverter, setHasElectionConverter] = useState(false)
  useEffect(() => {
    ;(async () => {
      try {
        await new ConverterClient('election').getFiles()
        setHasElectionConverter(true)
      } catch {
        setHasElectionConverter(false)
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
  const resultsByScanner =
    fullElectionTally?.resultsByCategory.get(TallyCategory.Scanner) || {}
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
              return (
                <tr key={precinct.id}>
                  <TD narrow nowrap>
                    {precinct.name}
                  </TD>
                  <TD>{format.count(precinctBallotsCount)}</TD>
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
            <TD narrow>
              <strong>Total Ballot Count</strong>
            </TD>
            <TD>
              <strong data-testid="total-ballot-count">
                {format.count(
                  fullElectionTally?.overallTally.numberOfBallotsCounted ?? 0
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
  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>Election Tally Reports</h1>
        <h2>Cast Vote Record (CVR) files</h2>
        <Text>{fileModeText}</Text>
        <Table>
          <tbody>
            {hasCastVoteRecordFiles ? (
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
                <tr>
                  <TD as="th" narrow nowrap>
                    Total CVRs Count
                  </TD>
                  <TD as="th" narrow>
                    {format.count(
                      castVoteRecordFileList.reduce(
                        (prev, curr) => prev + curr.count,
                        0
                      )
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
          <Button
            disabled={!hasCastVoteRecordFiles || isOfficialResults}
            onPress={confirmOfficial}
          >
            Mark Tally Results as Official…
          </Button>{' '}
          <Button
            danger
            disabled={!hasCastVoteRecordFiles}
            onPress={confirmRemoveCVRs}
          >
            Remove CVR Files…
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
        {hasElectionConverter && (
          <React.Fragment>
            <h2>Results Management</h2>
            <p>
              <LinkButton to={routerPaths.combineResultsFiles}>
                Combine Results Files
              </LinkButton>
            </p>
          </React.Fragment>
        )}
      </NavigationScreen>
      <Modal
        isOpen={isConfimingRemoveCVRs}
        centerContent
        content={
          <Prose textCenter>
            {castVoteRecordFileList.length ? (
              <p>
                Do you want to remove the {castVoteRecordFileList.length}{' '}
                uploaded CVR {pluralize('files', castVoteRecordFileList.length)}
                ?
              </p>
            ) : (
              <p>
                Do you want to remove the files causing errors:{' '}
                {castVoteRecordFiles.lastError?.filename}?
              </p>
            )}
            <p>All reports will be unavailable without CVR data.</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={cancelConfirmingRemoveCVRs}>Cancel</Button>
            <Button danger onPress={resetCastVoteRecordFiles}>
              Remove All CVR Files
            </Button>
          </React.Fragment>
        }
        onOverlayClick={cancelConfirmingRemoveCVRs}
      />
      <Modal
        isOpen={isConfirmingOfficial}
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
      <ImportCVRFilesModal
        isOpen={isImportCVRModalOpen}
        onClose={() => setIsImportCVRModalOpen(false)}
      />
      <ExportFinalResultsModal
        isOpen={isExportResultsModalOpen}
        onClose={() => setIsExportResultsModalOpen(false)}
      />
    </React.Fragment>
  )
}

export default TallyScreen
