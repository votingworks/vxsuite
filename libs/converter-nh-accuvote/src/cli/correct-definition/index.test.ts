import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { DOMParser } from '@xmldom/xmldom';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { dirSync } from 'tmp';
import { main } from '.';
import { Stdio } from '..';
import * as accuvote from '../../convert/accuvote';
import { Config } from '../../convert/correct_definition';

test.each(['-h', '--help'])('help: %s', async (flag) => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main([flag], io)).toEqual(0);

  expect(io.stdout.toString()).toContain(
    `Usage: correct-definition --config <config-path>\n`
  );
  expect(io.stderr.toString()).toEqual('');
});

test('happy path', async () => {
  const workdir = dirSync().name;
  const definitionPath = join(workdir, 'definition.xml');
  const pdfPath = join(workdir, 'ballot.pdf');
  const outputPath = join(workdir, 'output');

  await writeFile(
    definitionPath,
    electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asBuffer()
  );
  await writeFile(
    pdfPath,
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asBuffer()
  );

  const config: Config = {
    cards: [
      {
        definitionPath: 'definition.xml',
        pdfPath: 'ballot.pdf',
        outputDir: 'output',
      },
    ],
  };
  const configPath = join(workdir, 'correct-definition-config.json');
  await writeFile(configPath, JSON.stringify(config, null, 2));

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main(['--config', configPath], io)).toEqual(0);

  const outputPdfPath = join(outputPath, 'PROOF-ballot.pdf');
  const outputDefinitionPath = join(outputPath, 'definition.xml');

  const stdout = io.stdout.toString();
  expect(stdout).toContain(`📝 ${outputDefinitionPath}`);
  expect(stdout).toContain(`📝 ${outputPdfPath}`);
  expect(io.stderr.toString()).toEqual('');

  // Ensure the PROOF PDF is valid
  const outputPdf = await readFile(outputPdfPath);
  await expect(outputPdf).toMatchPdfSnapshot();

  // Ensure the output definition is valid AccuVote XML
  const outputDefinitionXml = await readFile(outputDefinitionPath, 'utf8');
  accuvote
    .parseXml(
      new DOMParser().parseFromString(outputDefinitionXml).documentElement
    )
    .unsafeUnwrap();
});

test.each(['-c', '--config'])('%s without path', async (flag) => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main([flag], io)).not.toEqual(0);

  expect(io.stdout.toString()).toEqual('');
  expect(io.stderr.toString()).toContain(
    `Error: missing config path after ${flag}`
  );
});

test('no arguments', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main([], io)).not.toEqual(0);

  expect(io.stdout.toString()).toEqual('');
  expect(io.stderr.toString()).toContain('Error: missing config path');
});

test('invalid config', async () => {
  const workdir = dirSync().name;
  const configPath = join(workdir, 'correct-definition-config.json');
  await writeFile(configPath, JSON.stringify({}, null, 2));

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main(['--config', configPath], io)).not.toEqual(0);

  expect(io.stdout.toString()).toEqual('');
  expect(io.stderr.toString()).toContain('Error: invalid config file');
});

test('invalid argument', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };
  expect(await main(['--not-an-option'], io)).not.toEqual(0);

  expect(io.stdout.toString()).toEqual('');
  expect(io.stderr.toString()).toContain(
    'Error: unexpected argument: --not-an-option'
  );
});
