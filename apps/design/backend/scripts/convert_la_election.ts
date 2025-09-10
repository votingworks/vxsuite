import { readdirSync, readFileSync } from 'node:fs';
import { assert, find } from '@votingworks/basics';
import { join } from 'node:path';
import {
  convertLaElectionToVxElection,
  fileIdentifiers,
  LaElectionFiles,
} from '../src/election_conversion_la';

const USAGE = `Usage: convert_la_election <parish-name> <general|primary> <election-data-directory>`;
function main(args: readonly string[]): void {
  if (args.length !== 3) {
    console.error(USAGE);
    process.exit(1);
  }

  const [parishName, electionType, electionDataDirectory] = args;
  assert(
    electionType === 'general' || electionType === 'primary',
    `Invalid election type: ${electionType}. Must be 'general' or 'primary'.`
  );
  const electionFileNames = readdirSync(electionDataDirectory).filter(
    (fileName) => fileName.endsWith('.txt')
  );

  function readRequiredFile(identifier: string) {
    const file = find(electionFileNames, (f) => f.includes(identifier));
    return readFileSync(join(electionDataDirectory, file), 'utf-8');
  }

  function readOptionalFile(identifier: string) {
    const file = electionFileNames.find((f) => f.includes(identifier));
    return file && readFileSync(join(electionDataDirectory, file), 'utf-8');
  }

  const fileContents: LaElectionFiles = {
    office: readRequiredFile(fileIdentifiers.office),
    referendum: readRequiredFile(fileIdentifiers.referendum),
    candidate: readRequiredFile(fileIdentifiers.candidate),
    precinct: readRequiredFile(fileIdentifiers.precinct),
    presidentialCandidate: readOptionalFile(
      fileIdentifiers.presidentialCandidate
    ),
    candidateAddress: readOptionalFile(fileIdentifiers.candidateAddress),
  };

  const election = convertLaElectionToVxElection(
    'Demo Election',
    parishName,
    electionType,
    fileContents
  );
  process.stdout.write(JSON.stringify(election, null, 2));
  process.stdout.write('\n');
}

main(process.argv.slice(2));
