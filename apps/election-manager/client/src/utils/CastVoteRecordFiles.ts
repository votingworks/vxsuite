import arrayUnique from 'array-unique'
import md5 from 'md5'
// eslint-disable-next-line import/no-cycle
import { CastVoteRecord, CastVoteRecordFile } from '../config/types'
import readFileAsync from '../lib/readFileAsync'
// eslint-disable-next-line import/no-cycle
import { parseCVRs } from '../lib/votecounting'

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
function setAdd<T>(set: Set<T>, ...values: T[]): Set<T> {
  return new Set([...set, ...values])
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
  map: Map<K, V>,
  keyfn: (value: V) => K,
  ...values: V[]
): Map<K, V> {
  const result = new Map(map)

  for (const value of values) {
    result.set(keyfn(value), value)
  }

  return result
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
  private readonly signatures: Set<string>
  private readonly files: Set<CastVoteRecordFile>
  private readonly duplicateFilenames: Set<string>
  private readonly parseFailedFilenames: Set<string>
  private readonly allCastVoteRecords: Map<string, CastVoteRecord>

  /**
   * This is your starting point for working with this class as the constructor
   * is private. Build new instances from this starting point.
   */
  public static readonly empty = new CastVoteRecordFiles(
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Map()
  )

  /**
   * This is private. Use `CastVoteRecordFiles.empty` then call `add(file)` or
   * `addAll(files)`.
   */
  private constructor(
    signatures: Set<string>,
    files: Set<CastVoteRecordFile>,
    duplicateFilesnames: Set<string>,
    parseFailedFilenames: Set<string>,
    castVoteRecords: Map<string, CastVoteRecord>
  ) {
    this.signatures = signatures
    this.files = files
    this.duplicateFilenames = duplicateFilesnames
    this.parseFailedFilenames = parseFailedFilenames
    this.allCastVoteRecords = castVoteRecords
  }

  /**
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `files` to those contained by this `CastVoteRecordFiles` instance.
   */
  public async addAll(files: File[]): Promise<CastVoteRecordFiles> {
    let result: CastVoteRecordFiles = this

    for (const file of files) {
      result = await result.add(file)
    }

    return result
  }

  /**
   * Builds a new `CastVoteRecordFiles` object by adding the parsed CVRs from
   * `file` to those contained by this `CastVoteRecordFiles` instance.
   */
  public async add(file: File): Promise<CastVoteRecordFiles> {
    try {
      const fileContent = await readFileAsync(file)
      const signature = md5(fileContent)

      if (this.signatures.has(signature)) {
        return new CastVoteRecordFiles(
          this.signatures,
          this.files,
          setAdd(this.duplicateFilenames, file.name),
          this.parseFailedFilenames,
          this.allCastVoteRecords
        )
      }

      const fileCastVoteRecords = parseCVRs(fileContent)
      const precinctIds = arrayUnique(
        fileCastVoteRecords.map(cvr => cvr._precinctId)
      )

      return new CastVoteRecordFiles(
        setAdd(this.signatures, signature),
        setAdd(this.files, {
          name: file.name,
          count: fileCastVoteRecords.length,
          precinctIds,
        }),
        this.duplicateFilenames,
        this.parseFailedFilenames,
        mapAdd(
          this.allCastVoteRecords,
          cvr => cvr._ballotId,
          ...fileCastVoteRecords
        )
      )
    } catch (error) {
      return new CastVoteRecordFiles(
        this.signatures,
        this.files,
        this.duplicateFilenames,
        setAdd(this.parseFailedFilenames, file.name),
        this.allCastVoteRecords
      )
    }
  }

  /**
   * The last filename that failed to add.
   */
  public get errorFile(): string | undefined {
    return [...this.parseFailedFilenames].pop()
  }

  /**
   * All the added CVR files.
   */
  public get fileList(): CastVoteRecordFile[] {
    return [...this.files]
  }

  /**
   * Names of the files that have been added more than once.
   */
  public get duplicateFiles(): string[] {
    return [...this.duplicateFilenames]
  }

  /**
   * All parsed CVRs from the added files.
   */
  public get castVoteRecords(): CastVoteRecord[] {
    return [...this.allCastVoteRecords.values()]
  }
}
