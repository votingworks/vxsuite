/* istanbul ignore file */
import * as fs from 'fs';
import { CVR, safeParse } from '@votingworks/types';
import { ok, err, Result, AsyncIteratorPlus, iter } from '@votingworks/basics';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { ignore } from 'stream-json/filters/Ignore';
import { streamArray } from 'stream-json/streamers/StreamArray';
import Assembler from 'stream-json/Assembler';
import { z } from 'zod';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from '@votingworks/utils';
import { join, parse, relative } from 'path';
import {
  FileSystemEntryType,
  listDirectory,
  ListDirectoryError,
  listDirectoryRecursive,
} from '../list_directory';
import {
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  CVR_BALLOT_LAYOUTS_SUBDIRECTORY,
} from './legacy_export';
import { CastVoteRecordReportMetadata } from './build_report_metadata';

/**
 * Variant of {@link CastVoteRecordReport} in which the `CVR` array is replaced
 * by an asynchronous generator that can be iterated through - and parsed - as
 * needed.
 */
export type CastVoteRecordReportImport = CastVoteRecordReportMetadata & {
  CVR: AsyncIteratorPlus<unknown>;
};

/**
 * Given the path to a JSON CDF cast vote record report, will return a
 * {@link CastVoteRecordReportImport}. The report, excluding the cast vote
 * records themselves, will be parsed upon calling this method. Parsing errors
 * will be returned. Parsing the cast vote records that are yielded
 * asynchronously is the responsibility of the caller.
 */
export async function getCastVoteRecordReportImport(
  reportPath: string
): Promise<Result<CastVoteRecordReportImport, z.ZodError>> {
  const metadataPipeline = chain([
    fs.createReadStream(reportPath),
    parser(),
    ignore({ filter: 'CVR' }),
  ]);

  const metadataAssembler = Assembler.connectTo(metadataPipeline);
  const metadataPromise = new Promise<unknown>((resolve) => {
    metadataAssembler.on('done', () => {
      resolve(metadataAssembler.current);
    });
  });

  const metadataParseResult = safeParse(
    CVR.CastVoteRecordReportSchema,
    await metadataPromise
  );

  if (metadataParseResult.isErr()) {
    return err(metadataParseResult.err());
  }

  const cvrPipeline = chain([
    fs.createReadStream(reportPath),
    parser(),
    pick({ filter: 'CVR' }),
    streamArray(),
    (data) => data.value,
  ]);

  async function* castVoteRecordGenerator() {
    for await (const cvr of cvrPipeline) {
      yield cvr;
    }
  }

  return ok({
    ...metadataParseResult.ok(),
    CVR: iter(castVoteRecordGenerator()),
  });
}

/**
 * Errors that may occur when validating a cast vote record report directory.
 */
export type CastVoteRecordReportDirectoryStructureValidationError =
  | {
      type: 'invalid-directory';
      message: string;
    }
  | { type: 'missing-report'; message: string }
  | { type: 'missing-layouts'; message: string };

/**
 * Result of validating the cast vote record report directory structure.
 * Either a list of relative ballot image file paths or an error.
 */
export type ValidateCastVoteRecordReportDirectoryStructureResult = Result<
  string[],
  CastVoteRecordReportDirectoryStructureValidationError
>;

function invalidDirectoryError(
  error: ListDirectoryError
): ValidateCastVoteRecordReportDirectoryStructureResult {
  return err({
    type: 'invalid-directory',
    message: error.message,
  });
}

/**
 * Validates that the directory fits the structure expected of a cast vote
 * record report directory. If successful, returns a list of the contained
 * ballot images with paths relative to the ballot images root. If not
 * successful, returns {@link CastVoteRecordReportDirectoryStructureValidationError}.
 * This does *not* validate that all ballot images referenced in the report are
 * included in the directory, only that all ballot images have accompanying layouts.
 */
export async function validateCastVoteRecordReportDirectoryStructure(
  directoryAbsolutePath: string
): Promise<ValidateCastVoteRecordReportDirectoryStructureResult> {
  const listDirectoryRootResult = await listDirectory(directoryAbsolutePath);
  if (listDirectoryRootResult.isErr()) {
    return invalidDirectoryError(listDirectoryRootResult.err());
  }

  const rootFileEntries = listDirectoryRootResult.ok();

  const reportFileEntry = rootFileEntries.find(
    (fileEntry) => fileEntry.name === CAST_VOTE_RECORD_REPORT_FILENAME
  );
  if (!reportFileEntry) {
    return err({
      type: 'missing-report',
      message: `Expected a cast vote record report with filename ${CAST_VOTE_RECORD_REPORT_FILENAME} but none was found.`,
    });
  }

  const ballotImageDirectoryEntry = rootFileEntries.find(
    (fileEntry) => fileEntry.name === CVR_BALLOT_IMAGES_SUBDIRECTORY
  );

  if (!ballotImageDirectoryEntry) {
    return ok([]);
  }

  const ballotLayoutsDirectoryEntry = rootFileEntries.find(
    (fileEntry) => fileEntry.name === CVR_BALLOT_LAYOUTS_SUBDIRECTORY
  );

  if (!ballotLayoutsDirectoryEntry) {
    return err({
      type: 'missing-layouts',
      message:
        'Expected ballot images to be accompanied by ballot layouts, but none were found.',
    });
  }

  const listBallotImageContentsResultsGenerator = listDirectoryRecursive(
    join(directoryAbsolutePath, CVR_BALLOT_IMAGES_SUBDIRECTORY)
  );
  const relativeImagePaths: string[] = [];
  for await (const result of listBallotImageContentsResultsGenerator) {
    if (result.isErr()) {
      return invalidDirectoryError(result.err());
    }
    const fileEntry = result.ok();
    if (
      fileEntry.type !== FileSystemEntryType.Directory &&
      (fileEntry.name.endsWith('.jpg') || fileEntry.name.endsWith('.jpeg'))
    ) {
      relativeImagePaths.push(
        relative(
          join(directoryAbsolutePath, CVR_BALLOT_IMAGES_SUBDIRECTORY),
          fileEntry.path
        )
      );
    }
  }

  const listBallotLayoutContentsResultGenerator = listDirectoryRecursive(
    join(directoryAbsolutePath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY)
  );
  const relativeLayoutPaths: string[] = [];
  for await (const result of listBallotLayoutContentsResultGenerator) {
    if (result.isErr()) {
      return invalidDirectoryError(result.err());
    }
    const fileEntry = result.ok();
    if (
      fileEntry.type !== FileSystemEntryType.Directory &&
      fileEntry.name.endsWith('.layout.json')
    ) {
      relativeLayoutPaths.push(
        relative(
          join(directoryAbsolutePath, CVR_BALLOT_LAYOUTS_SUBDIRECTORY),
          fileEntry.path
        )
      );
    }
  }

  for (const relativeImagePath of relativeImagePaths) {
    const imagePathParts = parse(relativeImagePath);
    const hasCorrespondingLayout = relativeLayoutPaths.some(
      (relativeLayoutPath) =>
        relativeLayoutPath ===
        `${join(imagePathParts.dir, imagePathParts.name)}.layout.json`
    );
    if (!hasCorrespondingLayout) {
      return err({
        type: 'missing-layouts',
        message: `Expected ballot image "${relativeImagePath}" to be accompanied by a ballot layout, but none was found.`,
      });
    }
  }

  return ok(relativeImagePaths);
}
