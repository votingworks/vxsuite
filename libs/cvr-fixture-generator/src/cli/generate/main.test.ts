import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { CVR, CastVoteRecordExportFileName } from '@votingworks/types';
import fs from 'fs/promises';
import { join, resolve } from 'path';
import { dirSync } from 'tmp';
import {
  getWriteInsFromCastVoteRecord,
  isBmdWriteIn,
} from '@votingworks/utils';
import { readCastVoteRecordExport } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { main } from './main';
import { IMAGE_URI_REGEX } from '../../utils';

jest.setTimeout(30_000);

const electionDefinitionPathNhTestBallot =
  electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asFilePath();

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

async function readAndValidateCastVoteRecordExport(
  exportDirectoryPath: string
): Promise<{
  castVoteRecordReportMetadata: CVR.CastVoteRecordReport;
  castVoteRecords: CVR.CVR[];
}> {
  const readResult = await readCastVoteRecordExport(exportDirectoryPath);
  assert(readResult.isOk());
  const { castVoteRecordExportMetadata, castVoteRecordIterator } =
    readResult.ok();
  const castVoteRecords: CVR.CVR[] = [];
  for await (const castVoteRecordResult of castVoteRecordIterator) {
    assert(castVoteRecordResult.isOk());
    const { castVoteRecord } = castVoteRecordResult.ok();
    castVoteRecords.push(castVoteRecord);
  }
  return {
    castVoteRecordReportMetadata:
      castVoteRecordExportMetadata.castVoteRecordReportMetadata,
    castVoteRecords,
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

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  expect(castVoteRecords).toHaveLength(184);
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
    'scanner1,scanner2',
  ]);

  const { castVoteRecords } = await readAndValidateCastVoteRecordExport(
    outputDirectory.name
  );
  for (const castVoteRecord of castVoteRecords) {
    expect(castVoteRecord.CreatingDeviceId).toMatch(/scanner[12]/);
  }
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
    expect(castVoteRecord.BallotImage).toBeUndefined();
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
  }
});
