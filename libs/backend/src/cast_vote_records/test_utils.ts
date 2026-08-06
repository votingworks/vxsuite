import * as fs from 'node:fs';
import path from 'node:path';
import {
  computeCastVoteRecordRootHashFromScratch,
  SIGNATURE_FILE_EXTENSION,
} from '@votingworks/auth';
import { assert, assertDefined } from '@votingworks/basics';
import {
  BatchInfo,
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CastVoteRecordReportWithoutMetadataSchema,
  CVR,
  ElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import {
  getExportedCastVoteRecordIds,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';

import { readCastVoteRecordExportMetadata } from './import';
import {
  buildBatchManifest,
  buildCastVoteRecordReportMetadata,
} from './build_report_metadata';

function identifyFunction<T>(input: T): T {
  return input;
}

/**
 * Reads and parses a cast vote record given the path to an individual cast vote record directory.
 * Also returns the raw contents of the cast vote record report.
 */
export function readCastVoteRecord(castVoteRecordDirectoryPath: string): {
  castVoteRecord: CVR.CVR;
  castVoteRecordReportContents: string;
} {
  const castVoteRecordReportContents = fs.readFileSync(
    path.join(
      castVoteRecordDirectoryPath,
      CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
    ),
    'utf-8'
  );
  const castVoteRecordReportWithoutMetadata = safeParseJson(
    castVoteRecordReportContents,
    CastVoteRecordReportWithoutMetadataSchema
  ).unsafeUnwrap();
  const castVoteRecord = assertDefined(
    castVoteRecordReportWithoutMetadata.CVR?.[0]
  );
  return { castVoteRecord, castVoteRecordReportContents };
}

type NotReadOnly<T> = { -readonly [P in keyof T]: NotReadOnly<T[P]> };

/**
 * The second input to {@link modifyCastVoteRecordExport}
 */
export interface CastVoteRecordExportModifications {
  castVoteRecordModifier?: (castVoteRecord: NotReadOnly<CVR.CVR>) => CVR.CVR;
  castVoteRecordReportMetadataModifier?: (
    castVoteRecordReportMetadata: CVR.CastVoteRecordReport
  ) => CVR.CastVoteRecordReport;
  numCastVoteRecordsToKeep?: number;
}

/**
 * Modifies a cast vote record export. Specifically meant for modifying fixtures for tests.
 */
export async function modifyCastVoteRecordExport(
  exportDirectoryPath: string,
  modifications: CastVoteRecordExportModifications
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

    const { castVoteRecord, castVoteRecordReportContents } = readCastVoteRecord(
      castVoteRecordDirectoryPath
    );
    fs.writeFileSync(
      path.join(
        castVoteRecordDirectoryPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      JSON.stringify({
        ...JSON.parse(castVoteRecordReportContents),
        CVR: [castVoteRecordModifier(castVoteRecord as NotReadOnly<CVR.CVR>)],
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
    usbDriveStatus.status === 'mounted' ? usbDriveStatus.mountpoint : undefined;
  assert(usbMountPoint !== undefined);

  const electionDirectoryNames = fs.readdirSync(usbMountPoint);
  assert(electionDirectoryNames.length === 1);

  const electionResultsDirectoryPath = path.join(
    usbMountPoint,
    assertDefined(electionDirectoryNames[0]),
    SCANNER_RESULTS_FOLDER
  );
  const castVoteRecordExportDirectoryPaths = fs
    .readdirSync(electionResultsDirectoryPath)
    // Filter out signature files
    .filter((entryName) => !entryName.endsWith(SIGNATURE_FILE_EXTENSION))
    .map((entryName) => path.join(electionResultsDirectoryPath, entryName));
  return [...castVoteRecordExportDirectoryPaths].sort();
}

/**
 * A cast vote record together with any files it references (e.g. ballot images
 * and layouts for an HMPB), to be written into its directory by
 * {@link writeCastVoteRecordExport}.
 */
export interface CastVoteRecordToExport {
  castVoteRecord: CVR.CVR;
  referencedFiles?: ReadonlyArray<{
    fileName: string;
    contents: string | Uint8Array;
  }>;
}

/**
 * Writes a cast vote record export directory from in-memory cast vote records,
 * mirroring the structure a scanner produces.
 */
export async function writeCastVoteRecordExport({
  exportDirectoryPath,
  electionDefinition,
  castVoteRecords,
  pollingPlaceId,
  isTestMode,
}: {
  exportDirectoryPath: string;
  electionDefinition: ElectionDefinition;
  castVoteRecords: readonly CastVoteRecordToExport[];
  pollingPlaceId: string;
  isTestMode: boolean;
}): Promise<{ metadataFileContents: string }> {
  const { election, ballotHash } = electionDefinition;

  const allCastVoteRecords = castVoteRecords.map(
    (entry) => entry.castVoteRecord
  );
  const scannerIds = [
    ...new Set(allCastVoteRecords.map((cvr) => cvr.CreatingDeviceId)),
  ];
  const batchesByScannerId = scannerIds.map((scannerId) => {
    const scannerCastVoteRecords = allCastVoteRecords.filter(
      (cvr) => cvr.CreatingDeviceId === scannerId
    );
    const batchIds = [
      ...new Set(scannerCastVoteRecords.map((cvr) => cvr.BatchId)),
    ];
    return {
      scannerId,
      batches: batchIds.map(
        (batchId, index): BatchInfo => ({
          id: batchId,
          batchNumber: index + 1,
          label: batchId,
          startedAt: new Date().toISOString(),
          count: scannerCastVoteRecords.filter((cvr) => cvr.BatchId === batchId)
            .length,
          pollingPlaceId,
        })
      ),
    };
  });

  const reportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId: ballotHash,
    generatingDeviceId: assertDefined(scannerIds[0]),
    scannerIds,
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode,
    batchInfo: batchesByScannerId.flatMap(({ batches }) => batches),
  });

  await fs.promises.mkdir(exportDirectoryPath, { recursive: true });
  for (const { castVoteRecord, referencedFiles } of castVoteRecords) {
    const castVoteRecordDirectoryPath = path.join(
      exportDirectoryPath,
      castVoteRecord.UniqueId
    );
    await fs.promises.mkdir(castVoteRecordDirectoryPath);
    for (const { fileName, contents } of referencedFiles ?? []) {
      await fs.promises.writeFile(
        path.join(castVoteRecordDirectoryPath, fileName),
        contents
      );
    }
    const castVoteRecordReport: CVR.CastVoteRecordReport = {
      ...reportMetadata,
      CVR: [castVoteRecord],
    };
    await fs.promises.writeFile(
      path.join(
        castVoteRecordDirectoryPath,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      JSON.stringify(castVoteRecordReport)
    );
  }

  const castVoteRecordExportMetadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: reportMetadata,
    castVoteRecordRootHash:
      await computeCastVoteRecordRootHashFromScratch(exportDirectoryPath),
    batchManifest: batchesByScannerId.flatMap((batchScanner) =>
      buildBatchManifest({ ...batchScanner, scannerMachineType: 'precinct' })
    ),
  };
  const metadataFileContents = JSON.stringify(castVoteRecordExportMetadata);
  await fs.promises.writeFile(
    path.join(exportDirectoryPath, CastVoteRecordExportFileName.METADATA),
    metadataFileContents
  );

  return { metadataFileContents };
}
