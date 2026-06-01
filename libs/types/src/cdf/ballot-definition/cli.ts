/* istanbul ignore file */
import { readFileSync } from 'node:fs';
import { stderr } from 'node:process';
import { safeParseElection } from '../../election_parsing';
import { convertVxfElectionToCdfBallotDefinition } from './convert';

interface Stdio {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/**
 * Script to convert a VXF election.json file to a CDF ballot definition. Writes
 * the CDF ballot definition to stdout.
 *
 * Usage: ./bin/convert-vxf-election-to-cdf /path/to/election.json
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function main(
  args: readonly string[],
  { stdout }: Stdio
): Promise<number> {
  const vxfPath = args[2];
  if (!vxfPath) {
    stderr.write(
      'Usage: ./bin/convert-vxf-election-to-cdf /path/to/election.json\n'
    );
    return 1;
  }
  const vxfElectionString = readFileSync(vxfPath, 'utf8');
  const vxfElection = safeParseElection(vxfElectionString).unsafeUnwrap();
  const cdfBallotDefinition =
    convertVxfElectionToCdfBallotDefinition(vxfElection);
  stdout.write(`${JSON.stringify(cdfBallotDefinition, null, 2)}\n`);
  return 0;
}
