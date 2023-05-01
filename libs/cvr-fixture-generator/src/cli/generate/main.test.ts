import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { safeParseJson, CVR, unsafeParse } from '@votingworks/types';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import { join, resolve } from 'path';
import { dirSync } from 'tmp';
import { CAST_VOTE_RECORD_REPORT_FILENAME } from '@votingworks/utils';
import {
  getCastVoteRecordReportImport,
  getWriteInsFromCastVoteRecord,
  isBmdWriteIn,
} from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { DEFAULT_SCANNER_ID, main } from './main';
import { getBatchIdForScannerId } from '../../utils';

jest.setTimeout(30_000);

function reportFromFile(directory: string) {
  const filename = join(directory, CAST_VOTE_RECORD_REPORT_FILENAME);
  const reportParseResult = safeParseJson(
    readFileSync(filename, 'utf8'),
    CVR.CastVoteRecordReportSchema
  );
  expect(reportParseResult.isOk()).toBeTruthy();
  return reportParseResult.unsafeUnwrap();
}

async function run(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdin = fakeReadable();
  const stdout = fakeWritable();
  const stderr = fakeWritable();

  const exitCode = await main(
    [process.argv0, resolve(__dirname, './main'), ...args],
    { stdin, stdout, stderr }
  );

  return {
    exitCode,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
  };
}

test('--help', async () => {
  expect(await run(['--help'])).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining('--ballotPackage'),
    stderr: '',
  });
});

test('invalid option', async () => {
  expect(await run(['--invalid'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Unknown argument: invalid'),
  });
});

test('missing ballot package', async () => {
  expect(await run(['--outputPath', '/tmp/test'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing ballot package'),
  });
});

test('missing output path', async () => {
  expect(await run(['--ballotPackage', '/tmp/test'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing output path'),
  });
});

test('generate with defaults', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputDirectory.name,
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 184 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const report = reportFromFile(outputDirectory.name);
  expect(report.CVR).toHaveLength(184);
});

test('generate with custom number of records below the suggested number', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputDirectory.name,
      '--numBallots',
      '100',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 100 cast vote records to ${outputDirectory.name}\n`,
    stderr: expect.stringContaining('WARNING:'),
  });

  const report = reportFromFile(outputDirectory.name);
  expect(report.CVR).toHaveLength(100);
});

test('generate with custom number of records above the suggested number', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputDirectory.name,
      '--numBallots',
      '3000',
      '--ballotIdPrefix',
      'pre',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 3000 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const castVoteRecordReportImport = (
    await getCastVoteRecordReportImport(
      join(outputDirectory.name, CAST_VOTE_RECORD_REPORT_FILENAME)
    )
  ).assertOk('generated cast vote record should be valid');

  let cvrCount = 0;
  for await (const unparsedCastVoteRecord of castVoteRecordReportImport.CVR) {
    const castVoteRecord = unsafeParse(CVR.CVRSchema, unparsedCastVoteRecord);
    expect(castVoteRecord.UniqueId).toEqual(`pre-${cvrCount}`);
    cvrCount += 1;
  }

  expect(cvrCount).toEqual(3000);
});

test('generate live mode CVRs', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputDirectory.name,
    '--officialBallots',
    '--numBallots',
    '10',
  ]);

  const report = reportFromFile(outputDirectory.name);
  expect(report.OtherReportType).toBeUndefined();
});

test('generate test mode CVRs', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputDirectory.name,
    '--numBallots',
    '10',
  ]);

  const report = reportFromFile(outputDirectory.name);
  expect(report.OtherReportType?.split(',')).toContain('test');
});

test('specifying scanner ids', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputDirectory.name,
    '--scannerIds',
    'scanner1,scanner2',
  ]);

  const report = reportFromFile(outputDirectory.name);
  for (const cvr of report.CVR!) {
    expect(cvr.CreatingDeviceId).toMatch(/scanner[12]/);
  }
});

test('including ballot images', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputDirectory.name,
    '--includeBallotImages',
  ]);

  const report = reportFromFile(outputDirectory.name);
  const imageFileUris = new Set<string>();
  assert(report.CVR);
  for (const cvr of report.CVR) {
    const ballotImages = cvr.BallotImage;
    if (ballotImages) {
      if (ballotImages[0]?.Location) {
        imageFileUris.add(ballotImages[0]?.Location);
      }
      if (ballotImages[1]?.Location) {
        imageFileUris.add(ballotImages[1]?.Location);
      }
    }
  }

  const defaultBatchId = getBatchIdForScannerId(DEFAULT_SCANNER_ID);

  // files referenced from the report
  expect(Array.from(imageFileUris)).toMatchObject([
    `file:ballot-images/${defaultBatchId}/card-number-3__town-id-00701-precinct-id-__2.jpg`,
    `file:ballot-images/${defaultBatchId}/card-number-3__town-id-00701-precinct-id-__1.jpg`,
  ]);

  // images exported
  expect(
    await fs.readdir(
      join(outputDirectory.name, 'ballot-images', defaultBatchId)
    )
  ).toMatchInlineSnapshot(`
    Array [
      "card-number-3__town-id-00701-precinct-id-__1.jpg",
      "card-number-3__town-id-00701-precinct-id-__2.jpg",
    ]
  `);

  // layouts exported
  expect(
    await fs.readdir(
      join(outputDirectory.name, 'ballot-layouts', defaultBatchId)
    )
  ).toMatchInlineSnapshot(`
    Array [
      "card-number-3__town-id-00701-precinct-id-__1.layout.json",
      "card-number-3__town-id-00701-precinct-id-__2.layout.json",
    ]
  `);
});

test('generating as BMD ballots', async () => {
  const ballotPackagePath =
    electionGridLayoutNewHampshireAmherstFixtures.ballotPackage.asFilePath();
  const outputDirectory = dirSync();

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputDirectory.name,
      '--bmdBallots',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 184 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const report = reportFromFile(outputDirectory.name);
  assert(report.CVR);
  for (const [index, cvr] of report.CVR.entries()) {
    expect(cvr.BallotImage).toBeUndefined();
    expect(cvr.UniqueId).toEqual(index.toString());
    expect(
      getWriteInsFromCastVoteRecord(cvr).every((castVoteRecordWriteIn) =>
        Boolean(castVoteRecordWriteIn.text)
      )
    ).toEqual(true);
    const writeIns = cvr.CVRSnapshot[0]!.CVRContest.flatMap(
      (contest) => contest.CVRContestSelection
    )
      .flatMap((contestSelection) => contestSelection.SelectionPosition)
      .map((selectionPosition) => selectionPosition.CVRWriteIn)
      .filter(
        (cvrWriteIn): cvrWriteIn is CVR.CVRWriteIn => cvrWriteIn !== undefined
      );
    expect(writeIns.every((writeIn) => isBmdWriteIn(writeIn))).toEqual(true);
  }
});
