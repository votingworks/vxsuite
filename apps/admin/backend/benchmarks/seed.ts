import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseLogger, LogSource } from '@votingworks/logging';
import {
  BallotStyle,
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  Id,
  Tabulation,
  getContests,
} from '@votingworks/types';
import { assert, assertDefined, iter, range } from '@votingworks/basics';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  addMockCvrFileToStore,
  MockCastVoteRecordFile,
} from '../test/mock_cvr_file.js';
import { Store } from '../src/store.js';

/** The number of CVRs benchmarks run against. */
export const DEFAULT_CVR_COUNT = 1_000_000;

/** The size of the CVR export import benchmarks ingest: one full batch. */
export const CVR_EXPORT_SIZE = 500;

const REPO_ROOT = join(import.meta.dirname, '../../../..');

/**
 * Generates a real cast vote record export for the seeded election, sized at
 * {@link CVR_EXPORT_SIZE}, so import benchmarks can exercise the full import
 * pipeline (export reading, hashing, conversion, and store writes).
 */
function generateCvrExport(exportDirectoryPath: string): void {
  execFileSync(
    'pnpm',
    ['-w', 'vx-task', 'build', '@votingworks/fixture-generators'],
    { cwd: REPO_ROOT, stdio: 'ignore' }
  );
  execFileSync(
    join(REPO_ROOT, 'libs/fixture-generators/bin/generate-cvrs'),
    [
      '--electionDefinition',
      join(
        REPO_ROOT,
        'libs/fixtures/data/electionTwoPartyPrimary/election.json'
      ),
      '--outputPath',
      exportDirectoryPath,
      '--numBallots',
      `${CVR_EXPORT_SIZE}`,
    ],
    { cwd: REPO_ROOT, stdio: 'ignore' }
  );
}

const AVERAGE_BATCH_SIZE = 250;
const CENTRAL_SCAN_SHARE = 0.7; // per scale targets in #9063
const WRITE_INS_PER_BATCH = 12; // ~5% of CVRs
const UNDERVOTES_PER_BATCH = 25; // ~10% of CVRs

/**
 * Filler mark scores giving each HMPB CVR row a realistic overall size
 * (~2KB). No marginal marks.
 */
function buildMarkScores(): Tabulation.MarkScores {
  return Object.fromEntries(
    range(0, 9).map((contestIndex) => [
      `filler-contest-${contestIndex}-some-longer-identifier`,
      Object.fromEntries(
        range(0, 5).map((optionIndex) => [
          `filler-option-${optionIndex}-longer-identifier`,
          0.001 * optionIndex,
        ])
      ),
    ])
  );
}

/** Builds valid votes for the given ballot style's candidate contests. */
export function buildVotes(
  election: Election,
  ballotStyle: BallotStyle,
  {
    withWriteIn,
    withUndervote,
  }: { withWriteIn: boolean; withUndervote: boolean }
): Tabulation.Votes {
  const votes: Record<string, string[]> = {};
  let isFirstContest = true;
  for (const contest of getContests({ election, ballotStyle })) {
    if (contest.type !== 'candidate') {
      continue;
    }
    let contestVotes = contest.candidates
      .slice(0, contest.seats)
      .map((c) => c.id);
    if (withWriteIn && contest.allowWriteIns) {
      contestVotes = [
        ...contestVotes.slice(0, contest.seats - 1),
        'write-in-0',
      ];
    }
    if (withUndervote && isFirstContest) {
      contestVotes = contestVotes.slice(0, contest.seats - 1);
    }
    votes[contest.id] = contestVotes;
    isFirstContest = false;
  }
  return votes;
}

async function seed(
  dir: string,
  dbPath: string,
  cvrCount: number
): Promise<Id> {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinition;

  const electionPackagePath = join(dir, 'election-package.zip');
  writeFileSync(electionPackagePath, electionDefinition.electionData);

  const store = Store.fileStore(
    dbPath,
    join(dir, 'ballot-images'),
    join(dir, 'election-packages'),
    new BaseLogger(LogSource.System)
  );
  const electionId = await store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageSourceFilePath: electionPackagePath,
    electionPackageHash: createHash('sha256')
      .update(electionDefinition.electionData)
      .digest('hex'),
  });
  store.setCurrentElectionId(electionId);

  const styles = ['1M', '2F'].map((id) =>
    assertDefined(election.ballotStyles.find((bs) => bs.id === id))
  );
  const markScores = buildMarkScores();

  const numBatches = Math.max(10, Math.ceil(cvrCount / AVERAGE_BATCH_SIZE));
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [];
  let remaining = cvrCount;
  for (const i of range(0, numBatches)) {
    const batchSize = Math.min(remaining, Math.ceil(cvrCount / numBatches));
    remaining -= batchSize;
    const isCentral = i / numBatches < CENTRAL_SCAN_SHARE;
    const style = assertDefined(styles[i % styles.length]);
    const shared: Omit<MockCastVoteRecordFile[number], 'votes'> = {
      ballotStyleGroupId: style.groupId,
      batchId: `batch-${i}`,
      scannerId: isCentral
        ? `central-scanner-${i % 20}`
        : `precinct-scanner-${i % 400}`,
      scannerMachineType: isCentral ? 'central' : 'precinct',
      precinctId: `precinct-${(i % 2) + 1}`,
      votingMethod: 'precinct',
      card: { type: 'hmpb', sheetNumber: 1 },
      markScores,
    };
    const writeIns = Math.min(WRITE_INS_PER_BATCH, batchSize);
    const undervotes = Math.min(UNDERVOTES_PER_BATCH, batchSize - writeIns);
    mockCastVoteRecordFile.push(
      {
        ...shared,
        votes: buildVotes(election, style, {
          withWriteIn: false,
          withUndervote: false,
        }),
        multiplier: batchSize - writeIns - undervotes,
      },
      {
        ...shared,
        votes: buildVotes(election, style, {
          withWriteIn: true,
          withUndervote: false,
        }),
        multiplier: writeIns,
      },
      {
        ...shared,
        votes: buildVotes(election, style, {
          withWriteIn: false,
          withUndervote: true,
        }),
        multiplier: undervotes,
      }
    );
  }

  store.withTransaction(() =>
    addMockCvrFileToStore({
      electionId,
      mockCastVoteRecordFile,
      pollingPlaceId: 'polling-place-1',
      store,
    })
  );
  store.close();

  return electionId;
}

function totalCvrCount(store: Store, electionId: Id): number {
  return iter(Object.values(store.getScannerImportCounts(electionId)))
    .map(({ cvrCount }) => cvrCount)
    .sum();
}

/**
 * Builds (or reuses a cached copy of) a VxAdmin store seeded with `cvrCount`
 * CVRs and opens it. Cached under PERF_DB_DIR (default: the OS temp dir).
 * Run with RESET_CACHED_STORE=1 to discard the cache and reseed — needed
 * whenever the seeded data shape or the store schema changes.
 */
export async function openPerfStore(cvrCount: number): Promise<{
  store: Store;
  electionId: Id;
  dbPath: string;
  cvrExportPath: string;
}> {
  const cacheRoot =
    process.env['PERF_DB_DIR'] ?? join(tmpdir(), 'vx-admin-perf');
  const dir = join(cacheRoot, `two-party-primary-${cvrCount}`);
  const dbPath = join(dir, 'data.db');
  // The directory name must follow the export naming convention for
  // signature-file authentication to accept it
  const cvrExportPath = join(dir, 'machine_0000__2024-01-01_00-00-00');
  const donePath = join(dir, 'seed-complete.json');

  if (process.env['RESET_CACHED_STORE'] || !existsSync(donePath)) {
    // Reset at most once per run, not once per bench file
    delete process.env['RESET_CACHED_STORE'];
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    process.stdout.write(
      `seeding ${cvrCount} CVRs into ${dbPath} (cached for reuse)...\n`
    );
    const startMs = Date.now();
    const electionId = await seed(dir, dbPath, cvrCount);
    generateCvrExport(cvrExportPath);
    await writeFile(donePath, JSON.stringify({ electionId }));
    process.stdout.write(
      `seeded in ${((Date.now() - startMs) / 1000).toFixed(0)}s\n`
    );
  }

  const { electionId } = JSON.parse(await readFile(donePath, 'utf8')) as {
    electionId: Id;
  };
  const store = Store.fileStore(
    dbPath,
    join(dir, 'ballot-images'),
    join(dir, 'election-packages'),
    new BaseLogger(LogSource.System)
  );

  const seededCvrCount = totalCvrCount(store, electionId);
  assert(
    seededCvrCount === cvrCount,
    `cached benchmark database has ${seededCvrCount} CVRs, expected ` +
      `${cvrCount}; re-run with RESET_CACHED_STORE=1`
  );

  return { store, electionId, dbPath, cvrExportPath };
}
