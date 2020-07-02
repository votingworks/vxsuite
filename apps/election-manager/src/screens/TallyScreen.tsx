import React, { useContext, useState } from 'react'
import fileDownload from 'js-file-download'
import pluralize from 'pluralize'

import { InputEventFunction } from '../config/types'

import { fullTallyVotes, getVotesByPrecinct } from '../lib/votecounting'
import ConverterClient from '../lib/ConverterClient'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import FileInputButton from '../components/FileInputButton'
import Text from '../components/Text'
import Table, { TD } from '../components/Table'
import NavigationScreen from '../components/NavigationScreen'
import { routerPaths } from '../components/ElectionManager'
import LinkButton from '../components/LinkButton'
import HorizontalRule from '../components/HorizontalRule'
import Modal from '../components/Modal'
import Prose from '../components/Prose'

const TallyScreen = () => {
  const {
    castVoteRecordFiles,
    election: e,
    saveCastVoteRecordFiles,
  } = useContext(AppContext)
  const election = e!

  const [isConfimingRemoveCRVs, setIsConfimingRemoveCRVs] = useState(false)
  const cancelConfirmingRemoveCRVs = () => {
    setIsConfimingRemoveCRVs(false)
  }
  const confirmRemoveCRVs = () => {
    setIsConfimingRemoveCRVs(true)
  }

  const votesByPrecinct = getVotesByPrecinct({
    election,
    castVoteRecords: castVoteRecordFiles.castVoteRecords,
  })
  const fullElectionTally = fullTallyVotes({ election, votesByPrecinct })

  const getPrecinctNames = (precinctIds: readonly string[]) =>
    precinctIds
      .map((id) => election.precincts.find((p) => p.id === id)!.name)
      .join(', ')

  const castVoteRecordFileList = castVoteRecordFiles.fileList
  const hasCastVoteRecordFiles = !!castVoteRecordFileList.length

  const processCastVoteRecordFiles: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    const newCastVoteRecordFiles = await castVoteRecordFiles.addAll(files)

    saveCastVoteRecordFiles(newCastVoteRecordFiles)
    input.value = ''
  }

  const resetCastVoteRecordFiles = () => {
    saveCastVoteRecordFiles()
    setIsConfimingRemoveCRVs(false)
  }

  const exportResults = async () => {
    const CastVoteRecordsString = castVoteRecordFiles.castVoteRecords
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
        <h1>Election Tally</h1>
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
                    <TD narrow>{count}</TD>
                    <TD>{getPrecinctNames(precinctIds)}</TD>
                  </tr>
                ))}
                <tr>
                  <TD as="th" narrow nowrap>
                    Total CVRs Count
                  </TD>
                  <TD as="th" narrow>
                    {castVoteRecordFileList.reduce(
                      (prev, curr) => prev + curr.count,
                      0
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
          <FileInputButton multiple onChange={processCastVoteRecordFiles}>
            Load CVR Files
          </FileInputButton>{' '}
          <Button
            danger
            disabled={!hasCastVoteRecordFiles}
            onPress={confirmRemoveCRVs}
          >
            Remove CVR Files…
          </Button>
        </p>
        <h2>Ballot Count By Precinct</h2>
        <Table>
          <tbody>
            {hasCastVoteRecordFiles ? (
              <React.Fragment>
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
                      votesByPrecinct && votesByPrecinct[precinct.id]
                        ? votesByPrecinct[precinct.id]!.length
                        : 0
                    return (
                      <tr key={precinct.id}>
                        <TD narrow nowrap>
                          {precinct.name}
                        </TD>
                        <TD>{precinctBallotsCount}</TD>
                        <TD>
                          {!!precinctBallotsCount && (
                            <LinkButton
                              to={routerPaths.tallyReport({
                                precinctId: precinct.id,
                              })}
                            >
                              View {precinct.name} Tally
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
                    <strong>
                      {Object.values(votesByPrecinct).reduce(
                        (prev, curr) => prev + (curr ? curr.length : 0),
                        0
                      )}
                    </strong>
                  </TD>
                  <TD>
                    <LinkButton
                      disabled={!hasCastVoteRecordFiles || !fullElectionTally}
                      to={routerPaths.tallyFullReport}
                    >
                      View Full Election Tally
                    </LinkButton>
                  </TD>
                </tr>
              </React.Fragment>
            ) : (
              <tr>
                <TD colSpan={2}>
                  <em>Load CVR files to view ballot count by precinct.</em>
                </TD>
              </tr>
            )}
          </tbody>
        </Table>
        <p>
          <Button disabled={!hasCastVoteRecordFiles} onPress={exportResults}>
            Export SEMS Results File
          </Button>
        </p>
        <HorizontalRule />
        <h2>Test Ballot Deck Tally</h2>
        <p>
          <LinkButton to={routerPaths.testDecksTally}>
            View Test Ballot Deck Tally
          </LinkButton>
        </p>
      </NavigationScreen>
      <Modal
        isOpen={isConfimingRemoveCRVs}
        centerContent
        content={
          <Prose textCenter>
            <p>
              Do you want to remove the {castVoteRecordFileList.length} uploaded
              CRV {pluralize('files', castVoteRecordFileList.length)}?
            </p>
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
      />
    </React.Fragment>
  )
}

export default TallyScreen
