import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { mockReadable, mockWritable } from '@votingworks/test-utils';
import {
  CVR,
  CastVoteRecordBatchMetadata,
  CastVoteRecordExportFileName,
} from '@votingworks/types';
import fs from 'fs/promises';
import { join, resolve } from 'path';
import { dirSync } from 'tmp';
import {
  getWriteInsFromCastVoteRecord,
  isBmdWriteIn,
} from '@votingworks/utils';
import { readCastVoteRecordExport } from '@votingworks/backend';
import { ok } from '@votingworks/basics';
import { main } from './main';
import { IMAGE_URI_REGEX } from '../../generate-cvrs/utils';

jest.setTimeout(60_000);

const electionDefinitionPathNhTestBallot =
  electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asFilePath();

async function run(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdin = mockReadable();
  const stdout = mockWritable();
  const stderr = mockWritable();

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

async function readAndValidateCastVoteRecordExport(
  exportDirectoryPath: string
): Promise<{
  castVoteRecordReportMetadata: CVR.CastVoteRecordReport;
  castVoteRecords: CVR.CVR[];
  batchManifest: CastVoteRecordBatchMetadata[];
}> {
  const readResult = await readCastVoteRecordExport(exportDirectoryPath);
  expect(readResult).toEqual(ok(expect.anything()));
  const { castVoteRecordExportMetadata, castVoteRecordIterator } =
    readResult.ok()!;
  const castVoteRecords: CVR.CVR[] = [];
  for await (const castVoteRecordResult of castVoteRecordIterator) {
    expect(castVoteRecordResult).toEqual(ok(expect.anything()));
    castVoteRecords.push(castVoteRecordResult.ok()!.castVoteRecord);
  }
  return {
    castVoteRecordReportMetadata:
      castVoteRecordExportMetadata.castVoteRecordReportMetadata,
    castVoteRecords,
    batchManifest: castVoteRecordExportMetadata.batchManifest,
  };
}

test('--help', async () => {
  expect(await run(['--help'])).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining('--electionDefinition'),
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

test('missing election definition', async () => {
  expect(await run(['--outputPath', '/tmp/test'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing election definition'),
  });
});

test('missing output path', async () => {
  expect(await run(['--electionDefinition', '/tmp/test'])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing output path'),
  });
});

test('generate with defaults', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  expect(
    await run([
      '--electionDefinition',
      electionDefinitionPath,
      '--outputPath',
      outputDirectory.name,
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 184 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const { castVoteRecords, batchManifest } =
    await readAndValidateCastVoteRecordExport(outputDirectory.name);
  expect(castVoteRecords).toHaveLength(184);

  const DEFAULT_BATCH_ID = '9822c71014';
  expect(
    castVoteRecords.every(
      (cvr) =>
        cvr.CreatingDeviceId === 'VX-00-000' && cvr.BatchId === DEFAULT_BATCH_ID
    )
  ).toBeTruthy();
  expect(batchManifest).toMatchObject(
    expect.arrayContaining([
      expect.objectContaining({
        batchNumber: 1,
        id: DEFAULT_BATCH_ID,
        label: DEFAULT_BATCH_ID,
        scannerId: 'VX-00-000',
        sheetCount: 184,
        startTime: expect.anything(),
      }),
    ])
  );
});

test('generate with custom number of records below the suggested number', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  expect(
    await run([
      '--electionDefinition',
      electionDefinitionPath,
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

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  expect(castVoteRecords).toHaveLength(100);
});

test('generate with custom number of records above the suggested number', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  expect(
    await run([
      '--electionDefinition',
      electionDefinitionPath,
      '--outputPath',
      outputDirectory.name,
      '--numBallots',
      '500',
      '--ballotIdPrefix',
      'pre',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 500 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  expect(castVoteRecords).toHaveLength(500);
  for (const castVoteRecord of castVoteRecords) {
    expect(castVoteRecord.UniqueId).toEqual(expect.stringMatching(/pre-(.+)/));
  }
});

test('generate live mode CVRs', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  await run([
    '--electionDefinition',
    electionDefinitionPath,
    '--outputPath',
    outputDirectory.name,
    '--officialBallots',
    '--numBallots',
    '10',
  ]);

  const { castVoteRecordReportMetadata } =
    await readAndValidateCastVoteRecordExport(outputDirectory.name);
  expect(castVoteRecordReportMetadata.OtherReportType).toBeUndefined();
});

test('generate test mode CVRs', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  await run([
    '--electionDefinition',
    electionDefinitionPath,
    '--outputPath',
    outputDirectory.name,
    '--numBallots',
    '10',
  ]);

  const { castVoteRecordReportMetadata } =
    await readAndValidateCastVoteRecordExport(outputDirectory.name);
  expect(castVoteRecordReportMetadata.OtherReportType?.split(',')).toContain(
    'test'
  );
});

test('specifying scanner ids', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  await run([
    '--electionDefinition',
    electionDefinitionPath,
    '--outputPath',
    outputDirectory.name,
    '--scannerIds',
    'scanner-1',
    'scanner-2',
  ]);

  const { castVoteRecords, batchManifest } =
    await readAndValidateCastVoteRecordExport(outputDirectory.name);
  for (const castVoteRecord of castVoteRecords) {
    expect(castVoteRecord.CreatingDeviceId).toMatch(/^scanner-[12]$/);
  }
  expect(batchManifest).toMatchObject(
    expect.arrayContaining([
      expect.objectContaining({
        batchNumber: 1,
        id: '8802613d7c',
        label: '8802613d7c',
        scannerId: 'scanner-1',
        sheetCount: 184,
        startTime: expect.anything(),
      }),
      expect.objectContaining({
        batchNumber: 1,
        id: 'd1d85ebf06',
        label: 'd1d85ebf06',
        scannerId: 'scanner-2',
        sheetCount: 184,
        startTime: expect.anything(),
      }),
    ])
  );
});

test('including ballot images', async () => {
  const electionDefinitionPath = electionDefinitionPathNhTestBallot;
  const outputDirectory = dirSync();

  await run([
    '--electionDefinition',
    electionDefinitionPath,
    '--outputPath',
    outputDirectory.name,
  ]);

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  for (const castVoteRecord of castVoteRecords) {
    if (castVoteRecord.BallotImage) {
      expect(castVoteRecord.BallotImage[0]?.Location).toEqual(
        expect.stringMatching(IMAGE_URI_REGEX)
      );
      expect(castVoteRecord.BallotImage[1]?.Location).toEqual(
        expect.stringMatching(IMAGE_URI_REGEX)
      );
      const castVoteRecordDirectoryContents = (
        await fs.readdir(join(outputDirectory.name, castVoteRecord.UniqueId))
      ).sort();
      expect(castVoteRecordDirectoryContents).toEqual(
        [
          `${castVoteRecord.UniqueId}-back.jpg`,
          `${castVoteRecord.UniqueId}-back.layout.json`,
          `${castVoteRecord.UniqueId}-front.jpg`,
          `${castVoteRecord.UniqueId}-front.layout.json`,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT,
        ].sort()
      );
    }
  }
});

test('generating as BMD ballots (non-gridlayouts election)', async () => {
  const electionDefinitionPath =
    electionFamousNames2021Fixtures.electionJson.asFilePath();
  const outputDirectory = dirSync();

  expect(
    await run([
      '--electionDefinition',
      electionDefinitionPath,
      '--outputPath',
      outputDirectory.name,
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 1752 cast vote records to ${outputDirectory.name}\n`,
    stderr: '',
  });

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  for (const castVoteRecord of castVoteRecords) {
    expect(castVoteRecord.UniqueId).toEqual(expect.stringMatching(/[0-9]+/));
    expect(
      getWriteInsFromCastVoteRecord(castVoteRecord).every(
        (castVoteRecordWriteIn) => Boolean(castVoteRecordWriteIn.text)
      )
    ).toEqual(true);
    const writeIns = castVoteRecord.CVRSnapshot[0]!.CVRContest.flatMap(
      (contest) => contest.CVRContestSelection
    )
      .flatMap((contestSelection) => contestSelection.SelectionPosition)
      .map((selectionPosition) => selectionPosition.CVRWriteIn)
      .filter(
        (cvrWriteIn): cvrWriteIn is CVR.CVRWriteIn => cvrWriteIn !== undefined
      );
    expect(writeIns.every((writeIn) => isBmdWriteIn(writeIn))).toEqual(true);
    if (writeIns.length > 0) {
      expect(castVoteRecord.BallotImage).toBeDefined();
    } else {
      expect(castVoteRecord.BallotImage).toBeUndefined();
    }
  }
});

test('libs/fixtures are up to date - if this test fails run `pnpm generate-fixtures`', async () => {
  for (const fixtures of [
    electionGridLayoutNewHampshireTestBallotFixtures,
    electionTwoPartyPrimaryFixtures,
  ]) {
    const outputDirectory = dirSync();

    expect(
      await run([
        '--electionDefinition',
        fixtures.electionJson.asFilePath(),
        '--outputPath',
        outputDirectory.name,
      ])
    ).toMatchObject({
      exitCode: 0,
      stderr: '',
    });

    const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
      fixtures.castVoteRecordExport.asDirectoryPath()
    );
    expect(castVoteRecords[0]?.ElectionId).toEqual(
      fixtures.electionDefinition.ballotHash
    );
  }
});
