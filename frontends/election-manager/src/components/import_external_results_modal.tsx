import React, { useContext, useEffect, useState } from 'react';

import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  Modal,
  Prose,
} from '@votingworks/ui';
import { assert, format } from '@votingworks/utils';
import { ExternalTallySourceType, VotingMethod } from '@votingworks/types';
import { LogEventId } from '@votingworks/logging';
import { AppContext } from '../contexts/app_context';
import { readFileAsync } from '../lib/read_file_async';
import {
  convertSemsFileToExternalTally,
  parseSemsFileAndValidateForElection,
} from '../utils/sems_tallies';
import { LinkButton } from './link_button';
import { Loading } from './loading';
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
    addExternalTally,
    setIsTabulationRunning,
    electionDefinition,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth)); // TODO(auth) check permissions for loading cvr
  const userRole = auth.user.role;

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
      const fileErrors = parseSemsFileAndValidateForElection(
        fileContent,
        election
      );
      if (fileErrors.length > 0) {
        setErrorMessage(
          `Failed to load external file. ${fileErrors.join(' ')}`
        );
        setIsImportingFile(false);
        await logger.log(LogEventId.ExternalTallyFileLoaded, userRole, {
          message:
            'Failed to load external tally file, file contents not compatible with current election.',
          result: 'User shown error, file not loaded.',
          error: fileErrors.join(' '),
          disposition: 'failure',
          fileType: ExternalTallySourceType.SEMS,
        });
        return;
      }
      const tally = convertSemsFileToExternalTally(
        fileContent,
        election,
        ballotType, // We are not storing this tally, the ballot type here is not accurate yet but is thrown away
        file.name,
        new Date(file.lastModified)
      );
      setNumberBallotsToImport(tally.overallTally.numberOfBallotsCounted);
    } catch (error) {
      assert(error instanceof Error);
      setErrorMessage(`Failed to load external file. ${error.message}`);
      await logger.log(LogEventId.ExternalTallyFileLoaded, userRole, {
        message: 'Failed to load external tally file.',
        result: 'User shown error, file not loaded.',
        error: error.message,
        fileType: ExternalTallySourceType.SEMS,
        disposition: 'failure',
      });
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
      const tally = convertSemsFileToExternalTally(
        fileContent,
        election,
        ballotType,
        selectedFile.name,
        new Date(selectedFile.lastModified)
      );
      await logger.log(LogEventId.ExternalTallyFileLoaded, userRole, {
        message: 'External Tally File loaded successfully.',
        disposition: 'success',
        fileType: ExternalTallySourceType.SEMS,
        numberOfBallotsImported: tally.overallTally.numberOfBallotsCounted,
      });
      await addExternalTally(tally);
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
        content={<Loading>Loading File</Loading>}
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
          <LinkButton primary onPress={saveImportedFile}>
            Load Results
          </LinkButton>
          <LinkButton onPress={onClose}>Cancel</LinkButton>
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
