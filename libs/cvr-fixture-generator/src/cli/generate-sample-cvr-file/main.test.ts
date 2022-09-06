import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { z } from 'zod';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { safeParseJson } from '@votingworks/types';
import { readFileSync, writeFileSync } from 'fs';
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
    stdout: expect.stringContaining('--electionPath'),
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

test('missing election path', async () => {
  expect(await run([])).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining('Missing election path'),
  });
});

test('generate with defaults', async () => {
  const electionFile = fileSync({ postfix: '.json' });
  const outputFile = fileSync({ postfix: '.jsonl' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  expect(
    await run([
      '--electionPath',
      electionFile.name,
      '--outputPath',
      outputFile.name,
    ])
  ).toEqual({
    exitCode: 0,
    stdout: `Wrote 2628 cast vote records to ${outputFile.name}\n`,
    stderr: '',
  });

  expect(
    readFileSync(outputFile.name, 'utf8').split('\n').filter(Boolean)
  ).toHaveLength(2628);
});

test('generate with custom number of records below the suggested number', async () => {
  const electionFile = fileSync({ postfix: '.json' });
  const outputFile = fileSync({ postfix: '.jsonl' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  expect(
    await run([
      '--electionPath',
      electionFile.name,
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
  const electionFile = fileSync({ postfix: '.json' });
  const outputFile = fileSync({ postfix: '.jsonl' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  expect(
    await run([
      '--electionPath',
      electionFile.name,
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
  const electionFile = fileSync({ postfix: '.json' });
  const outputFile = fileSync({ postfix: '.jsonl' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  await run([
    '--electionPath',
    electionFile.name,
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
  const electionFile = fileSync({ postfix: '.json' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  const { exitCode, stdout } = await run([
    '--electionPath',
    electionFile.name,
    '--numBallots',
    '10',
  ]);

  expect(exitCode).toEqual(0);
  expect(stdout.split('\n').filter(Boolean)).toHaveLength(10);
});

test('specifying scanner names', async () => {
  const electionFile = fileSync({ postfix: '.json' });
  const outputFile = fileSync({ postfix: '.jsonl' });

  writeFileSync(
    electionFile.fd,
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  await run([
    '--electionPath',
    electionFile.name,
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
