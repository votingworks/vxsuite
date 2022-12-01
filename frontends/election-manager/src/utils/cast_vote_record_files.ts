import { CastVoteRecord, Election } from '@votingworks/types';
import {
  assert,
  parseCvrFileInfoFromFilename,
  parseCvrs,
} from '@votingworks/utils';
import arrayUnique from 'array-unique';
import { sha256 } from 'js-sha256';
import {
  CastVoteRecordFile,
  CastVoteRecordFilePreprocessedData,
} from '../config/types';
import { readFileAsync } from '../lib/read_file_async';

/**
 * Adds elements to a set by creating a new set with the contents of the
 * original as well as the new ones. The original set is not modified.
 *
 * @example
 *
 * const set = new Set([1, 2, 3])
 * setAdd(set, 4, 5) // Set { 1, 2, 3, 4, 5 }
 * setAdd(set, 6, 7) // Set { 1, 2, 3, 6, 7 }
 * set               // Set { 1, 2, 3 }
 */
function setAdd<T>(set: ReadonlySet<T>, ...values: T[]): Set<T> {
  return new Set([...set, ...values]);
}

/**
 * Adds values to a map by creating a new map with the contents of the
 * original as well as the new ones. Keys are provided by `keyfn` which should
 * map values to a key.
 *
 * @example
 *
 * const map = new Map([[1, { id: 1 }]])
 * mapAdd(map, value => value.id, { id: 2 }) // Map { 1 => { id: 1 }, 2 => { id: 2 } }
 * mapAdd(map, value => value.id, { id: 3 }) // Map { 1 => { id: 1 }, 3 => { id: 3 } }
 * map                                       // Map { 1 => { id: 1 } }
 */
function mapAdd<K, V>(
  map: ReadonlyMap<K, V>,
  keyfn: (value: V) => K,
  ...values: V[]
): Map<K, V> {
  const result = new Map(map);

  for (const value of values) {
    const newKey = keyfn(value);
    // If the key is already in the map, remove it before re-adding it.
    if (result.has(newKey)) {
      result.delete(newKey);
    }
    result.set(newKey, value);
  }

  return result;
}

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

/**
 * Tracks files containing cast vote records (CVRs). Has special handling for
 * duplicate files, files that fail to parse as CVRs, etc.
 *
 * Instances of this class are immutable, so all methods that would change the
 * data simply return a new instance. The constructor is private, so start with
 * `CastVoteRecordFiles.empty` and "mutate" from there.
 *
 * @example
 *
 * const cvrFiles = CastVoteRecordFiles.empty.addAll(
 *   [file1, file1, file2, badFile]
 * )
 *
 * cvrFiles.fileList.map(file => file.name) // ['file1.txt', 'file2.txt']
 * cvrFiles.duplicateFiles                  // ['file1.txt']
 * cvrFiles.errorFile                       // 'badfile.txt'
 * cvrFiles.castVoteRecords                 // […]
 */
export class CastVoteRecordFiles {
  /**
   * This is your starting point for working with this class as the constructor
   * is private. Build new instances from this starting point.
   */
  static readonly empty = new CastVoteRecordFiles(
    new Set(),
    new Set(),
    new Set(),
    new Map(),
    new Map()
  );

  /**
   * This is private. Use `CastVoteRecordFiles.empty` then call `add(file)` or
   * `addAll(files)`.
   */
  private constructor(
    private readonly signatures: ReadonlySet<string>,
    private readonly files: ReadonlySet<CastVoteRecordFile>,
    private readonly duplicateFilenames: ReadonlySet<string>,
    private readonly parseFailedErrors: ReadonlyMap<string, string>,
    private readonly deduplicatedCastVoteRecords: ReadonlyMap<
      string,
      CastVoteRecord
    >
  ) {}

  /**
   * Import from exported localStorage string
   */
  static import(stringifiedCvrFiles: string): CastVoteRecordFiles {
    // TODO use zod schemas for constructing/deconstructing this.
    const { signatures, files, duplicateFilenames, parseFailedErrors } =
      JSON.parse(stringifiedCvrFiles);
    const deduplicatedCastVoteRecords = new Map<string, CastVoteRecord>();
    const filesWithDates = [];
    for (const file of files) {
      let duplicatedCount = 0;
      for (const cvr of file.allCastVoteRecords) {
        if (deduplicatedCastVoteRecords.has(cvr._ballotId)) {
          duplicatedCount += 1;
        } else {
          deduplicatedCastVoteRecords.set(cvr._ballotId, cvr);
        }
      }
      assert(duplicatedCount === file.duplicatedCvrCount);
      filesWithDates.push({
        ...(file as CastVoteRecordFile),
        exportTimestamp: new Date(file.exportTimestamp),
      });
    }
    return new CastVoteRecordFiles(
      new Set(signatures),
      new Set(filesWithDates),
      new Set(duplicateFilenames),
      new Map(parseFailedErrors),
      deduplicatedCastVoteRecords
    );
  }

  /**
   * Export to localStorage string
   */
  export(): string {
    return JSON.stringify({
      signatures: [...this.signatures],
      files: [...this.files],
      duplicateFilenames: [...this.duplicateFilenames],
      parseFailedErrors: [...this.parseFailedErrors],
    });
  }

  /**
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `files` to those contained by this `CastVoteRecordFiles` instance.
   */
  async addAll(
    files: File[],
    election: Election
  ): Promise<CastVoteRecordFiles> {
    let result: CastVoteRecordFiles = this; // eslint-disable-line @typescript-eslint/no-this-alias

    for (const file of files) {
      result = await result.add(file, election);
    }

    return result;
  }

  /**
   * Parses the filenames for the given CVR {@link files} for information about
   * the CVRs they contain.
   *
   * TODO: After a few rounds of refactoring, this is now mostly just a proxy to
   * {@link parseCvrFileInfoFromFilename} - should consolidate at some point.
   */
  static parseAllFromFileSystemEntries(
    files: KioskBrowser.FileSystemEntry[]
  ): CastVoteRecordFilePreprocessedData[] {
    const results: CastVoteRecordFilePreprocessedData[] = [];
    for (const file of files) {
      try {
        const parsedFileInfo = parseCvrFileInfoFromFilename(file.name);
        if (parsedFileInfo) {
          results.push({
            exportTimestamp: parsedFileInfo.timestamp,
            cvrCount: parsedFileInfo.numberOfBallots,
            isTestModeResults: parsedFileInfo.isTestModeResults,
            name: file.name,
            path: file.path,
            scannerIds: [parsedFileInfo.machineId],
          });
        }
      } catch (error) {
        // The file isn't able to be read or isn't a valid CVR file for loading and could not be processed.
        // Only valid CVR files will be returned by this function so ignore this file and continue processing the rest.
        continue;
      }
    }

    return results;
  }

  /**
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `file` to those contained by this `CastVoteRecordFiles` instance.
   */
  async add(file: File, election: Election): Promise<CastVoteRecordFiles> {
    try {
      const fileContent = await readFileAsync(file);
      const parsedFileInfo = parseCvrFileInfoFromFilename(file.name);
      const result = this.addFromFileContent(
        fileContent,
        file.name,
        parsedFileInfo?.timestamp || new Date(file.lastModified),
        election
      );
      return result;
    } catch (error) {
      assert(error instanceof Error);
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        mapAdd(this.parseFailedErrors, () => file.name, error.message),
        this.deduplicatedCastVoteRecords
      );
    }
  }

  private addFromFileContent(
    fileContent: string,
    fileName: string,
    exportTimestamp: Date,
    election: Election
  ): CastVoteRecordFiles {
    try {
      const signature = sha256(fileContent);

      if (this.signatures.has(signature)) {
        return new CastVoteRecordFiles(
          this.signatures,
          this.files,
          setAdd(this.duplicateFilenames, fileName),
          this.parseFailedErrors,
          this.deduplicatedCastVoteRecords
        );
      }

      const fileCastVoteRecords: CastVoteRecord[] = [];

      for (const { cvr, errors, lineNumber } of parseCvrs(
        fileContent,
        election
      )) {
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

      const [deduplicatedCastVoteRecords, duplicateCount] =
        this.addUniqueCastVoteRecordsToCurrentCollection(fileCastVoteRecords);

      if (mixedTestModeCvrs(deduplicatedCastVoteRecords.values())) {
        throw new Error(
          'These CVRs cannot be tabulated together because they mix live and test ballots'
        );
      }

      return new CastVoteRecordFiles(
        setAdd(this.signatures, signature),
        setAdd(this.files, {
          name: fileName,
          importedCvrCount: fileCastVoteRecords.length - duplicateCount,
          duplicatedCvrCount: duplicateCount,
          precinctIds,
          scannerIds,
          exportTimestamp,
          allCastVoteRecords: fileCastVoteRecords,
        }),
        this.duplicateFilenames,
        this.parseFailedErrors,
        deduplicatedCastVoteRecords
      );
    } catch (error) {
      assert(error instanceof Error);
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        mapAdd(this.parseFailedErrors, () => fileName, error.message),
        this.deduplicatedCastVoteRecords
      );
    }
  }

  addUniqueCastVoteRecordsToCurrentCollection(
    castVoteRecords: CastVoteRecord[]
  ): [Map<string, CastVoteRecord>, number] {
    let duplicateCount = 0;
    const deduplicatedCastVoteRecords = new Map(
      this.deduplicatedCastVoteRecords
    );
    for (const cvr of castVoteRecords) {
      if (deduplicatedCastVoteRecords.has(cvr._ballotId as string)) {
        duplicateCount += 1;
      } else {
        deduplicatedCastVoteRecords.set(cvr._ballotId as string, cvr);
      }
    }
    return [deduplicatedCastVoteRecords, duplicateCount];
  }

  /**
   * The error for the last file that failed.
   */
  get lastError(): { filename: string; message: string } | undefined {
    const last = [...this.parseFailedErrors].pop();
    return last ? { filename: last[0], message: last[1] } : undefined;
  }

  /**
   * All the added CVR files.
   */
  get fileList(): CastVoteRecordFile[] {
    return [...this.files];
  }

  /**
   * Names of the files that have been added more than once.
   */
  get duplicateFiles(): string[] {
    return [...this.duplicateFilenames];
  }

  /**
   * All parsed CVRs from the added files.
   */
  get castVoteRecords(): IterableIterator<CastVoteRecord> {
    return this.deduplicatedCastVoteRecords.values();
  }

  /**
   * Whether CVR files were added, even if adding failed with an error.
   */
  get wereAdded(): boolean {
    return this.fileList.length > 0 || Boolean(this.lastError);
  }
}
