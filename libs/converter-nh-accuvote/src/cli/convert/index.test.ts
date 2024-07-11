import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable, mockOf } from '@votingworks/test-utils';
import { createImageData } from 'canvas';
import { readFileSync } from 'fs';
import { dirSync } from 'tmp';
import { err, ok } from '@votingworks/basics';
import { join } from 'path';
import { main } from '.';
import { Stdio } from '..';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { ConvertIssueKind } from '../../convert/types';

jest.mock('../../convert/convert_election_definition');
jest.mock(
  '@votingworks/image-utils',
  (): Partial<typeof import('@votingworks/image-utils')> => ({
    imageDebugger: jest.fn(),
    loadImage: jest.fn(),
    loadImageData: jest.fn().mockReturnValue(createImageData(1, 1)),
    toImageData: jest.fn().mockReturnValue(createImageData(1, 1)),
  })
);

test('--help', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['--help'], io)).toEqual(0);

  expect(io.stdout.toString()).toMatchInlineSnapshot(`
"Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
});

test('-h', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-h'], io)).toEqual(0);

  expect(io.stdout.toString()).toMatchInlineSnapshot(`
"Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
});

test('missing output after --output', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    [
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
      'ballot.pdf',
      '--output',
    ],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
"Error: missing output path after --output
Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
  expect(exitCode).toEqual(1);
});

test('unexpected option', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--nope'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
"Error: unknown option: --nope
Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
  expect(exitCode).toEqual(1);
});

test('unexpected argument', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    ['definition.xml', 'ballot.pdf', 'what-is-this.json'],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
"Error: unexpected argument: what-is-this.json
Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
  expect(exitCode).toEqual(1);
});

test('missing definition path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['ballot.pdf'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
"Error: missing definition path
Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
  expect(exitCode).toEqual(1);
});

test('missing ballot path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['definition.xml'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
"Error: missing ballot pdf paths
Usage:
  General Election:
    convert <definition.xml> <ballot.pdf>
      -o <output-dir> [--debug]
  Primary Election:
    convert <party1-definition.xml> <party1-ballot.pdf>
      <party2-definition.xml> <party2-ballot.pdf> [... more parties ...]
      -o <output-dir> [--debug]
"
`);
  expect(exitCode).toEqual(1);
});

test('convert to file', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const { electionDefinition } = electionGridLayoutNewHampshireHudsonFixtures;

  mockOf(convertElectionDefinition).mockResolvedValue(
    ok({
      result: { electionDefinition, ballotPdfsWithMetadata: new Map() },
      issues: [],
    })
  );

  const outputDir = dirSync();
  const exitCode = await main(
    [
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
      electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
      '-o',
      outputDir.name,
    ],
    io
  );

  expect({
    exitCode,
    stdout: io.stdout.toString(),
    stderr: io.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: '',
    stderr: expect.stringMatching(/Writing:/),
  });

  expect(readFileSync(join(outputDir.name, 'election.json'), 'utf-8')).toEqual(
    electionDefinition.electionData
  );
});

test('convert fails', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  mockOf(convertElectionDefinition).mockResolvedValue(
    err({
      issues: [
        {
          kind: ConvertIssueKind.MissingDefinitionProperty,
          message: 'ElectionID is missing',
          property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
        },
      ],
    })
  );

  const exitCode = await main(
    [
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
      electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
      '-o',
      '-',
    ],
    io
  );

  expect({
    exitCode,
    stdout: io.stdout.toString(),
    stderr: io.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      'error: conversion completed with issues:\n- ElectionID is missing\n',
  });
});
