import { safeParseJson } from '@votingworks/types';
import { readFileSync } from 'node:fs';
import { assertDefined } from '@votingworks/basics';
import {
  generateElection,
  GenerateElectionConfigSchema,
} from '../../generate-election';

interface IO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

// eslint-disable-next-line vx/gts-jsdoc
export function main(argv: readonly string[], { stdout, stderr }: IO): number {
  if (argv.length !== 3) {
    stderr.write('Usage: generate-election <config.json>\n');
    return 1;
  }

  const configPath = assertDefined(argv[2]);
  const configContents = readFileSync(configPath, 'utf8');
  const config = safeParseJson(
    configContents,
    GenerateElectionConfigSchema.deepPartial()
  ).unsafeUnwrap();

  const election = generateElection(config);
  stdout.write(JSON.stringify(election));
  return 0;
}
