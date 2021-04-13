import React, { useContext, useEffect, useState } from 'react'

import * as format from '../utils/format'
import { VotingMethod } from '../config/types'
import AppContext from '../contexts/AppContext'
import readFileAsync from '../lib/readFileAsync'
import {
  convertSEMSFileToExternalTally,
  parseSEMSFileAndValidateForElection,
} from '../utils/semsTallies'
import LinkButton from './LinkButton'
import Loading from './Loading'
import Modal from './Modal'
import Prose from './Prose'
import Button, { SegmentedButton } from './Button'

export interface Props {
  onClose: () => void
  selectedFile?: File
}

const ImportExternalResultsModal: React.FC<Props> = ({
  onClose,
  selectedFile,
}) => {
  const { saveExternalVoteRecordsFile, electionDefinition } = useContext(
    AppContext
  )

  const [errorMessage, setErrorMessage] = useState('')
  const [isImportingFile, setIsImportingFile] = useState(true)
  const [numberBallotsToImport, setNumberBallotsToImport] = useState(0)
  const [ballotType, setBallotType] = useState<VotingMethod>(
    VotingMethod.Precinct
  )

  const { election } = electionDefinition!

  const loadFile = async (file: File) => {
    const fileContent = await readFileAsync(file)
    // Compute the tallies to see if there are any errors, if so display
    // an error modal.
    try {
      const fileErrors = parseSEMSFileAndValidateForElection(
        fileContent,
        election
      )
      if (fileErrors.length > 0) {
        setErrorMessage(
          `Failed to import external file. ${fileErrors.join(' ')}`
        )
        setIsImportingFile(false)
        return
      }
      const tally = convertSEMSFileToExternalTally(
        fileContent,
        election,
        ballotType // We are not storing this tally, the ballot type here is not accurate yet but is thrown away
      )
      setNumberBallotsToImport(tally.overallTally.numberOfBallotsCounted)
    } catch (error) {
      setErrorMessage(`Failed to import external file. ${error.message}`)
    } finally {
      setIsImportingFile(false)
    }
  }

  useEffect(() => {
    if (selectedFile !== undefined) {
      loadFile(selectedFile)
    }
  }, [selectedFile])

  const saveImportedFile = async () => {
    if (selectedFile !== undefined) {
      await saveExternalVoteRecordsFile({
        file: selectedFile,
        votingMethod: ballotType,
      })
      onClose()
    }
  }

  if (isImportingFile) {
    return (
      <Modal
        onOverlayClick={onClose}
        actions={
          <LinkButton disabled onPress={onClose}>
            Close
          </LinkButton>
        }
        content={<Loading>Importing File</Loading>}
      />
    )
  }

  if (errorMessage !== '') {
    return (
      <Modal
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
        content={
          <Prose>
            <h1>Error</h1>
            <p>{errorMessage}</p>
          </Prose>
        }
      />
    )
  }

  return (
    <Modal
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <LinkButton onPress={onClose}>Cancel</LinkButton>
          <LinkButton onPress={saveImportedFile} primary>
            Import Results
          </LinkButton>
        </React.Fragment>
      }
      content={
        <Prose>
          <h1>External Results File Loaded</h1>
          <p>
            The file ({selectedFile?.name}) contained{' '}
            {format.count(numberBallotsToImport)} ballots.
          </p>
          <p>Select the voting method for these ballots.</p>
          <SegmentedButton>
            <Button
              disabled={ballotType === VotingMethod.Precinct}
              onPress={() => setBallotType(VotingMethod.Precinct)}
            >
              Precinct
            </Button>
            <Button
              disabled={ballotType === VotingMethod.Absentee}
              onPress={() => setBallotType(VotingMethod.Absentee)}
            >
              Absentee
            </Button>
          </SegmentedButton>
        </Prose>
      }
    />
  )
}

export default ImportExternalResultsModal
