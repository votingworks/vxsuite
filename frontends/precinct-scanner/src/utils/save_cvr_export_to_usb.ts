import { ElectionDefinition, Result } from '@votingworks/types';
import {
  generateFilenameForScanningResults,
  SCANNER_RESULTS_FOLDER,
  usbstick,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import { join } from 'path';
import { MachineConfig } from '../config/types';
import { download, DownloadError, DownloadErrorKind } from './download';

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
  // TODO: filename should be determined server-side
  const cvrFilename = generateFilenameForScanningResults(
    machineConfig.machineId,
    scannedBallotCount,
    isTestMode,
    new Date()
  );
  let result: Result<void, DownloadError>;
  if (window.kiosk && !openFilePickerDialog) {
    const usbPath = await usbstick.getDevicePath();
    if (!usbPath) {
      throw new Error('could not save file; path to usb drive missing');
    }
    const electionFolderName = generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.electionHash
    );
    const pathToFolder = join(
      usbPath,
      SCANNER_RESULTS_FOLDER,
      electionFolderName
    );
    result = await download('/precinct-scanner/export', {
      directory: pathToFolder,
      filename: cvrFilename,
      fetchOptions: {
        method: 'POST',
      },
    });
    await usbstick.doSync();
  } else {
    result = await download('/precinct-scanner/export', {
      filename: cvrFilename,
      fetchOptions: {
        method: 'POST',
      },
    });
  }
  if (!result.isOk()) {
    const error = result.err();
    let errorMessage = '';
    switch (error.kind) {
      case DownloadErrorKind.FetchFailed:
      case DownloadErrorKind.FileMissing:
        errorMessage = `Unable to get CVR file: ${error.kind} (status=${error.response.statusText})`;
        break;
      case DownloadErrorKind.OpenFailed:
        errorMessage = `Unable to write file to save location: ${error.path}`;
        break;
      case DownloadErrorKind.NoFileChosen:
        errorMessage = 'Could not save; no file was chosen';
        break;
      default:
        // nothing to do
        break;
    }
    throw new Error(errorMessage);
  }
}
