import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';
import { promises as fs } from 'node:fs';
import { getExportedCastVoteRecordIds } from '@votingworks/utils';
import path from 'node:path';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordReportWithoutMetadataSchema,
  safeParseJson,
} from '@votingworks/types';
import { decryptAes256 } from '../../src/cryptography';

const usageMessage =
  'Usage: decrypt-cvr-ballot-audit-ids input-cvr-directory secret-key-file output-directory';

interface CommandLineArgs {
  inputCvrDirectory: string;
  secretKeyFile: string;
  outputDirectory: string;
}

function parseCommandLineArgs(args: readonly string[]): CommandLineArgs {
  if (args.length !== 3) {
    console.error(usageMessage);
    process.exit(1);
  }
  return {
    inputCvrDirectory: assertDefined(args[0]),
    secretKeyFile: assertDefined(args[1]),
    outputDirectory: assertDefined(args[2]),
  };
}

async function decryptCvrBallotAuditIds({
  inputCvrDirectory,
  secretKeyFile,
  outputDirectory,
}: CommandLineArgs): Promise<void> {
  const cvrIds = await getExportedCastVoteRecordIds(inputCvrDirectory);
  assert(cvrIds.length > 0, 'No CVR IDs found in the input directory');

  const secretKey = await fs.readFile(secretKeyFile, 'utf-8');

  await fs.mkdir(outputDirectory, { recursive: true });

  for (const cvrId of cvrIds) {
    const cvrContents = await fs.readFile(
      path.join(
        inputCvrDirectory,
        cvrId,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      'utf-8'
    );
    const cvrReport = safeParseJson(
      cvrContents,
      CastVoteRecordReportWithoutMetadataSchema
    ).unsafeUnwrap();
    assert(cvrReport.CVR?.length === 1);
    const cvr = assertDefined(cvrReport.CVR[0]);
    const decryptedBallotAuditId = await decryptAes256(
      secretKey,
      assertDefined(cvr.BallotAuditId, `Missing BallotAuditId in CVR: ${cvrId}`)
    );
    await fs.writeFile(
      path.join(outputDirectory, `${decryptedBallotAuditId}.json`),
      JSON.stringify(cvrReport, null, 2),
      'utf-8'
    );
  }
}

/**
 * A script for decrypting CVR ballot audit IDs exported from VxScan.
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    const commandLineArgs = parseCommandLineArgs(args);
    await decryptCvrBallotAuditIds(commandLineArgs);
    process.exit(0);
  } catch (error) {
    console.error(error);
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
