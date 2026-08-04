import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline';
import yauzl from 'yauzl';
import {
  Result,
  assert,
  assertDefined,
  deepEqual,
  err,
  iter,
  ok,
} from '@votingworks/basics';
import {
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  getEntries,
  getEntryStream,
  getFileByName,
  maybeGetFileByName,
  openZip,
  readTextEntry,
  systemLimitViolationToString,
} from '@votingworks/utils';
import * as fs from 'node:fs/promises';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import {
  ElectionPackage,
  ElectionPackageConfigurationError,
  DippedSmartCardAuth,
  InsertedSmartCardAuth,
  ElectionPackageFileName,
  UiStringAudioClip,
  UiStringAudioClipSchema,
  UiStringAudioIdsPackageSchema,
  UiStringsPackageSchema,
  safeParseJson,
  safeParseSystemSettings,
  ElectionPackageMetadataSchema,
  mergeUiStrings,
  UiStringAudioIdsPackage,
  safeParseElectionDefinition,
  constructElectionKey,
  EncodedBallotEntry,
  EncodedBallotEntrySchema,
  SystemLimitViolation,
  SystemLimits,
  ElectionRegisteredVoterCounts,
  ElectionRegisteredVoterCountsSchema,
} from '@votingworks/types';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { sha256 } from 'js-sha256';
import { z } from 'zod/v4';
import { validateElectionDefinitionAgainstSystemLimits } from './system_limits';

/**
 * An error from parsing an election package.
 */
export type ElectionPackageError =
  | {
      type:
        | 'invalid-election'
        | 'invalid-metadata'
        | 'invalid-system-settings'
        | 'invalid-zip';
    }
  | {
      type: 'system-limit-violation';
      violation: SystemLimitViolation;
    };

interface ReadElectionPackageOptions {
  checkMarkScanSystemLimits?: boolean;
  checkMarkSystemLimits?: boolean;
  systemLimitsOverride?: SystemLimits;
}

/**
 * An election package as parsed by the read functions in this module: the
 * bounded metadata only. The unbounded entries (serialized ballots, audio
 * clips) are never parsed into memory; consume them with
 * {@link streamElectionPackageBallots} /
 * {@link streamElectionPackageAudioClips} instead.
 */
export type ParsedElectionPackage = Omit<
  ElectionPackage,
  'ballots' | 'uiStringAudioClips'
>;

/**
 * A {@link ParsedElectionPackage} along with the hash of the raw zip contents
 * it was parsed from.
 */
export interface ParsedElectionPackageWithHash {
  electionPackage: ParsedElectionPackage;
  electionPackageHash: string;
}

const ZIP_NAME = 'election package';

function missingEntryError(name: string): Error {
  return new Error(`${ZIP_NAME} does not have a file called '${name}'`);
}

/**
 * Uniform entry access over an election package zip, whether opened from an
 * in-memory buffer or streamed from a file on disk.
 */
export interface ElectionPackageZip {
  hasEntry(name: string): boolean;
  /** Reads a whole entry into memory as UTF-8 text. Throws if missing. */
  readEntryText(name: string): Promise<string>;
  /** Opens a stream over an entry's contents. Throws if missing. */
  openEntryStream(name: string): Promise<NodeJS.ReadableStream>;
}

type JsZipFile = Awaited<ReturnType<typeof openZip>>;

function createBufferBackedZip(zipFile: JsZipFile): ElectionPackageZip {
  const entries = getEntries(zipFile);
  return {
    hasEntry: (name) => maybeGetFileByName(entries, name) !== undefined,
    readEntryText: (name) =>
      readTextEntry(getFileByName(entries, name, ZIP_NAME)),
    openEntryStream: (name) =>
      Promise.resolve(getEntryStream(getFileByName(entries, name, ZIP_NAME))),
  };
}

/**
 * Opens a zip file with yauzl, indexing its entries so they can be streamed
 * from disk on demand — the file is never read into memory as a whole.
 */
function openFileBackedZip(
  path: string
): Promise<{ zip: ElectionPackageZip; close: () => void }> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false },
      (openError, maybeZipFile) => {
        if (openError) {
          reject(openError);
          return;
        }
        const zipFile = assertDefined(maybeZipFile);
        const entries = new Map<string, yauzl.Entry>();
        zipFile.on('error', reject);
        zipFile.on('entry', (entry: yauzl.Entry) => {
          // Directory entries have no contents to read
          if (!entry.fileName.endsWith('/')) {
            entries.set(entry.fileName, entry);
          }
          zipFile.readEntry();
        });
        zipFile.on('end', () => {
          function openEntryStream(
            name: string
          ): Promise<NodeJS.ReadableStream> {
            const entry = entries.get(name);
            if (!entry) {
              return Promise.reject(missingEntryError(name));
            }
            return new Promise((resolveStream, rejectStream) => {
              zipFile.openReadStream(entry, (streamError, maybeStream) => {
                // istanbul ignore next - stream open failures require zip corruption in exactly the entry's local header
                if (streamError) {
                  rejectStream(streamError);
                  return;
                }
                resolveStream(assertDefined(maybeStream));
              });
            });
          }

          resolve({
            zip: {
              hasEntry: (name) => entries.has(name),
              async readEntryText(name) {
                const stream = await openEntryStream(name);
                const chunks: Buffer[] = [];
                for await (const chunk of stream) {
                  chunks.push(chunk as Buffer);
                }
                const contents = Buffer.concat(chunks);
                return contents.toString('utf-8');
              },
              openEntryStream,
            },
            close: () => zipFile.close(),
          });
        });
        zipFile.readEntry();
      }
    );
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function parseElectionPackage(
  zip: ElectionPackageZip,
  options?: ReadElectionPackageOptions
): Promise<Result<ParsedElectionPackage, ElectionPackageError>> {
  // The election entry is required; check it first so that its missing-file
  // error takes precedence over the other entries'.
  if (!zip.hasEntry(ElectionPackageFileName.ELECTION)) {
    throw missingEntryError(ElectionPackageFileName.ELECTION);
  }

  // Metadata:

  const metadataResult = safeParseJson(
    await zip.readEntryText(ElectionPackageFileName.METADATA),
    ElectionPackageMetadataSchema
  );
  if (metadataResult.isErr()) {
    return err({
      type: 'invalid-metadata',
      message: metadataResult.err().message,
    });
  }
  const metadata = metadataResult.ok();

  // System Settings:

  const systemSettingsData = await zip.readEntryText(
    ElectionPackageFileName.SYSTEM_SETTINGS
  );
  const systemSettingsResult = safeParseSystemSettings(systemSettingsData);
  if (systemSettingsResult.isErr()) {
    return err({
      type: 'invalid-system-settings',
      message: systemSettingsResult.err().message,
    });
  }
  const systemSettings = systemSettingsResult.ok();

  // Election Definition:

  const electionData = await zip.readEntryText(
    ElectionPackageFileName.ELECTION
  );
  const electionResult = safeParseElectionDefinition(electionData);
  if (electionResult.isErr()) {
    return err({
      type: 'invalid-election',
      message: electionResult.err().message,
    });
  }
  const electionDefinition = electionResult.ok();

  // UI Strings:

  const appStrings = safeParseJson(
    await zip.readEntryText(ElectionPackageFileName.APP_STRINGS),
    UiStringsPackageSchema
  ).unsafeUnwrap();

  const uiStrings = mergeUiStrings(
    appStrings,
    electionDefinition.election.ballotStrings
  );

  // UI String Audio IDs:
  //
  // Audio files are optional: VxDesign omits audioIds.json and
  // audioClips.jsonl when audio isn't included in an export, so packages in
  // the field may not have them. Default to empty when absent.

  let uiStringAudioIds: UiStringAudioIdsPackage = {};
  if (zip.hasEntry(ElectionPackageFileName.AUDIO_IDS)) {
    uiStringAudioIds = safeParseJson(
      await zip.readEntryText(ElectionPackageFileName.AUDIO_IDS),
      UiStringAudioIdsPackageSchema
    ).unsafeUnwrap();
  }

  // Registered Voter Counts:
  let registeredVoterCounts: ElectionRegisteredVoterCounts | undefined;
  if (zip.hasEntry(ElectionPackageFileName.REGISTERED_VOTER_COUNTS)) {
    registeredVoterCounts = safeParseJson(
      await zip.readEntryText(ElectionPackageFileName.REGISTERED_VOTER_COUNTS),
      ElectionRegisteredVoterCountsSchema
    ).unsafeUnwrap();
  }

  // TODO(kofi): Verify package version matches machine build version.

  const electionPackage: ParsedElectionPackage = {
    electionDefinition,
    metadata,
    registeredVoterCounts,
    systemSettings,
    uiStrings,
    uiStringAudioIds,
  };

  if (!systemSettings.disableSystemLimitChecks) {
    const validationResult = validateElectionDefinitionAgainstSystemLimits(
      electionDefinition,
      options
    );
    if (validationResult.isErr()) {
      return err({
        type: 'system-limit-violation',
        violation: validationResult.err(),
      });
    }
  }

  return ok(electionPackage);
}

/**
 * Opens the election package zip at `path`, passes it to `fn`, and closes it
 * once `fn` settles. Entries are streamed from disk on demand, so the zip is
 * never read into memory as a whole. Opening once and passing the zip down
 * lets a caller stream several entries — e.g. ballots and audio clips — over a
 * single open file.
 */
export async function withElectionPackageZip<T>(
  path: string,
  fn: (electionPackageZip: ElectionPackageZip) => Promise<T>
): Promise<T> {
  const { zip, close } = await openFileBackedZip(path);
  try {
    return await fn(zip);
  } finally {
    close();
  }
}

/**
 * Parses an package from the given buffer and hashes the raw contents.
 */
export async function readElectionPackageFromBuffer(
  fileContents: Buffer,
  options?: ReadElectionPackageOptions
): Promise<Result<ParsedElectionPackageWithHash, ElectionPackageError>> {
  try {
    const zipFile = await openZip(fileContents);
    const result = await parseElectionPackage(
      createBufferBackedZip(zipFile),
      options
    );
    if (result.isErr()) {
      return result;
    }
    const electionPackageHash = sha256(fileContents);
    return ok({ electionPackage: result.ok(), electionPackageHash });
  } catch (error) {
    return err({
      type: 'invalid-zip',
      message: String(error),
    });
  }
}

/**
 * Attempts to read an election package from the given file path. Entries are
 * streamed from disk on demand rather than reading the whole zip into memory,
 * and the package hash is computed by streaming the raw file through SHA-256
 * (byte-identical to hashing the whole buffer).
 */
export async function readElectionPackageFromFile(
  path: string,
  options?: ReadElectionPackageOptions
): Promise<Result<ParsedElectionPackageWithHash, ElectionPackageError>> {
  try {
    return await withElectionPackageZip(path, async (zip) => {
      const [electionPackageHash, result] = await Promise.all([
        sha256File(path),
        parseElectionPackage(zip, options),
      ]);
      if (result.isErr()) {
        return result;
      }
      return ok({ electionPackage: result.ok(), electionPackageHash });
    });
  } catch (error) {
    return err({
      type: 'invalid-zip',
      message: String(error),
    });
  }
}

// JSONL entries can be MBs each, so batches are capped by size rather than
// count — the peak memory of streaming is roughly one batch
const STREAM_BATCH_MAX_CHARS = 8 * 1024 * 1024;

/**
 * Streams a JSONL entry from an election package zip, yielding parsed batches
 * capped at roughly {@link STREAM_BATCH_MAX_CHARS} of JSONL, so that the full
 * entry contents are never held in memory. Blank lines are skipped.
 *
 * Intended as a second pass after the package has been read and validated;
 * parse errors are unexpected at that point and throw.
 */
export async function* streamElectionPackageJsonlEntry<T>(
  electionPackageZip: ElectionPackageZip,
  entryName: string,
  schema: z.ZodType<T>
): AsyncIterable<T[]> {
  if (!electionPackageZip.hasEntry(entryName)) return;

  const fileLines = readline.createInterface(
    await electionPackageZip.openEntryStream(entryName)
  );
  let batch: T[] = [];
  let batchChars = 0;
  for await (const line of fileLines) {
    if (line.trim().length === 0) continue;
    batch.push(safeParseJson(line, schema).unsafeUnwrap());
    batchChars += line.length;
    if (batchChars >= STREAM_BATCH_MAX_CHARS) {
      yield batch;
      batch = [];
      batchChars = 0;
    }
  }
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Streams the serialized ballots in an election package zip in size-capped
 * batches, so that the full set is never held in memory.
 *
 * Intended as a second pass after the package has been read and validated;
 * parse errors are unexpected at that point and throw.
 */
export function streamElectionPackageBallots(
  electionPackageZip: ElectionPackageZip
): AsyncIterable<EncodedBallotEntry[]> {
  return streamElectionPackageJsonlEntry(
    electionPackageZip,
    ElectionPackageFileName.BALLOTS,
    EncodedBallotEntrySchema
  );
}

/**
 * Streams the UI string audio clips in an election package zip from disk in
 * size-capped batches, so that the full set is never held in memory. Returns
 * the total number of clips streamed (0 if the package has no audio clips
 * file). Clips are not filtered by language; callers should filter against
 * their configured languages.
 *
 * Intended as a second pass after the package has been read and validated;
 * parse errors are unexpected at that point and throw.
 */
export function streamElectionPackageAudioClips(
  electionPackageZip: ElectionPackageZip
): AsyncIterable<UiStringAudioClip[]> {
  return streamElectionPackageJsonlEntry(
    electionPackageZip,
    ElectionPackageFileName.AUDIO_CLIPS,
    UiStringAudioClipSchema
  );
}

/**
 * Finds the most recent election package ZIP in a directory. In practice this
 * is the root of a USB drive mount.
 */
export async function getMostRecentElectionPackageFilepath(
  directory: string
): Promise<Result<string, ElectionPackageConfigurationError>> {
  // Although not all USB drive root directories are election directories, we
  // just check them all. It's not necessary to enforce the naming convention.
  const possibleElectionDirectories = (
    await fs.readdir(directory, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory());

  const electionElectionPackageDirectories: string[] = [];
  for (const possibleElectionDirectory of possibleElectionDirectories) {
    const hasElectionPackageDirectory = (
      await fs.readdir(join(directory, possibleElectionDirectory.name), {
        withFileTypes: true,
      })
    ).some(
      (entry) => entry.isDirectory() && entry.name === ELECTION_PACKAGE_FOLDER
    );

    if (hasElectionPackageDirectory) {
      electionElectionPackageDirectories.push(
        join(directory, possibleElectionDirectory.name, ELECTION_PACKAGE_FOLDER)
      );
    }
  }

  const electionPackageFilePaths: string[] = [];
  for (const electionElectionPackageDirectory of electionElectionPackageDirectories) {
    electionPackageFilePaths.push(
      ...(
        await fs.readdir(electionElectionPackageDirectory, {
          withFileTypes: true,
        })
      )
        .filter(
          (file) =>
            file.isFile() &&
            file.name.endsWith('.zip') &&
            // Ignore hidden files that start with `.`
            !file.name.startsWith('.')
        )
        .map((file) => join(electionElectionPackageDirectory, file.name))
    );
  }

  if (electionPackageFilePaths.length === 0) {
    return err({ type: 'no_election_package' });
  }

  const mostRecentElectionPackageFilePath = assertDefined(
    await iter(electionPackageFilePaths)
      .async()
      .maxBy(async (filePath) => (await fs.lstat(filePath)).ctime.getTime())
  );

  return ok(mostRecentElectionPackageFilePath);
}

/**
 * An election package as read from a signed zip on a USB drive: the bounded
 * metadata only, along with the path of the zip file it was read from. The
 * unbounded entries (serialized ballots, audio clips) are never parsed into
 * memory; consume them with {@link streamElectionPackageBallots} /
 * {@link streamElectionPackageAudioClips} using the file path.
 */
export type ParsedElectionPackageWithFilePath =
  ParsedElectionPackageWithHash & {
    filePath: string;
  };

/**
 * Validates desired auth and returns the election package from a directory if
 * possible, or an error if not possible.
 *
 * @param authStatus AuthStatus representing an inserted card
 * @param directory location to look for the election package and signature
 * @param logger A Logger instance
 */
export async function readSignedElectionPackageFromDirectory(
  authStatus: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus,
  directory: string,
  logger: BaseLogger,
  options?: ReadElectionPackageOptions
): Promise<
  Result<ParsedElectionPackageWithFilePath, ElectionPackageConfigurationError>
> {
  // The frontend tries to prevent election package configuration attempts until an election
  // manager has authed. But we may reach this state if a user removes their card immediately
  // after inserting it, but after the election package configuration attempt has started
  if (authStatus.status !== 'logged_in') {
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package configuration was attempted before auth.',
    });
    return err({ type: 'auth_required_before_election_package_load' });
  }

  // The frontend should prevent non-election manager auth, so we are fine
  // a simple assert to enforce
  assert(
    authStatus.user.role === 'election_manager',
    'Only election managers may configure an election package.'
  );

  const filepathResult = await getMostRecentElectionPackageFilepath(directory);
  if (filepathResult.isErr()) {
    return filepathResult;
  }

  const artifactAuthenticationResult = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  )
    ? ok()
    : await authenticateArtifactUsingSignatureFile({
        type: 'election_package',
        filePath: filepathResult.ok(),
      });
  if (artifactAuthenticationResult.isErr()) {
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package authentication erred.',
    });
    return err({ type: 'election_package_authentication_error' });
  }

  const electionPackageWithHashResult = await readElectionPackageFromFile(
    filepathResult.ok(),
    options
  );
  if (electionPackageWithHashResult.isErr()) {
    const error = electionPackageWithHashResult.err();
    // No other cases should be possible if an election package was signed by VxAdmin and
    // authenticated by the current machine
    assert(error.type === 'system-limit-violation');
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: systemLimitViolationToString(error.violation),
    });
    return err({
      type: 'system_limit_violation',
      violation: error.violation,
    });
  }
  const electionPackageWithHash = electionPackageWithHashResult.unsafeUnwrap();
  const electionKey = constructElectionKey(
    electionPackageWithHash.electionPackage.electionDefinition.election
  );

  if (!deepEqual(authStatus.user.electionKey, electionKey)) {
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message:
        'The election key for the authorized user and most recent election package on the USB drive did not match.',
    });
    return err({ type: 'election_key_mismatch' });
  }

  return ok({ ...electionPackageWithHash, filePath: filepathResult.ok() });
}
