import {
  FileSystemEntryType,
  listDirectoryOnUsbDrive,
} from '@votingworks/backend';
import { throwIllegalValue } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { ElectionDefinition } from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  parseCvrFileInfoFromFilename,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { join } from 'path';
import { CastVoteRecordFileMetadata } from './types';
import { Usb } from './util/usb';

/**
 * Gets the metadata, including the path, of cast vote record files found in
 * the default location on a mounted USB drive. If there is no mounted USB
 * drive or the USB drive appears corrupted then it will return an empty array.
 */
export async function listCastVoteRecordFilesOnUsb(
  electionDefinition: ElectionDefinition,
  usb: Usb,
  logger: Logger
): Promise<CastVoteRecordFileMetadata[]> {
  const { election, electionHash } = electionDefinition;
  const fileSearchResult = await listDirectoryOnUsbDrive(
    join(
      SCANNER_RESULTS_FOLDER,
      generateElectionBasedSubfolderName(election, electionHash)
    ),
    usb.getUsbDrives
  );

  if (fileSearchResult.isErr()) {
    const errorType = fileSearchResult.err().type;
    switch (errorType) {
      case 'no-entity':
        await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
          message:
            'No cast vote record files automatically found on USB drive. User is allowed to manually select files.',
          disposition: 'success',
        });
        break;
      case 'not-directory':
      case 'permission-denied':
        await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
          message:
            'Error accessing cast vote record files on USB drive, which may be corrupted.',
          disposition: 'failure',
        });
        break;
      case 'no-usb-drive':
      case 'usb-drive-not-mounted':
        // we're just polling without a USB drive in these cases, no issue
        break;
      default:
        throwIllegalValue(errorType);
    }

    return [];
  }

  const castVoteRecordFileMetadataList: CastVoteRecordFileMetadata[] = [];

  for (const entry of fileSearchResult.ok()) {
    if (
      entry.type === FileSystemEntryType.File &&
      entry.name.endsWith('.jsonl')
    ) {
      try {
        const parsedFileInfo = parseCvrFileInfoFromFilename(entry.name);
        if (parsedFileInfo) {
          castVoteRecordFileMetadataList.push({
            exportTimestamp: parsedFileInfo.timestamp,
            cvrCount: parsedFileInfo.numberOfBallots,
            isTestModeResults: parsedFileInfo.isTestModeResults,
            name: entry.name,
            path: entry.path,
            scannerIds: [parsedFileInfo.machineId],
          });
        }
      } catch (error) {
        // The filename isn't able to be parsed as a valid CVR filename. We are
        // only interested in valid CVR files so ignore it.
        continue;
      }
    }
  }

  await logger.log(LogEventId.CvrFilesReadFromUsb, 'system', {
    message: `Found ${castVoteRecordFileMetadataList.length} CVR files on USB drive, user shown option to load.`,
    disposition: 'success',
  });

  return [...castVoteRecordFileMetadataList].sort(
    (a, b) => b.exportTimestamp.getTime() - a.exportTimestamp.getTime()
  );
}
