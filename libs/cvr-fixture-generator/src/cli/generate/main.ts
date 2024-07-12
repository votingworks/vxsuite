import {
  BallotType,
  BatchInfo,
  CVR,
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  ballotPaperDimensions,
} from '@votingworks/types';
import { assert, assertDefined, iter } from '@votingworks/basics';
import {
  buildCastVoteRecordReportMetadata,
  buildBatchManifest,
} from '@votingworks/backend';
import { readElection } from '@votingworks/fs';
import * as fs from 'fs';
import yargs from 'yargs/yargs';
import { writeImageData, createImageData } from '@votingworks/image-utils';
import { basename, join, parse } from 'path';
import {
  computeCastVoteRecordRootHashFromScratch,
  prepareSignatureFile,
} from '@votingworks/auth';
import { sha256 } from 'js-sha256';
import {
  generateBallotPageLayouts,
  generateCvrs,
  populateImageAndLayoutFileHashes,
} from '../../generate_cvrs';
import { replaceUniqueId, getBatchIdForScannerId } from '../../utils';

/**
 * Script to generate a cast vote record file for a given election.
 * Run from the command-line with:
 *
 * ./bin/generate -h
 *
 * To see more information and all possible arguments.
 */

export const DEFAULT_SCANNER_ID = 'VX-00-000';

interface GenerateCvrFileArguments {
  electionDefinition?: string;
  outputPath?: string;
  numBallots?: number;
  scannerIds?: Array<string | number>;
  officialBallots: boolean;
  ballotIdPrefix?: string;
  help?: boolean;
  [x: string]: unknown;
}

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

/**
 * Command line interface for generating a cast vote record file.
 *
 * TODO: Make more full use of export functions in libs/backend to avoid duplicating logic.
 */
export async function main(
  argv: readonly string[],
  { stdout, stderr }: IO
): Promise<number> {
  let exitCode: number | undefined;
  const optionParser = yargs()
    .strict()
    .exitProcess(false)
    .options({
      electionDefinition: {
        type: 'string',
        alias: 'p',
        description: 'Path to the election definition.',
      },
      outputPath: {
        type: 'string',
        alias: 'o',
        description:
          'Path of directory to use as root of generated cast vote record output.',
      },
      numBallots: {
        type: 'number',
        description: 'Number of ballots to include in the output.',
      },
      officialBallots: {
        type: 'boolean',
        default: false,
        description:
          'Create live mode ballots when specified, by default test mode ballots are created.',
      },
      scannerIds: {
        type: 'array',
        description: 'Creates ballots for each scanner id specified.',
      },
      ballotIdPrefix: {
        type: 'string',
        description:
          'If included, applies a prefix to the ballot ids. E.g. "p-456" instead of "456"',
      },
    })
    .alias('-h', '--help')
    .help(false)
    .version(false)
    .fail((msg) => {
      stderr.write(`${msg}\n`);
      exitCode = 1;
    });

  const args = (await optionParser.parse(
    argv.slice(2)
  )) as GenerateCvrFileArguments;

  if (typeof exitCode !== 'undefined') {
    return exitCode;
  }

  if (args.help) {
    optionParser.showHelp((out) => {
      stdout.write(out);
      stdout.write('\n');
    });
    return 0;
  }

  if (!args.electionDefinition) {
    stderr.write('Missing election definition\n');
    return 1;
  }

  if (!args.outputPath) {
    stderr.write('Missing output path\n');
    return 1;
  }

  if (args.scannerIds && args.scannerIds.length < 1) {
    stderr.write(
      'Must specify at least one scanner id with --scannerIds option\n'
    );
    return 1;
  }

  const {
    outputPath,
    electionDefinition: electionDefinitionPath,
    ballotIdPrefix,
  } = args;
  const testMode = !args.officialBallots;

  const scannerIds = (args.scannerIds ?? [DEFAULT_SCANNER_ID]).map(
    (s) => `${s}`
  );

  const electionDefinition = (
    await readElection(electionDefinitionPath)
  ).unsafeUnwrap();

  const castVoteRecords = iter(
    generateCvrs({
      electionDefinition,
      testMode,
      scannerIds,
      ballotIdPrefix,
    })
  ).toArray();

  const uniqueCastVoteRecordCount = castVoteRecords.length;
  const numBallots = args.numBallots || uniqueCastVoteRecordCount;
  // Modify results to match the desired number of ballots
  if (numBallots < uniqueCastVoteRecordCount) {
    stderr.write(
      `WARNING: At least ${uniqueCastVoteRecordCount} are suggested to be generated for maximum coverage of ballot metadata options and possible contest votes.\n`
    );
    // Remove random entries from the CVR list until the desired number of ballots is reached
    while (numBallots < castVoteRecords.length) {
      const i = Math.floor(Math.random() * castVoteRecords.length);
      castVoteRecords.splice(i, 1);
    }
  }

  let ballotId = castVoteRecords.length;
  // Duplicate random ballots until the desired number of ballots is reached.
  while (numBallots > castVoteRecords.length) {
    const i = Math.floor(Math.random() * uniqueCastVoteRecordCount);
    const castVoteRecord = castVoteRecords[i];
    assert(castVoteRecord);

    // we need each cast vote record to have a unique id
    const newCastVoteRecord = replaceUniqueId(
      castVoteRecord,
      ballotIdPrefix ? `${ballotIdPrefix}-${ballotId}` : ballotId.toString()
    );

    castVoteRecords.push(newCastVoteRecord);
    ballotId += 1;
  }

  const { election, electionHash } = electionDefinition;
  const batchInfo: Array<BatchInfo & { scannerId: string }> = scannerIds.map(
    (scannerId) => ({
      id: getBatchIdForScannerId(scannerId),
      batchNumber: 1,
      label: getBatchIdForScannerId(scannerId),
      startedAt: new Date().toISOString(),
      count: castVoteRecords.length / scannerIds.length,
      scannerId,
    })
  );
  const reportMetadata = buildCastVoteRecordReportMetadata({
    election,
    electionId: electionHash,
    generatingDeviceId: assertDefined(scannerIds[0]),
    scannerIds,
    reportTypes: [CVR.ReportType.OriginatingDeviceExport],
    isTestMode: testMode,
    batchInfo,
  });

  // make the parent folder if it does not exist
  fs.mkdirSync(outputPath, { recursive: true });

  for (const castVoteRecord of castVoteRecords) {
    const castVoteRecordDirectory = join(outputPath, castVoteRecord.UniqueId);
    fs.mkdirSync(castVoteRecordDirectory);

    if (castVoteRecord.BallotImage) {
      const layouts = generateBallotPageLayouts(election, {
        ballotStyleId: castVoteRecord.BallotStyleId,
        ballotType: BallotType.Precinct,
        electionHash,
        isTestMode: testMode,
        precinctId: castVoteRecord.BallotStyleUnitId,
      });
      for (const i of [0, 1] as const) {
        const imageFilePath = join(
          castVoteRecordDirectory,
          assertDefined(castVoteRecord.BallotImage[i]?.Location).replace(
            'file:',
            ''
          )
        );
        const layoutFilePath = imageFilePath.replace('.jpg', '.layout.json');

        const { width, height } = ballotPaperDimensions(
          election.ballotLayout.paperSize
        );
        const pageDpi = 200;
        await writeImageData(
          imageFilePath,
          createImageData(
            new Uint8ClampedArray(width * pageDpi * height * pageDpi * 4),
            width * pageDpi,
            height * pageDpi
          )
        );

        const layout = layouts[i];
        let layoutFileHash = sha256('bmd-ballot');
        if (layout) {
          const layoutFileContents = JSON.stringify(layout);
          fs.writeFileSync(layoutFilePath, layoutFileContents);
          layoutFileHash = sha256(layoutFileContents);
        }

        const imageHash = sha256(fs.readFileSync(imageFilePath));
        populateImageAndLayoutFileHashes(
          assertDefined(castVoteRecord.BallotImage[i]),
          { imageHash, layoutFileHash }
        );
      }
    }

    const castVoteRecordReport: CVR.CastVoteRecordReport = {
      ...reportMetadata,
      CVR: [castVoteRecord],
    };
    fs.writeFileSync(
      join(
        castVoteRecordDirectory,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      JSON.stringify(castVoteRecordReport)
    );
  }

  const castVoteRecordExportMetadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: reportMetadata,
    castVoteRecordRootHash:
      await computeCastVoteRecordRootHashFromScratch(outputPath),
    batchManifest: buildBatchManifest({ batchInfo }),
  };
  const metadataFileContents = JSON.stringify(castVoteRecordExportMetadata);
  fs.writeFileSync(
    join(outputPath, CastVoteRecordExportFileName.METADATA),
    metadataFileContents
  );

  process.env['VX_MACHINE_TYPE'] = 'scan'; // Required by prepareSignatureFile
  const signatureFile = await prepareSignatureFile({
    type: 'cast_vote_records',
    context: 'export',
    directoryName: basename(outputPath),
    metadataFileContents,
  });
  fs.writeFileSync(
    join(parse(outputPath).dir, signatureFile.fileName),
    signatureFile.fileContents
  );

  stdout.write(
    `Wrote ${castVoteRecords.length} cast vote records to ${outputPath}\n`
  );

  return 0;
}
