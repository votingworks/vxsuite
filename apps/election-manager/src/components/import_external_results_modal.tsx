import React, { useContext, useEffect, useState } from 'react';

import { format } from '@votingworks/utils';
import { strict as assert } from 'assert';
import { VotingMethod } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';
import { readFileAsync } from '../lib/read_file_async';
import {
  convertSEMSFileToExternalTally,
  parseSEMSFileAndValidateForElection,
} from '../utils/sems_tallies';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { Modal } from './modal';
import { Prose } from './prose';
import { Button, SegmentedButton } from './button';

export interface Props {
  onClose: () => void;
  selectedFile?: File;
}

export function ImportExternalResultsModal({
  onClose,
  selectedFile,
}: Props): JSX.Element {
  const {
    saveExternalTallies,
    setIsTabulationRunning,
    electionDefinition,
    fullElectionExternalTallies,
  } = useContext(AppContext);
  assert(electionDefinition);

  const [errorMessage, setErrorMessage] = useState('');
  const [isImportingFile, setIsImportingFile] = useState(true);
  const [numberBallotsToImport, setNumberBallotsToImport] = useState(0);
  const [ballotType, setBallotType] = useState<VotingMethod>(
    VotingMethod.Precinct
  );

  const { election } = electionDefinition;

  async function loadFile(file: File) {
    const fileContent = await readFileAsync(file);
    // Compute the tallies to see if there are any errors, if so display
    // an error modal.
    try {
      const fileErrors = parseSEMSFileAndValidateForElection(
        fileContent,
        election
      );
      if (fileErrors.length > 0) {
        setErrorMessage(
          `Failed to import external file. ${fileErrors.join(' ')}`
        );
        setIsImportingFile(false);
        return;
      }
      const tally = convertSEMSFileToExternalTally(
        fileContent,
        election,
        ballotType, // We are not storing this tally, the ballot type here is not accurate yet but is thrown away
        file.name,
        new Date(file.lastModified)
      );
      setNumberBallotsToImport(tally.overallTally.numberOfBallotsCounted);
    } catch (error) {
      setErrorMessage(`Failed to import external file. ${error.message}`);
    } finally {
      setIsImportingFile(false);
    }
  }

  useEffect(() => {
    if (selectedFile !== undefined) {
      void loadFile(selectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  async function saveImportedFile() {
    if (selectedFile !== undefined) {
      setIsTabulationRunning(true);
      const fileContent = await readFileAsync(selectedFile);
      const tally = convertSEMSFileToExternalTally(
        fileContent,
        election,
        ballotType,
        selectedFile.name,
        new Date(selectedFile.lastModified)
      );
      await saveExternalTallies([...fullElectionExternalTallies, tally]);
      setIsTabulationRunning(false);
      onClose();
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
    );
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
    );
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
  );
}
