import arrayUnique from 'array-unique';
import { sha256 } from 'js-sha256';
import { CastVoteRecord, Election } from '@votingworks/types';
import {
  assert,
  parseCvrFileInfoFromFilename,
  typedAs,
} from '@votingworks/utils';
import {
  CastVoteRecordFile,
  CastVoteRecordFilePreprocessedData,
} from '../config/types';
import { readFileAsync } from '../lib/read_file_async';
import { parseCvrs } from '../lib/votecounting';

function mixedTestModeCvrs(castVoteRecords: IterableIterator<CastVoteRecord>) {
  let liveSeen = false;
  let testSeen = false;
  for (const cvr of castVoteRecords) {
    liveSeen = liveSeen || !cvr._testBallot;
    testSeen = testSeen || cvr._testBallot;

    if (liveSeen && testSeen) {
      return true;
    }
  }

  return false;
}

async function importCastVoteRecordFromFileContent(
  fileContent: string,
  fileName: string,
  exportTimestamp: Date,
  election: Election,
  importedCastVoteRecordFiles: CastVoteRecordFile[]
): Promise<CastVoteRecordFile> {
  const signature = sha256(fileContent);

  if (
    importedCastVoteRecordFiles.filter((c) => c.signature === signature)
      .length > 0
  ) {
    throw new Error('Duplicate File Imported.');
  }

  const fileCastVoteRecords: CastVoteRecord[] = [];

  for (const { cvr, errors, lineNumber } of parseCvrs(fileContent, election)) {
    if (errors.length) {
      throw new Error(`Line ${lineNumber}: ${errors.join('\n')}`);
    }

    fileCastVoteRecords.push(cvr);
  }

  const scannerIds = arrayUnique(
    fileCastVoteRecords.map((cvr) => cvr._scannerId)
  );

  const precinctIds = arrayUnique(
    fileCastVoteRecords.map((cvr) => cvr._precinctId)
  );

  if (mixedTestModeCvrs(fileCastVoteRecords.values())) {
    throw new Error(
      'These CVRs cannot be tabulated together because they mix live and test ballots'
    );
  }

  const response = await fetch('/admin/write-ins/cvrs', {
    method: 'POST',
    body: JSON.stringify({
      signature,
      name: fileName,
      precinctIds,
      scannerIds,
      timestamp: exportTimestamp,
      castVoteRecords: fileCastVoteRecords,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  return typedAs<CastVoteRecordFile>({
    signature,
    name: fileName,
    precinctIds,
    scannerIds,
    exportTimestamp,
    importedCvrCount: data.importedCvrCount,
    duplicatedCvrCount: data.duplicatedCvrCount,
    isTestMode: data.isTestMode === 'true',
  });
}

export async function importCastVoteRecordFromFileData(
  fileData: CastVoteRecordFilePreprocessedData,
  election: Election,
  importedCastVoteRecordFiles: CastVoteRecordFile[]
): Promise<CastVoteRecordFile> {
  assert(window.kiosk);
  return await importCastVoteRecordFromFileContent(
    fileData.fileContent,
    fileData.name,
    fileData.exportTimestamp,
    election,
    importedCastVoteRecordFiles
  );
}

export async function importCastVoteRecordFromFile(
  file: File,
  election: Election,
  importedCastVoteRecordFiles: CastVoteRecordFile[]
): Promise<CastVoteRecordFile> {
  const fileContent = await readFileAsync(file);
  const parsedFileInfo = parseCvrFileInfoFromFilename(file.name);
  const result = importCastVoteRecordFromFileContent(
    fileContent,
    file.name,
    parsedFileInfo?.timestamp || new Date(file.lastModified),
    election,
    importedCastVoteRecordFiles
  );
  return result;
}

function parseFromFileContent(
  fileContent: string,
  fileName: string,
  exportTimestamp: Date,
  scannerId: string,
  fallbackTestMode: boolean,
  election: Election,
  importedBallotIds: Set<string>
): CastVoteRecordFilePreprocessedData {
  const fileCastVoteRecords: CastVoteRecord[] = [];
  let testBallotSeen = false;
  let liveBallotSeen = false;

  for (const { cvr } of parseCvrs(fileContent, election)) {
    fileCastVoteRecords.push(cvr);
    if (cvr._testBallot) {
      testBallotSeen = true;
    } else {
      liveBallotSeen = true;
    }
    if (testBallotSeen && liveBallotSeen) {
      throw new Error(
        'These CVRs cannot be tabulated together because they mix live and test ballots'
      );
    }
  }

  const scannerIds = arrayUnique(
    fileCastVoteRecords.map((cvr) => cvr._scannerId)
  );

  let duplicateCount = 0;
  for (const cvr of fileCastVoteRecords) {
    if (importedBallotIds.has(cvr._ballotId)) {
      duplicateCount += 1;
    }
  }

  return {
    name: fileName,
    newCvrCount: fileCastVoteRecords.length - duplicateCount,
    importedCvrCount: duplicateCount,
    scannerIds: scannerIds.length > 0 ? scannerIds : [scannerId],
    exportTimestamp,
    isTestModeResults:
      testBallotSeen || liveBallotSeen ? testBallotSeen : fallbackTestMode,
    fileContent,
    fileImported: false,
  };
}

export async function parseAllFromFileSystemEntries(
  files: KioskBrowser.FileSystemEntry[],
  election: Election,
  importedBallotIds: Set<string>,
  castVoteRecordFiles: CastVoteRecordFile[]
): Promise<CastVoteRecordFilePreprocessedData[]> {
  const results: CastVoteRecordFilePreprocessedData[] = [];
  for (const file of files) {
    const parsedFileInfo = parseCvrFileInfoFromFilename(file.name);
    try {
      const importedFile = castVoteRecordFiles.find(
        (f) => f.name === file.name
      );
      if (importedFile) {
        results.push({
          fileImported: true,
          newCvrCount: 0,
          importedCvrCount: importedFile.importedCvrCount,
          scannerIds: importedFile.scannerIds,
          exportTimestamp: importedFile.exportTimestamp,
          isTestModeResults: importedFile.isTestMode,
          fileContent: '',
          name: file.name,
        });
      } else {
        assert(window.kiosk);
        const fileContent = await window.kiosk.readFile(file.path, 'utf-8');
        const parsedFile = parseFromFileContent(
          fileContent,
          file.name,
          parsedFileInfo?.timestamp || new Date(file.mtime),
          parsedFileInfo?.machineId || '',
          parsedFileInfo?.isTestModeResults ?? false,
          election,
          importedBallotIds
        );
        results.push(parsedFile);
      }
    } catch (error) {
      // The file isn't able to be read or isn't a valid CVR file for import and could not be processed.
      // Only valid CVR files will be returned by this function so ignore this file and continue processing the rest.
      continue;
    }
  }

  return results;
}
