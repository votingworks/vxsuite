/* istanbul ignore file */
import {
  BallotPageMetadata,
  BallotType,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { writeImageData } from '@votingworks/image-utils';
import { RealIo, Stdio } from '.';
import { encodeMetadata } from '../encode_metadata';

const USAGE =
  'Usage: encode-metadata <election.json> <qr-code | timing-mark> <output.png>\n';

/**
 * Encodes election metadata into a QR code or series of timing marks.
 */
export async function main(
  args: readonly string[],
  io: Stdio = RealIo
): Promise<number> {
  const [electionPath, encoding, outputPath] = args;
  if (!electionPath || !encoding || !outputPath) {
    io.stderr.write(USAGE);
    return 1;
  }

  const { election, electionHash } = safeParseElectionDefinition(
    await readFile(electionPath, 'utf-8')
  ).unsafeUnwrap();

  if (!(encoding === 'qr-code' || encoding === 'timing-marks')) {
    io.stderr.write(USAGE);
    io.stderr.write(
      'Error: Encoding must be either "qr-code" or "timing-marks"\n'
    );
    return 1;
  }

  if (!outputPath.endsWith('.png')) {
    io.stderr.write(USAGE);
    io.stderr.write('Error: Output file must be a PNG file\n');
    return 1;
  }

  for (const isTestMode of [true, false]) {
    for (const ballotStyle of election.ballotStyles) {
      for (const precinctId of ballotStyle.precincts) {
        const metadata: BallotPageMetadata = {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          isTestMode,
          electionHash,
          pageNumber: 1,
        };

        const [page1Image, page2Image] = encodeMetadata(
          election,
          metadata,
          encoding
        );
        const outputPathBase = `${outputPath.replace(/\.png$/, '')}-${
          ballotStyle.id
        }-${precinctId}-${isTestMode ? 'testmode' : 'livemode'}`;
        await writeImageData(`${outputPathBase}-p1.png`, page1Image);
        await writeImageData(`${outputPathBase}-p2.png`, page2Image);
        io.stdout.write(`${outputPathBase}-p1.png\n`);
        io.stdout.write(`${outputPathBase}-p2.png\n`);
      }
    }
  }
  return 0;
}
