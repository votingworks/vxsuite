import React, { useContext, useState, useEffect, useCallback } from 'react'
import fileDownload from 'js-file-download'
import pluralize from 'pluralize'

import { InputEventFunction } from '../config/types'

import {
  voteCountsByCategory,
  CVRCategorizerByPrecinct,
  CVRCategorizerByScanner,
} from '../lib/votecounting'
import ConverterClient from '../lib/ConverterClient'
import * as format from '../utils/format'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import FileInputButton from '../components/FileInputButton'
import Text from '../components/Text'
import Loading from '../components/Loading'
import Table, { TD } from '../components/Table'
import NavigationScreen from '../components/NavigationScreen'
import routerPaths from '../routerPaths'
import LinkButton from '../components/LinkButton'
import HorizontalRule from '../components/HorizontalRule'
import Modal from '../components/Modal'
import Prose from '../components/Prose'

const TallyScreen = () => {
  const {
    castVoteRecordFiles,
    election: e,
    isOfficialResults,
    saveCastVoteRecordFiles,
    saveIsOfficialResults,
    setVoteCounts,
    voteCounts,
  } = useContext(AppContext)
  const election = e!

  const [isLoadingCVRFile, setIsLoadingCVRFile] = useState(false)
  const [isConfimingRemoveCRVs, setIsConfirmingRemoveCRVs] = useState(false)

  const cancelConfirmingRemoveCRVs = () => {
    setIsConfirmingRemoveCRVs(false)
  }
  const confirmRemoveCRVs = () => {
    setIsConfirmingRemoveCRVs(true)
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

  let totalBallots = 0
  if (voteCounts) {
    for (const precinctId in voteCounts.Precinct) {
      totalBallots += voteCounts!.Precinct![precinctId]!
    }
  }

  const getPrecinctNames = (precinctIds: readonly string[]) =>
    precinctIds
      .map((id) => election.precincts.find((p) => p.id === id)!.name)
      .join(', ')

  const castVoteRecordFileList = castVoteRecordFiles.fileList
  const hasCastVoteRecordFiles =
    !!castVoteRecordFileList.length || !!castVoteRecordFiles.errorFile

  const computeVoteCounts = useCallback(() => {
    setVoteCounts(
      voteCountsByCategory({
        castVoteRecords: castVoteRecordFiles.castVoteRecords,
        categorizers: {
          Precinct: CVRCategorizerByPrecinct,
          Scanner: CVRCategorizerByScanner,
        },
      })
    )
  }, [setVoteCounts, castVoteRecordFiles])

  const processCastVoteRecordFiles: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])

    setIsLoadingCVRFile(true)
    const newCastVoteRecordFiles = await castVoteRecordFiles.addAll(files)
    saveCastVoteRecordFiles(newCastVoteRecordFiles)
    computeVoteCounts()
    setIsLoadingCVRFile(false)

    input.value = ''
  }

  const resetCastVoteRecordFiles = () => {
    saveCastVoteRecordFiles()
    setIsConfirmingRemoveCRVs(false)
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

  const exportResults = async () => {
    const CastVoteRecordsString = castVoteRecordFiles.castVoteRecords
      .flat(1)
      .map((c) => JSON.stringify(c))
      .join('\n')

    // process on the server
    const client = new ConverterClient('results')
    const { inputFiles, outputFiles } = await client.getFiles()
    const [electionDefinitionFile, cvrFile] = inputFiles
    const resultsFile = outputFiles[0]

    await client.setInputFile(
      electionDefinitionFile.name,
      new File([JSON.stringify(election)], electionDefinitionFile.name, {
        type: 'application/json',
      })
    )
    await client.setInputFile(
      cvrFile.name,
      new File([CastVoteRecordsString], 'cvrs')
    )
    await client.process()

    // download the result
    const results = await client.getOutputFile(resultsFile.name)
    fileDownload(results, 'sems-results.csv', 'text/csv')

    // reset server files
    await client.reset()
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <h1>Election Tally Reports</h1>
        <h2>Cast Vote Record (CVR) files</h2>
        <Table>
          <tbody>
            {hasCastVoteRecordFiles ? (
              <React.Fragment>
                <tr>
                  <TD as="th" narrow nowrap>
                    File Name
                  </TD>
                  <TD as="th" nowrap narrow>
                    CVR Count
                  </TD>
                  <TD as="th" nowrap>
                    Precinct(s)
                  </TD>
                </tr>
                {castVoteRecordFileList.map(({ name, count, precinctIds }) => (
                  <tr key={name}>
                    <TD narrow nowrap>
                      {name}
                    </TD>
                    <TD narrow>{format.count(count)}</TD>
                    <TD>{getPrecinctNames(precinctIds)}</TD>
                  </tr>
                ))}
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
        {castVoteRecordFiles.duplicateFiles.length > 0 && (
          <Text warning>
            {castVoteRecordFiles.duplicateFiles.length === 1 && (
              <React.Fragment>
                The file{' '}
                <strong>{castVoteRecordFiles.duplicateFiles.join(', ')}</strong>{' '}
                was ignored as a duplicate of a file already loaded.
              </React.Fragment>
            )}
            {castVoteRecordFiles.duplicateFiles.length > 1 && (
              <React.Fragment>
                The files{' '}
                <strong>{castVoteRecordFiles.duplicateFiles.join(', ')}</strong>{' '}
                were ignored as duplicates of files already loaded.
              </React.Fragment>
            )}
          </Text>
        )}
        {castVoteRecordFiles.errorFile && (
          <Text error>
            There was an error reading the content of the file{' '}
            <strong>{castVoteRecordFiles.errorFile}</strong>. Please ensure this
            file only contains CVR data.
          </Text>
        )}
        <p>
          <FileInputButton
            multiple
            onChange={processCastVoteRecordFiles}
            disabled={isOfficialResults}
          >
            Load CVR Files
          </FileInputButton>{' '}
          <Button
            disabled={!hasCastVoteRecordFiles || isOfficialResults}
            onPress={confirmOfficial}
          >
            Mark Tally Results as Official…
          </Button>{' '}
          <Button
            danger
            disabled={!hasCastVoteRecordFiles}
            onPress={confirmRemoveCRVs}
          >
            Remove CVR Files…
          </Button>
        </p>
        {hasCastVoteRecordFiles && voteCounts && (
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
                {election.precincts
                  .sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, {
                      ignorePunctuation: true,
                    })
                  )
                  .map((precinct) => {
                    const precinctBallotsCount =
                      voteCounts.Precinct?.[precinct.id] ?? 0
                    return (
                      <tr key={precinct.id}>
                        <TD narrow nowrap>
                          {precinct.name}
                        </TD>
                        <TD>{format.count(precinctBallotsCount)}</TD>
                        <TD>
                          {!!precinctBallotsCount && (
                            <LinkButton
                              small
                              to={routerPaths.tallyPrecinctReport({
                                precinctId: precinct.id,
                              })}
                            >
                              View {statusPrefix} {precinct.name} Tally Report
                            </LinkButton>
                          )}
                        </TD>
                      </tr>
                    )
                  })}
                <tr>
                  <TD narrow>
                    <strong>Total Ballot Count</strong>
                  </TD>
                  <TD>
                    <strong>{format.count(totalBallots)}</strong>
                  </TD>
                  <TD>
                    <LinkButton
                      disabled={!hasCastVoteRecordFiles}
                      to={routerPaths.tallyFullReport}
                    >
                      View {statusPrefix} Full Election Tally
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
                {Object.keys(voteCounts.Scanner!)
                  .sort((a, b) =>
                    a.localeCompare(b, 'en', {
                      numeric: true,
                      ignorePunctuation: true,
                    })
                  )
                  .map((scannerId) => {
                    const scannerBallotsCount =
                      voteCounts.Scanner?.[scannerId] ?? 0
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
                              View {statusPrefix} Scanner {scannerId} Tally
                              Report
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
                    <strong>{format.count(totalBallots)}</strong>
                  </TD>
                  <TD />
                </tr>
              </tbody>
            </Table>
            <h2>Additional Reports</h2>
            <p>
              <LinkButton to={routerPaths.overvoteCombinationReport}>
                {statusPrefix} Overvote Combination Report
              </LinkButton>
            </p>
          </React.Fragment>
        )}
        {hasConverter && hasCastVoteRecordFiles && (
          <React.Fragment>
            <h2>Export Options</h2>
            <p>
              <Button
                disabled={!hasCastVoteRecordFiles}
                onPress={exportResults}
              >
                Export SEMS Results File
              </Button>
            </p>
          </React.Fragment>
        )}
        {!hasCastVoteRecordFiles && (
          <React.Fragment>
            <HorizontalRule />
            <h2>Pre-Election Features</h2>
            <p>
              <LinkButton to={routerPaths.testDecksTally}>
                View Test Ballot Deck Tally
              </LinkButton>
            </p>
          </React.Fragment>
        )}
      </NavigationScreen>
      <Modal
        isOpen={isConfimingRemoveCRVs}
        centerContent
        content={
          <Prose textCenter>
            {castVoteRecordFileList.length ? (
              <p>
                Do you want to remove the {castVoteRecordFileList.length}{' '}
                uploaded CRV {pluralize('files', castVoteRecordFileList.length)}
                ?
              </p>
            ) : (
              <p>
                Do you want to remove the files causing errors:{' '}
                {castVoteRecordFiles.errorFile}?
              </p>
            )}
            <p>All reports will be unavailable without CVR data.</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={cancelConfirmingRemoveCRVs}>Cancel</Button>
            <Button danger onPress={resetCastVoteRecordFiles}>
              Remove All CVR Files
            </Button>
          </React.Fragment>
        }
        onOverlayClick={cancelConfirmingRemoveCRVs}
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
      <Modal
        isOpen={isLoadingCVRFile}
        centerContent
        content={<Loading>Loading CVR File</Loading>}
      />
    </React.Fragment>
  )
}

export default TallyScreen
