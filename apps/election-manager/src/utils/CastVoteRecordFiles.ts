import { strict as assert } from 'assert';
import arrayUnique from 'array-unique';
import { sha256 } from 'js-sha256';
import { Election } from '@votingworks/types';
import { parseCVRFileInfoFromFilename } from '@votingworks/utils';
import {
  CastVoteRecord,
  CastVoteRecordFile,
  CastVoteRecordLists,
  CastVoteRecordFileMode,
} from '../config/types';
import readFileAsync from '../lib/readFileAsync';
import { parseCVRs } from '../lib/votecounting';

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
    result.set(keyfn(value), value);
  }

  return result;
}

function mixedTestModeCVRs(
  castVoteRecords: ReadonlyArray<readonly CastVoteRecord[]>
) {
  let liveSeen = false;
  let testSeen = false;
  for (const cvrs of castVoteRecords) {
    for (const cvr of cvrs) {
      liveSeen = liveSeen || !cvr._testBallot;
      testSeen = testSeen || cvr._testBallot;

      if (liveSeen && testSeen) {
        return true;
      }
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
export default class CastVoteRecordFiles {
  /**
   * This is your starting point for working with this class as the constructor
   * is private. Build new instances from this starting point.
   */
  static readonly empty = new CastVoteRecordFiles(
    new Set(),
    new Set(),
    new Set(),
    new Map(),
    []
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
    private readonly allCastVoteRecords: ReadonlyArray<
      readonly CastVoteRecord[]
    >
  ) {}

  /**
   * Import from exported localStorage string
   */
  static import(stringifiedCVRFiles: string): CastVoteRecordFiles {
    const {
      signatures,
      files,
      duplicateFilenames,
      parseFailedErrors,
      allCastVoteRecords,
    } = JSON.parse(stringifiedCVRFiles);
    return new CastVoteRecordFiles(
      new Set(signatures),
      new Set(files),
      new Set(duplicateFilenames),
      new Map(parseFailedErrors),
      allCastVoteRecords
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
      allCastVoteRecords: this.allCastVoteRecords,
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
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `files` to those contained by this `CastVoteRecordFiles` instance.
   */
  async addAllFromFileSystemEntries(
    files: KioskBrowser.FileSystemEntry[],
    election: Election
  ): Promise<CastVoteRecordFiles> {
    let result: CastVoteRecordFiles = this; // eslint-disable-line @typescript-eslint/no-this-alias

    for (const file of files) {
      result = await result.addFromFileSystemEntry(file, election);
    }

    return result;
  }

  /**
   *  Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `file` to those contained by this `CastVoteRecordFiles` instance.
   */
  async addFromFileSystemEntry(
    file: KioskBrowser.FileSystemEntry,
    election: Election
  ): Promise<CastVoteRecordFiles> {
    try {
      assert(window.kiosk);
      const fileContent = await window.kiosk.readFile(file.path, 'utf-8');
      const parsedFileInfo = parseCVRFileInfoFromFilename(file.name);
      return await this.addFromFileContent(
        fileContent,
        file.name,
        parsedFileInfo?.timestamp || new Date(file.mtime),
        election
      );
    } catch (error) {
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        mapAdd(this.parseFailedErrors, () => file.name, error.message),
        this.allCastVoteRecords
      );
    }
  }

  /**
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `file` to those contained by this `CastVoteRecordFiles` instance.
   */
  async add(file: File, election: Election): Promise<CastVoteRecordFiles> {
    try {
      const fileContent = await readFileAsync(file);
      const parsedFileInfo = parseCVRFileInfoFromFilename(file.name);
      return await this.addFromFileContent(
        fileContent,
        file.name,
        parsedFileInfo?.timestamp || new Date(file.lastModified),
        election
      );
    } catch (error) {
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        mapAdd(this.parseFailedErrors, () => file.name, error.message),
        this.allCastVoteRecords
      );
    }
  }

  private async addFromFileContent(
    fileContent: string,
    fileName: string,
    exportTimestamp: Date,
    election: Election
  ): Promise<CastVoteRecordFiles> {
    try {
      const signature = sha256(fileContent);

      if (this.signatures.has(signature)) {
        return new CastVoteRecordFiles(
          this.signatures,
          this.files,
          setAdd(this.duplicateFilenames, fileName),
          this.parseFailedErrors,
          this.allCastVoteRecords
        );
      }

      const fileCastVoteRecords: CastVoteRecord[] = [];

      for (const { cvr, errors, lineNumber } of parseCVRs(
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

      const newCastVoteRecords = [
        ...this.allCastVoteRecords,
        fileCastVoteRecords,
      ];

      if (mixedTestModeCVRs(newCastVoteRecords)) {
        throw new Error(
          'These CVRs cannot be tabulated together because they mix live and test ballots'
        );
      }

      return new CastVoteRecordFiles(
        setAdd(this.signatures, signature),
        setAdd(this.files, {
          name: fileName,
          count: fileCastVoteRecords.length,
          precinctIds,
          scannerIds,
          exportTimestamp,
        }),
        this.duplicateFilenames,
        this.parseFailedErrors,
        newCastVoteRecords
      );
    } catch (error) {
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        mapAdd(this.parseFailedErrors, () => fileName, error.message),
        this.allCastVoteRecords
      );
    }
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
  get castVoteRecords(): CastVoteRecordLists {
    return this.allCastVoteRecords;
  }

  /**
   * Gets the file mode for the set of CVR files.
   */
  get fileMode(): CastVoteRecordFileMode | undefined {
    let liveSeen = false;
    for (const cvrs of this.allCastVoteRecords) {
      for (const cvr of cvrs) {
        if (cvr._testBallot) {
          return 'test';
        }
        liveSeen = true;
      }
    }
    return liveSeen ? 'live' : undefined;
  }

  filenameAlreadyImported(filename: string): boolean {
    for (const file of this.files) {
      if (file.name === filename) {
        return true;
      }
    }
    return this.duplicateFilenames.has(filename);
  }
}

export type SaveCastVoteRecordFiles = (
  value?: CastVoteRecordFiles
) => Promise<void>;
