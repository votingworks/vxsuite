import React, { useCallback, useContext, useState } from 'react';
import styled from 'styled-components';
import fileDownload from 'js-file-download';
import path from 'path';

import {
  Button,
  Prose,
  Loading,
  USBControllerButton,
  UsbDrive,
} from '@votingworks/ui';
import {
  generateElectionBasedSubfolderName,
  generateFilenameForScanningResults,
  SCANNER_RESULTS_FOLDER,
  throwIllegalValue,
  usbstick,
} from '@votingworks/utils';
import { strict as assert } from 'assert';
import AppContext from '../contexts/AppContext';
import Modal from './Modal';

const USBImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export interface Props {
  onClose: () => void;
  usbDrive: UsbDrive;
  scannedBallotCount: number;
  isTestMode: boolean;
}

enum ModalState {
  ERROR = 'error',
  SAVING = 'saving',
  DONE = 'done',
  INIT = 'init',
}

function ExportResultsModal({
  onClose,
  usbDrive,
  scannedBallotCount,
  isTestMode,
}: Props): JSX.Element {
  const [currentState, setCurrentState] = useState<ModalState>(ModalState.INIT);
  const [errorMessage, setErrorMessage] = useState('');

  const { electionDefinition, machineConfig } = useContext(AppContext);
  assert(electionDefinition);

  const exportResults = useCallback(
    async (openDialog: boolean) => {
      setCurrentState(ModalState.SAVING);

      try {
        const response = await fetch('/scan/export', {
          method: 'post',
        });

        const blob = await response.blob();

        if (response.status !== 200) {
          setErrorMessage(
            'Failed to save results. Error retrieving CVRs from the scanner.'
          );
          setCurrentState(ModalState.ERROR);
          return;
        }

        const cvrFilename = generateFilenameForScanningResults(
          machineConfig.machineId,
          scannedBallotCount,
          isTestMode,
          new Date()
        );

        if (window.kiosk) {
          const usbPath = await usbstick.getDevicePath();
          if (!usbPath) {
            throw new Error(
              'could not begin download; path to usb drive missing'
            );
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
          const pathToFile = path.join(pathToFolder, cvrFilename);
          if (openDialog) {
            const fileWriter = await window.kiosk.saveAs({
              defaultPath: pathToFile,
            });

            if (!fileWriter) {
              throw new Error('could not begin download; no file was chosen');
            }

            await fileWriter.write(await blob.text());
            await fileWriter.end();
          } else {
            await window.kiosk.makeDirectory(pathToFolder, {
              recursive: true,
            });
            await window.kiosk.writeFile(pathToFile, await blob.text());
          }
          setCurrentState(ModalState.DONE);
        } else {
          fileDownload(blob, cvrFilename, 'application/x-jsonlines');
          setCurrentState(ModalState.DONE);
        }
      } catch (error) {
        setErrorMessage(`Failed to save results. ${error.message}`);
        setCurrentState(ModalState.ERROR);
      }
    },
    [
      electionDefinition.election,
      electionDefinition.electionHash,
      isTestMode,
      machineConfig.machineId,
      scannedBallotCount,
    ]
  );

  if (currentState === ModalState.ERROR) {
    return (
      <Modal
        content={
          <Prose>
            <h1>Download Failed</h1>
            <p>{errorMessage}</p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={<Button onPress={onClose}>Close</Button>}
      />
    );
  }

  if (currentState === ModalState.DONE) {
    if (usbDrive.status === usbstick.UsbDriveStatus.recentlyEjected) {
      return (
        <Modal
          content={
            <Prose>
              <h1>Download Complete</h1>
              <p>
                USB drive successfully ejected, you may now take it to Election
                Manager for tabulation.
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
            <h1>Download Complete</h1>
            <p>
              CVR results file saved successfully! You may now eject the USB
              drive and take it to Election Manager for tabulation.
            </p>
          </Prose>
        }
        onOverlayClick={onClose}
        actions={
          <React.Fragment>
            <Button onPress={onClose}>Cancel</Button>
            <USBControllerButton
              small={false}
              primary
              usbDriveStatus={
                usbDrive.status ?? usbstick.UsbDriveStatus.notavailable
              }
              usbDriveEject={usbDrive.eject}
            />
          </React.Fragment>
        }
      />
    );
  }

  if (currentState === ModalState.SAVING) {
    return <Modal content={<Loading />} onOverlayClick={onClose} />;
  }

  if (currentState !== ModalState.INIT) {
    throwIllegalValue(currentState);
  }

  switch (usbDrive.status) {
    case undefined:
    case usbstick.UsbDriveStatus.absent:
    case usbstick.UsbDriveStatus.notavailable:
    case usbstick.UsbDriveStatus.recentlyEjected:
      // When run not through kiosk mode let the user download the file
      // on the machine for internal debugging use
      return (
        <Modal
          content={
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <USBImage
                  src={`${process.env.PUBLIC_URL}/assets/usb-stick.svg`}
                  alt="Insert USB Image"
                />
                Please insert a USB drive in order to export the scanner
                results.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button onPress={onClose}>Cancel</Button>
              {!window.kiosk && (
                <Button
                  data-testid="manual-export"
                  onPress={() => exportResults(true)}
                >
                  Export
                </Button>
              )}{' '}
            </React.Fragment>
          }
        />
      );
    case usbstick.UsbDriveStatus.ejecting:
    case usbstick.UsbDriveStatus.present:
      return (
        <Modal
          content={<Loading />}
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button onPress={onClose}>Cancel</Button>
            </React.Fragment>
          }
        />
      );
    case usbstick.UsbDriveStatus.mounted:
      return (
        <Modal
          content={
            <Prose>
              <h1>Export Results</h1>
              <USBImage
                src={`${process.env.PUBLIC_URL}/assets/usb-stick.svg`}
                alt="Insert USB Image"
              />
              <p>
                A CVR file will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom
                export location.
              </p>
            </Prose>
          }
          onOverlayClick={onClose}
          actions={
            <React.Fragment>
              <Button primary onPress={() => exportResults(false)}>
                Export
              </Button>
              <Button onPress={onClose}>Cancel</Button>
              <Button onPress={() => exportResults(true)}>Custom</Button>
            </React.Fragment>
          }
        />
      );
    default:
      throwIllegalValue(usbDrive.status);
  }
}

export default ExportResultsModal;
