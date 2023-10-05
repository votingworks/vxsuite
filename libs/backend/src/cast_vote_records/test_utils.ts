/* istanbul ignore file */
import fs from 'fs';
import path from 'path';
import {
  computeCastVoteRecordRootHashFromScratch,
  SIGNATURE_FILE_EXTENSION,
} from '@votingworks/auth';
import { assert, assertDefined } from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CVR,
  safeParseJson,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import {
  getExportedCastVoteRecordIds,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { readCastVoteRecordExportMetadata } from './import';

function identifyFunction<T>(input: T): T {
  return input;
}

/**
 * Modifies a cast vote record export. Specifically meant for modifying fixtures for tests.
 */
export async function modifyCastVoteRecordExport(
  exportDirectoryPath: string,
  modifications: {
    castVoteRecordModifier?: (castVoteRecord: CVR.CVR) => CVR.CVR;
    castVoteRecordReportMetadataModifier?: (
      castVoteRecordReportMetadata: CVR.CastVoteRecordReport
    ) => CVR.CastVoteRecordReport;
    numCastVoteRecordsToKeep?: number;
  }
): Promise<string> {
  const {
    castVoteRecordModifier = identifyFunction,
    castVoteRecordReportMetadataModifier = identifyFunction,
    numCastVoteRecordsToKeep,
  } = modifications;

  const modifiedExportDirectoryPath = `${exportDirectoryPath}-modified`;
  fs.cpSync(exportDirectoryPath, modifiedExportDirectoryPath, {
    recursive: true,
  });

  const castVoteRecordIds = await getExportedCastVoteRecordIds(
    modifiedExportDirectoryPath
  );
  for (const [i, castVoteRecordId] of [...castVoteRecordIds].sort().entries()) {
    const castVoteRecordDirectoryPath = path.join(
      modifiedExportDirectoryPath,
      castVoteRecordId
    );
    if (
      numCastVoteRecordsToKeep !== undefined &&
      i >= numCastVoteRecordsToKeep
    ) {
      fs.rmSync(castVoteRecordDirectoryPath, { recursive: true });
      continue;
    }

    const castVoteRecordReportPath = path.join(
      castVoteRecordDirectoryPath,
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    );
    const castVoteRecordReport = safeParseJson(
      fs.readFileSync(castVoteRecordReportPath, 'utf-8'),
      CVR.CastVoteRecordReportSchema
    ).unsafeUnwrap();
    const castVoteRecord = assertDefined(castVoteRecordReport.CVR?.[0]);
    fs.writeFileSync(
      path.join(
        castVoteRecordDirectoryPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      JSON.stringify({
        ...castVoteRecordReport,
        CVR: [castVoteRecordModifier(castVoteRecord)],
      })
    );
  }

  const metadata = (
    await readCastVoteRecordExportMetadata(modifiedExportDirectoryPath)
  ).unsafeUnwrap();
  fs.writeFileSync(
    path.join(
      modifiedExportDirectoryPath,
      CastVoteRecordExportFileName.METADATA
    ),
    JSON.stringify({
      ...metadata,
      castVoteRecordReportMetadata: castVoteRecordReportMetadataModifier(
        metadata.castVoteRecordReportMetadata
      ),
      castVoteRecordRootHash: await computeCastVoteRecordRootHashFromScratch(
        modifiedExportDirectoryPath
      ),
    })
  );

  return modifiedExportDirectoryPath;
}

/**
 * Gets the paths of the cast vote record export directories on the inserted USB drive, in
 * alphabetical order. Assumes that there's only one election directory.
 */
export async function getCastVoteRecordExportDirectoryPaths(
  usbDrive: UsbDrive
): Promise<string[]> {
  const usbDriveStatus = await usbDrive.status();
  const usbMountPoint =
    usbDriveStatus.status === 'mounted' ? usbDriveStatus.mountPoint : undefined;

  assert(usbMountPoint !== undefined);

  const resultsDirectoryPath = path.join(usbMountPoint, SCANNER_RESULTS_FOLDER);
  const electionDirectoryNames = fs.readdirSync(resultsDirectoryPath);
  assert(electionDirectoryNames.length === 1);
  const electionDirectoryPath = path.join(
    resultsDirectoryPath,
    assertDefined(electionDirectoryNames[0])
  );
  const castVoteRecordExportDirectoryPaths = fs
    .readdirSync(electionDirectoryPath)
    // Filter out signature files
    .filter((entryName) => !entryName.endsWith(SIGNATURE_FILE_EXTENSION))
    .map((entryName) => path.join(electionDirectoryPath, entryName));
  return [...castVoteRecordExportDirectoryPaths].sort();
}
