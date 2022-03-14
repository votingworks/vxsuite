import { ElectionDefinition } from '@votingworks/types';
import {
  generateFilenameForScanningResults,
  SCANNER_RESULTS_FOLDER,
  usbstick,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import path from 'path';
import fileDownload from 'js-file-download';
import * as scan from '../api/scan';
import { MachineConfig } from '../config/types';

interface SaveCvrExportToUsbArgs {
  electionDefinition: ElectionDefinition;
  machineConfig: MachineConfig;
  scannedBallotCount: number;
  isTestMode: boolean;
  openFilePickerDialog: boolean;
}

/**
 * Saves the current results from the scanning service to the usb drive, if present.
 * @param openFilePickerDialog Toggles whether to open the file picker dialog and allow the user to customize the filename / location to save.
 */
export async function saveCvrExportToUsb({
  electionDefinition,
  machineConfig,
  scannedBallotCount,
  isTestMode,
  openFilePickerDialog,
}: SaveCvrExportToUsbArgs): Promise<void> {
  const cvrFileString = await scan.getExport();

  const cvrFilename = generateFilenameForScanningResults(
    machineConfig.machineId,
    scannedBallotCount,
    isTestMode,
    new Date()
  );

  if (window.kiosk) {
    const usbPath = await usbstick.getDevicePath();
    if (!usbPath) {
      throw new Error('could not begin download; path to usb drive missing');
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
    if (openFilePickerDialog) {
      const fileWriter = await window.kiosk.saveAs({
        defaultPath: pathToFile,
      });

      if (!fileWriter) {
        throw new Error('could not begin download; no file was chosen');
      }

      await fileWriter.write(cvrFileString);
      await fileWriter.end();
    } else {
      await window.kiosk.makeDirectory(pathToFolder, {
        recursive: true,
      });
      await window.kiosk.writeFile(pathToFile, cvrFileString);
    }
  } else {
    fileDownload(cvrFileString, cvrFilename, 'application/x-jsonlines');
  }
}
