import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { z } from 'zod';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { safeParseJson } from '@votingworks/types';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileSync } from 'tmp';
import { main } from './main';

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
  expect(await run([])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing ballot package'),
  });
});

test('generate with defaults', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();
  const outputFile = fileSync({ postfix: '.jsonl' });

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputFile.name,
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 168 cast vote records to ${outputFile.name}\n`,
    stderr: '',
  });

  expect(
    readFileSync(outputFile.name, 'utf8').split('\n').filter(Boolean)
  ).toHaveLength(168);
});

test('generate with custom number of records below the suggested number', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();
  const outputFile = fileSync({ postfix: '.jsonl' });

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputFile.name,
      '--numBallots',
      '100',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 100 cast vote records to ${outputFile.name}\n`,
    stderr: expect.stringContaining('WARNING:'),
  });

  expect(
    readFileSync(outputFile.name, 'utf8').split('\n').filter(Boolean)
  ).toHaveLength(100);
});

test('generate with custom number of records above the suggested number', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();
  const outputFile = fileSync({ postfix: '.jsonl' });

  expect(
    await run([
      '--ballotPackage',
      ballotPackagePath,
      '--outputPath',
      outputFile.name,
      '--numBallots',
      '3000',
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 3000 cast vote records to ${outputFile.name}\n`,
    stderr: '',
  });

  expect(
    readFileSync(outputFile.name, 'utf8').split('\n').filter(Boolean)
  ).toHaveLength(3000);
});

test('generate live mode CVRs', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();
  const outputFile = fileSync({ postfix: '.jsonl' });

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputFile.name,
    '--liveBallots',
    '--numBallots',
    '10',
  ]);

  const contents = readFileSync(outputFile.name, 'utf8')
    .split('\n')
    .filter(Boolean);
  for (const cvr of contents) {
    expect(
      safeParseJson(cvr, z.object({ _testBallot: z.boolean() })).unsafeUnwrap()[
        '_testBallot'
      ]
    ).toEqual(false);
  }
});

test('output to stdout', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();

  const { exitCode, stdout } = await run([
    '--ballotPackage',
    ballotPackagePath,
    '--numBallots',
    '10',
  ]);

  expect(exitCode).toEqual(0);
  expect(stdout.split('\n').filter(Boolean)).toHaveLength(10);
});

test('specifying scanner names', async () => {
  const ballotPackagePath =
    electionMinimalExhaustiveSampleFixtures.ballotPackage.asFilePath();
  const outputFile = fileSync({ postfix: '.jsonl' });

  await run([
    '--ballotPackage',
    ballotPackagePath,
    '--outputPath',
    outputFile.name,
    '--scannerNames',
    'scanner1,scanner2',
  ]);

  const contents = readFileSync(outputFile.name, 'utf8')
    .split('\n')
    .filter(Boolean);
  for (const cvr of contents) {
    expect(
      safeParseJson(cvr, z.object({ _scannerId: z.string() })).unsafeUnwrap()[
        '_scannerId'
      ]
    ).toMatch(/scanner[12]/);
  }
});
