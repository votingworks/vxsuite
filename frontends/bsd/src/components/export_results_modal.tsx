import { ElectionDefinition } from '@votingworks/types';
import React, { useContext, useState } from 'react';
import styled from 'styled-components';
import * as path from 'path';

import {
  isElectionManagerAuth,
  Modal,
  UsbControllerButton,
} from '@votingworks/ui';
import {
  assert,
  generateElectionBasedSubfolderName,
  generateFilenameForScanningResults,
  SCANNER_RESULTS_FOLDER,
  usbstick,
} from '@votingworks/utils';

import { LogEventId } from '@votingworks/logging';
import { Scan } from '@votingworks/api';
import { AppContext } from '../contexts/app_context';
import { Button } from './button';
import { Prose } from './prose';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { download } from '../util/download';

function throwBadStatus(s: never): never {
  throw new Error(`Bad status: ${s}`);
}

export const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export interface Props {
  onClose: () => void;
  electionDefinition: ElectionDefinition;
  numberOfBallots: number;
  isTestMode: boolean;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

export function ExportResultsModal({
  onClose,
  electionDefinition,
  numberOfBallots,
  isTestMode,
}: Props): JSX.Element {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { machineConfig, usbDriveEject, usbDriveStatus, auth, logger } =
    useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  async function exportResults(openDialog: boolean) {
    setCurrentState(ModalState.SAVING);

    try {
      await logger.log(LogEventId.SaveCvrInit, userRole);

      const cvrFilename = generateFilenameForScanningResults(
        machineConfig.machineId,
        numberOfBallots,
        isTestMode,
        new Date()
      );

      if (window.kiosk) {
        const usbPath = await usbstick.getPath();
        if (!usbPath) {
          throw new Error('could not save file; path to usb drive missing');
        }
        const electionFolderName = generateElectionBasedSubfolderName(
          electionDefinition.election,
          electionDefinition.electionHash
        );
        const pathToFolder = path.join(
          usbPath,
          SCANNER_RESULTS_FOLDER,
          electionFolderName
        );
        if (openDialog) {
          await download(`/central-scanner/scan/export`, {
            defaultPath: path.join(pathToFolder, cvrFilename),
          });
        } else {
          const requestBody: Scan.ExportToUsbDriveRequest = {
            filename: cvrFilename,
          };
          const response = await fetch(
            '/central-scanner/scan/export-to-usb-drive',
            {
              method: 'post',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            }
          );

          if (!response.ok) {
            throw new Error('unable to write to USB drive');
          }
        }

        setCurrentState(ModalState.DONE);
        await logger.log(LogEventId.SaveCvrComplete, userRole, {
          message: `Successfully saved CVR file with ${numberOfBallots} ballots.`,
          disposition: 'success',
          numberOfBallots,
        });
      } else {
        await download(`/central-scanner/scan/export?filename=${cvrFilename}`);
        setCurrentState(ModalState.DONE);
      }
    } catch (error) {
      assert(error instanceof Error);
      setErrorMessage(`Failed to save CVRs. ${error.message}`);
      setCurrentState(ModalState.ERROR);
      await logger.log(LogEventId.SaveCvrComplete, userRole, {
        message: 'Error saving CVR file.',
        error: error.message,
        result: 'User shown error, CVR file not saved.',
        disposition: 'failure',
      });
    }
  }

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Failed to Save CVRs</h1>
            <p>{errorMessage}</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<LinkButton onPress={onClose}>Close</LinkButton>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    if (usbDriveStatus === 'ejected') {
      return (
        <Modal
          content={
            <Prose>
              <h1>CVRs Saved</h1>
              <p>
                USB drive successfully ejected, you may now take it to VxAdmin
                for tabulation.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={<Button onPress={onClose}>Close</Button>}
        />
      );
    }
    return (
      <Modal
        content={
          <Prose>
            <h1>CVRs Saved</h1>
            <p>
              CVR file saved successfully! You may now eject the USB drive and
              take it to VxAdmin for tabulation.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <UsbControllerButton
              small={false}
              primary
              usbDriveStatus={usbDriveStatus}
              usbDriveEject={() => usbDriveEject(userRole)}
            />
            <LinkButton onPress={onClose}>Cancel</LinkButton>
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading />} onOverlayClick={onClose} />;
  }

  if (currentState !== ModalState.INIT) {
    throwBadStatus(currentState); // Creates a compile time check that all states are being handled.
  }

  switch (usbDriveStatus) {
    case 'absent':
    case 'ejected':
      // When run not through kiosk mode let the user save the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to save with file dialog by double-clicking
                  onDoubleClick={() => exportResults(true)}
                />
                Please insert a USB drive in order to save CVRs.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              {!window.kiosk && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Save
                </Button>
              )}
              <LinkButton onPress={onClose}>Cancel</LinkButton>
            </React.Fragment>
          }
        />
      );
    case 'ejecting':
    case 'mounting':
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={<LinkButton onPress={onClose}>Cancel</LinkButton>}
        />
      );
    case 'mounted':
      return (
        <Modal
          content={
            <Prose>
              <h1>Save CVRs</h1>
              <UsbImage
                src="/assets/usb-drive.svg"
                alt="Insert USB Image"
                onDoubleClick={() => exportResults(true)}
              />
              <p>
                A CVR file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom save
                location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportResults(false)}>
                Save
              </Button>
              <LinkButton onPress={onClose}>Cancel</LinkButton>
              <Button onPress={() => exportResults(true)}>Custom</Button>
            </React.Fragment>
          }
        />
      );
    default:
      // Creates a compile time check to make sure this switch statement includes all enum values for UsbDriveStatus
      throwBadStatus(usbDriveStatus);
  }
}
