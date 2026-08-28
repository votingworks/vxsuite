/**
 * Validates that a pollbook package zip will load in VxPollBook by running it
 * through the exact same code paths the backend uses when it finds a package on
 * a USB drive: `readPollbookPackage` followed by
 * `LocalStore.setElectionAndVoters` (into an in-memory SQLite store), then a
 * few read-back queries the frontend relies on.
 *
 * Usage:
 *   ./scripts/validate-pollbook-package <path-to-zip-or-dir> [...more]
 *
 * Directories are scanned the same way the USB polling loop scans a mounted
 * drive: only files named `pollbook-package*.zip` are considered.
 */
import { basename, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { assertDefined, extractErrorMessage, iter } from '@votingworks/basics';
import { readFile } from '@votingworks/fs';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  Election,
  safeParseElectionDefinition,
  Voter,
} from '@votingworks/types';
import {
  getEntries,
  getFilePrefixedByName,
  openZip,
  readTextEntry,
} from '@votingworks/utils';
import {
  getExternalPrecinctIdMappingFromElection,
  parseValidStreetsFromCsvString,
  parseVotersFromCsvString,
  PollbookPackageFileName,
  readPollbookPackage,
} from '../src/pollbook_package';
import { LocalStore } from '../src/local_store';
import {
  MAX_POLLBOOK_PACKAGE_SIZE,
  POLLBOOK_PACKAGE_FILENAME_PREFIX,
} from '../src/globals';

const usageMessage = `Usage: validate-pollbook-package <zip-or-directory> [...more]

Checks that each pollbook package will load in VxPollBook by running it through
the backend's own parsing (readPollbookPackage) and configuration
(LocalStore.setElectionAndVoters) code. Exits non-zero if any package fails.`;

/**
 * Mirrors `toCamelCase` in src/pollbook_package.ts (not exported there).
 */
function toCamelCase(str: string) {
  const words = str
    .split(/[^a-zA-Z0-9]/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  const first = words.shift();
  const rest = words.map((word) => word[0].toUpperCase() + word.slice(1));
  return [first, ...rest].join('');
}

/**
 * Columns the parser reads from voters.csv, expressed as camelCased header
 * names. Each entry is a list of accepted aliases (see parseVotersFromCsvString).
 */
const VOTER_COLUMNS: ReadonlyArray<readonly string[]> = [
  ['voterId'],
  ['lastName'],
  ['suffix'],
  ['firstName'],
  ['middleName'],
  ['streetNumber'],
  ['addressSuffix'],
  ['houseFractionNumber'],
  ['streetName'],
  ['apartmentUnitNumber'],
  ['addressLine2'],
  ['addressLine3'],
  ['postalCityTown', 'postalCity'],
  ['state'],
  ['postalZip5', 'zip5'],
  ['zip4'],
  ['mailingStreetNumber'],
  ['mailingSuffix'],
  ['mailingHouseFractionNumber'],
  ['mailingStreetName'],
  ['mailingApartmentUnitNumber'],
  ['mailingAddressLine2'],
  ['mailingAddressLine3'],
  ['mailingCityTown', 'mailingCity', 'mailingTown'],
  ['mailingState'],
  ['mailingZip5'],
  ['mailingZip4'],
  ['party'],
];
const PRECINCT_COLUMN: readonly string[] = ['ward', 'district'];

/**
 * Columns the parser reads from street-names.csv.
 */
const STREET_COLUMNS: ReadonlyArray<readonly string[]> = [
  ['streetName'],
  ['side'],
  ['lowRange'],
  ['highRange'],
  ['postalCityTown', 'postalCity'],
  ['zip5'],
  ['zip4'],
];

const VALID_PARTIES = new Set(['DEM', 'REP', 'UND']);
const VALID_SIDES = new Set(['even', 'odd', 'all']);

class QuietLogger extends BaseLogger {
  override log(): void {
    // Suppress backend logging so the report stays readable.
  }
}

class Report {
  private readonly lines: string[] = [];
  private failures = 0;
  private warnings = 0;

  private push(prefix: string, message: string): void {
    const [first, ...rest] = message.split('\n');
    this.lines.push(`${prefix}${first}`);
    for (const line of rest) {
      this.lines.push(`      ${line}`);
    }
  }

  info(message: string): void {
    this.push('    ', message);
  }

  ok(message: string): void {
    this.push('  ✔ ', message);
  }

  warn(message: string): void {
    this.warnings += 1;
    this.push('  ⚠ ', message);
  }

  fail(message: string): void {
    this.failures += 1;
    this.push('  ✘ ', message);
  }

  get failed(): boolean {
    return this.failures > 0;
  }

  print(): void {
    for (const line of this.lines) {
      console.log(line);
    }
    const verdict = this.failed ? 'FAIL' : 'PASS';
    const counts = `${this.failures} failure(s), ${this.warnings} warning(s)`;
    console.log(`  ${this.failed ? '✘' : '✔'} RESULT: ${verdict} (${counts})`);
  }
}

function csvHeader(csvString: string): string[] {
  const rows = parse(csvString, { to_line: 1 }) as string[][];
  return (rows[0] ?? []).map(toCamelCase);
}

function checkColumns(
  report: Report,
  fileLabel: string,
  header: string[],
  expected: ReadonlyArray<readonly string[]>
): void {
  const present = new Set(header);
  const missing = expected
    .filter((aliases) => !aliases.some((alias) => present.has(alias)))
    .map((aliases) => aliases[0]);
  const known = new Set([...expected.flat(), ...PRECINCT_COLUMN]);
  const unrecognized = header.filter((column) => !known.has(column));

  if (missing.length === 0) {
    report.ok(`${fileLabel}: all expected columns present`);
  } else {
    report.warn(
      `${fileLabel}: missing columns ${missing
        .map((column) => `"${column}"`)
        .join(', ')} — these fields will be undefined on every record`
    );
  }
  if (unrecognized.length > 0) {
    report.info(
      `${fileLabel}: extra columns not read by the app (harmless unless one is a typo of an expected column): ${unrecognized
        .map((column) => `"${column}"`)
        .join(', ')}`
    );
  }
}

/**
 * Inspects the zip contents directly so we can explain problems that
 * `readPollbookPackage` would otherwise surface as a single opaque error.
 */
async function preflight(report: Report, path: string): Promise<void> {
  const fileResult = await readFile(path, {
    maxSize: MAX_POLLBOOK_PACKAGE_SIZE,
  });
  if (fileResult.isErr()) {
    const error = fileResult.err();
    if (error.type === 'FileExceedsMaxSize') {
      report.fail(
        `file is ${error.fileSize} bytes, exceeds MAX_POLLBOOK_PACKAGE_SIZE (${error.maxSize})`
      );
    } else {
      report.fail(`${error.type}: ${extractErrorMessage(error.error)}`);
    }
    return;
  }

  let entries;
  try {
    entries = getEntries(await openZip(fileResult.ok()));
  } catch (error) {
    report.fail(`not a readable zip: ${extractErrorMessage(error)}`);
    return;
  }

  const entryNames = entries.map((entry) => entry.name);
  const junk = entryNames.filter(
    (name) => name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')
  );
  const real = entryNames.filter((name) => !junk.includes(name));
  report.info(
    `zip entries: ${real.join(', ')}${
      junk.length > 0
        ? ` (+${junk.length} macOS metadata entries, ignored)`
        : ''
    }`
  );

  const expectedFiles: Array<[PollbookPackageFileName, string]> = [
    [PollbookPackageFileName.ELECTION, 'json'],
    [PollbookPackageFileName.VOTERS, 'csv'],
    [PollbookPackageFileName.STREET_NAMES, 'csv'],
  ];
  for (const [prefix, extension] of expectedFiles) {
    const matching = entries.filter(
      (entry) => entry.name.startsWith(prefix) && entry.name.endsWith(extension)
    );
    if (matching.length === 0) {
      report.fail(
        `no entry starting with "${prefix}" and ending with ".${extension}"`
      );
    } else if (matching.length > 1) {
      const chosen = getFilePrefixedByName(entries, prefix, extension);
      report.warn(
        `multiple entries match "${prefix}*.${extension}" (${matching
          .map((entry) => entry.name)
          .join(', ')}); app will use the most recently modified: ${
          chosen.name
        }`
      );
    }
  }

  // Header checks — the CSV parser does not validate columns, so a misspelled
  // header silently produces undefined fields.
  try {
    const votersEntry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.VOTERS,
      'csv'
    );
    const header = csvHeader(await readTextEntry(votersEntry));
    checkColumns(report, votersEntry.name, header, VOTER_COLUMNS);
    if (!PRECINCT_COLUMN.some((column) => header.includes(column))) {
      report.info(
        `${votersEntry.name}: no "Ward"/"District" column (fine for single-precinct elections)`
      );
    }
  } catch {
    // Already reported above.
  }
  try {
    const streetsEntry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.STREET_NAMES,
      'csv'
    );
    const header = csvHeader(await readTextEntry(streetsEntry));
    checkColumns(report, streetsEntry.name, header, STREET_COLUMNS);
  } catch {
    // Already reported above.
  }
}

/**
 * Re-runs the three parsing stages of `readPollbookPackage` one at a time so a
 * failure can be attributed to a specific file. Only called after
 * `readPollbookPackage` has already failed.
 */
async function diagnoseParseFailure(
  report: Report,
  path: string
): Promise<void> {
  const fileResult = await readFile(path, {
    maxSize: MAX_POLLBOOK_PACKAGE_SIZE,
  });
  if (fileResult.isErr()) {
    return;
  }
  let entries;
  try {
    entries = getEntries(await openZip(fileResult.ok()));
  } catch {
    return;
  }

  let election: Election;
  try {
    const entry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.ELECTION,
      'json'
    );
    const parsed = safeParseElectionDefinition(await readTextEntry(entry));
    if (parsed.isErr()) {
      report.fail(
        `${
          entry.name
        } is not a valid election definition:\n${extractErrorMessage(
          parsed.err()
        )}`
      );
      return;
    }
    election = parsed.ok().election;
    report.info(`${entry.name} parses as a valid election definition`);
  } catch (error) {
    report.fail(`election.json: ${extractErrorMessage(error)}`);
    return;
  }

  try {
    const entry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.VOTERS,
      'csv'
    );
    const csv = await readTextEntry(entry);
    const rowCount =
      (parse(csv, { skipEmptyLines: true }) as unknown[]).length - 1;
    const voters = parseVotersFromCsvString(csv, election);
    report.info(
      `${entry.name}: ${voters.length} of ${rowCount} rows parsed as voters`
    );
  } catch (error) {
    const message = extractErrorMessage(error);
    report.fail(
      `voters.csv failed to parse: ${
        message ||
        'no rows had a "Voter ID" value — check the header row (every data row is dropped when the voterId column is missing)'
      }`
    );
    return;
  }

  try {
    const entry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.STREET_NAMES,
      'csv'
    );
    const streets = parseValidStreetsFromCsvString(
      await readTextEntry(entry),
      election
    );
    report.info(`${entry.name}: ${streets.length} streets parsed`);
  } catch (error) {
    report.fail(
      `streetNames.csv failed to parse: ${
        extractErrorMessage(error) || '(no message)'
      }`
    );
  }
}

function describeElection(report: Report, election: Election): void {
  report.info(
    `election: "${election.title}" (${
      election.type
    }, ${election.date.toISOString()}) id=${election.id}`
  );
  report.info(
    `precincts (${election.precincts.length}): ${election.precincts
      .map((precinct) => `"${precinct.name}"`)
      .join(', ')}`
  );
  if (election.parties.length > 0) {
    report.info(
      `parties: ${election.parties
        .map((party) => `${party.abbrev} (${party.name})`)
        .join(', ')}`
    );
  }
  const mapping = getExternalPrecinctIdMappingFromElection(election);
  if (mapping.type === 'multi-precinct') {
    const externalIds = Object.keys(mapping.precinctIds);
    report.info(
      `multi-precinct: CSV Ward/District values map to precincts by the trailing number in the precinct name: ${externalIds
        .map((externalId) => {
          const precinct = assertDefined(
            election.precincts.find(
              (candidate) => candidate.id === mapping.precinctIds[externalId]
            )
          );
          return `${externalId} → "${precinct.name}"`;
        })
        .join(', ')}`
    );
    if (externalIds.length !== election.precincts.length) {
      report.fail(
        `${election.precincts.length} precincts collapse to ${externalIds.length} distinct external IDs — precinct names must end in distinct numbers`
      );
    }
  }
}

function checkVoterData(
  report: Report,
  voters: Voter[],
  election: Election
): void {
  const duplicateIds = iter(voters)
    .map((voter) => voter.voterId)
    .toArray()
    .filter((voterId, index, all) => all.indexOf(voterId) !== index);
  if (duplicateIds.length > 0) {
    report.fail(
      `${duplicateIds.length} duplicate voter ID(s) after zero-padding (e.g. ${[
        ...new Set(duplicateIds),
      ]
        .slice(0, 5)
        .join(
          ', '
        )}) — insert will hit a UNIQUE constraint and the machine will silently stay unconfigured`
    );
  }

  const badParty = voters.filter((voter) => !VALID_PARTIES.has(voter.party));
  if (badParty.length > 0) {
    const samples = [...new Set(badParty.map((voter) => `"${voter.party}"`))]
      .slice(0, 5)
      .join(', ');
    report.warn(
      `${badParty.length} voter(s) with party not in DEM/REP/UND: ${samples}`
    );
  }

  const blankNames = voters.filter(
    (voter) => !voter.lastName?.trim() || !voter.firstName?.trim()
  );
  if (blankNames.length > 0) {
    report.warn(
      `${blankNames.length} voter(s) with blank first or last name (e.g. voter ID ${blankNames[0].voterId})`
    );
  }

  if (election.precincts.length > 1) {
    const unassigned = voters.filter((voter) => !voter.precinct);
    if (unassigned.length > 0) {
      report.warn(
        `${unassigned.length} voter(s) have no Ward/District value in a multi-precinct election — they will not appear in any precinct`
      );
    }
  }

  const byPrecinct = new Map<string, number>();
  const byParty = new Map<string, number>();
  for (const voter of voters) {
    const precinctName =
      election.precincts.find((precinct) => precinct.id === voter.precinct)
        ?.name ?? '(none)';
    byPrecinct.set(precinctName, (byPrecinct.get(precinctName) ?? 0) + 1);
    byParty.set(voter.party, (byParty.get(voter.party) ?? 0) + 1);
  }
  report.info(
    `voters by precinct: ${[...byPrecinct.entries()]
      .map(([name, count]) => `"${name}"=${count}`)
      .join(', ')}`
  );
  report.info(
    `voters by party: ${[...byParty.entries()]
      .map(([party, count]) => `${party}=${count}`)
      .join(', ')}`
  );
}

async function validatePackage(path: string): Promise<boolean> {
  const report = new Report();
  const name = basename(path);
  console.log(`\n▶ ${path}`);

  if (
    name.startsWith(POLLBOOK_PACKAGE_FILENAME_PREFIX) &&
    name.endsWith('.zip')
  ) {
    report.ok(`filename matches "${POLLBOOK_PACKAGE_FILENAME_PREFIX}*.zip"`);
  } else {
    report.fail(
      `filename must start with "${POLLBOOK_PACKAGE_FILENAME_PREFIX}" and end with ".zip" or the USB polling loop will never see it`
    );
  }

  await preflight(report, path);

  // 1. Parse — exactly what pollUsbDriveForPollbookPackage does.
  const parseResult = await readPollbookPackage(path);
  if (parseResult.isErr()) {
    const error = parseResult.err();
    const detail =
      error.type === 'FileExceedsMaxSize'
        ? `${error.fileSize} bytes > ${error.maxSize}`
        : extractErrorMessage(error.error);
    report.fail(
      `readPollbookPackage → ${error.type}: ${detail} (app would show "usb-configuration-error")`
    );
    await diagnoseParseFailure(report, path);
    report.print();
    return false;
  }
  const pollbookPackage = parseResult.ok();
  const { election } = pollbookPackage.electionDefinition;
  report.ok(
    `readPollbookPackage parsed ${pollbookPackage.voters.length} voters and ${
      pollbookPackage.validStreets.length
    } streets (package hash ${pollbookPackage.packageHash.slice(0, 10)}…)`
  );
  describeElection(report, election);
  if (pollbookPackage.voters.length === 0) {
    report.fail('no voters parsed');
  }
  checkVoterData(report, pollbookPackage.voters, election);

  const badSides = pollbookPackage.validStreets.filter(
    (street) => !VALID_SIDES.has(street.side)
  );
  if (badSides.length > 0) {
    report.warn(
      `${badSides.length} street(s) with Side not in EVEN/ODD/ALL (e.g. "${badSides[0].side}" on ${badSides[0].streetName})`
    );
  }
  if (election.precincts.length > 1) {
    const unassigned = pollbookPackage.validStreets.filter(
      (street) => !street.precinct
    );
    if (unassigned.length > 0) {
      report.warn(
        `${unassigned.length} street(s) have no Ward/District value in a multi-precinct election`
      );
    }
  }

  // 2. Configure an in-memory store — exactly what the polling loop does next.
  const store = LocalStore.memoryStore(
    new QuietLogger(LogSource.VxPollBookBackend)
  );
  try {
    const configureResult = store.setElectionAndVoters(
      pollbookPackage.electionDefinition,
      pollbookPackage.packageHash,
      pollbookPackage.validStreets,
      pollbookPackage.voters
    );
    if (configureResult) {
      report.fail(
        `setElectionAndVoters returned "${configureResult}" (UNIQUE constraint hit — see duplicate voter IDs above)`
      );
    } else {
      report.ok('setElectionAndVoters inserted election and voters');
    }
  } catch (error) {
    report.fail(`setElectionAndVoters threw: ${extractErrorMessage(error)}`);
    report.print();
    return false;
  }

  // 3. Read back what the frontend asks for right after configuration.
  try {
    const storedElection = assertDefined(store.getElection());
    const info = store.getPollbookConfigurationInformation();
    const streets = store.getStreetInfo();
    report.ok(
      `read-back: election "${
        storedElection.title
      }", ballotHash ${info.electionBallotHash?.slice(0, 10)}…, ${
        streets.length
      } streets`
    );
    for (const precinct of election.precincts) {
      store.setConfiguredPrecinct(precinct.id);
      const voters = store.getAllVotersInPrecinctSorted();
      const groups = store.groupVotersAlphabeticallyByLastName();
      report.ok(
        `read-back precinct "${precinct.name}": ${voters.length} voters, ${groups.size} last-name groups`
      );
      const sample = voters[0];
      if (sample) {
        const results = store.searchVoters({
          lastName: sample.lastName,
          firstName: sample.firstName,
          middleName: '',
          suffix: '',
        });
        if (typeof results === 'number' || results.length === 0) {
          report.warn(
            `search for sample voter ${sample.voterId} (${sample.firstName} ${
              sample.lastName
            }) returned ${
              typeof results === 'number'
                ? `${results} results (over limit)`
                : 'nothing'
            }`
          );
        }
      }
    }
  } catch (error) {
    report.fail(`read-back query threw: ${extractErrorMessage(error)}`);
  }

  report.print();
  return !report.failed;
}

async function expandPaths(args: readonly string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const arg of args) {
    const stats = await stat(arg);
    if (stats.isDirectory()) {
      const files = (await readdir(arg))
        .filter(
          (file) =>
            file.startsWith(POLLBOOK_PACKAGE_FILENAME_PREFIX) &&
            file.endsWith('.zip')
        )
        .map((file) => join(arg, file));
      if (files.length === 0) {
        console.error(
          `No ${POLLBOOK_PACKAGE_FILENAME_PREFIX}*.zip files found in ${arg}`
        );
      } else if (files.length > 1) {
        const newest = assertDefined(
          await iter(files)
            .async()
            .maxBy(async (file) => (await stat(file)).ctime.getTime())
        );
        console.log(
          `${arg}: ${
            files.length
          } packages; if this were a USB drive the app would load the most recently changed: ${basename(
            newest
          )}`
        );
      }
      paths.push(...files);
    } else {
      paths.push(arg);
    }
  }
  return paths;
}

export async function main(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.error(usageMessage);
    return 1;
  }
  const paths = await expandPaths(args);
  const results: Array<[string, boolean]> = [];
  for (const path of paths) {
    try {
      results.push([path, await validatePackage(path)]);
    } catch (error) {
      console.log(`  ✘ unexpected error: ${extractErrorMessage(error)}`);
      results.push([path, false]);
    }
  }
  if (results.length > 1) {
    console.log('\nSummary:');
    for (const [path, passed] of results) {
      console.log(`  ${passed ? '✔ PASS' : '✘ FAIL'}  ${basename(path)}`);
    }
  }
  return results.every(([, passed]) => passed) ? 0 : 1;
}
