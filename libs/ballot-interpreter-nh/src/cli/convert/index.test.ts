import { fakeReadable, fakeWritable, mockOf } from '@votingworks/test-utils';
import { safeParseElection } from '@votingworks/types';
import { createImageData } from 'canvas';
import { readFileSync } from 'fs';
import { fileSync } from 'tmp';
import { main } from '.';
import { Stdio } from '..';
import {
  getFixturePath,
  HudsonFixtureName,
  readFixtureJson,
} from '../../../test/fixtures';
import { convertElectionDefinition, ConvertIssueKind } from '../../convert';

jest.mock('../../convert');
jest.mock('../../images', (): typeof import('../../images') => ({
  binarize: jest.fn(),
  matchTemplate: jest.fn(),
  matchTemplateImage: jest.fn(),
  scoreTemplateMatch: jest.fn(),
  simpleRemoveNoise: jest.fn(),
}));
jest.mock(
  '@votingworks/image-utils',
  (): Partial<typeof import('@votingworks/image-utils')> => ({
    imageDebugger: jest.fn(),
    loadImage: jest.fn(),
    toImageData: jest.fn().mockReturnValue(createImageData(1, 1)),
  })
);

test('--help', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['--help'], io)).toBe(0);

  expect(io.stdout.toString()).toMatchInlineSnapshot(`
    "usage: convert <definition.xml> <front-ballot.jpg> <back-ballot.jpg> [-o <output.json>] [--debug]
    "
  `);
});

test('-h', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-h'], io)).toBe(0);

  expect(io.stdout.toString()).toMatchInlineSnapshot(`
    "usage: convert <definition.xml> <front-ballot.jpg> <back-ballot.jpg> [-o <output.json>] [--debug]
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
      getFixturePath(HudsonFixtureName, 'definition', '.xml'),
      'front.jpeg',
      'back.jpeg',
      '--output',
    ],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing output path after --output
    "
  `);
  expect(exitCode).toBe(1);
});

test('unexpected option', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--nope'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: unknown option: --nope
    "
  `);
  expect(exitCode).toBe(1);
});

test('unexpected argument', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(
    ['definition.xml', 'front.jpeg', 'back.jpeg', 'what-is-this.json'],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: unexpected argument: what-is-this.json
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing definition path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['front.jpeg', 'back.jpeg'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing definition path
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing front ballot path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['definition.xml'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing front ballot path
    "
  `);
  expect(exitCode).toBe(1);
});

test('missing back ballot path', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['definition.xml', 'front.jpeg'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing back ballot path
    "
  `);
  expect(exitCode).toBe(1);
});

test('convert to stdout', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const election = safeParseElection(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();

  mockOf(convertElectionDefinition).mockReturnValue({
    success: true,
    election,
    issues: [],
  });

  const exitCode = await main(
    [
      getFixturePath(HudsonFixtureName, 'definition', '.xml'),
      'front.jpeg',
      'back.jpeg',
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
    exitCode: 0,
    stdout: JSON.stringify(election, null, 2),
    stderr: '',
  });
});

test('convert to file', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const election = safeParseElection(
    await readFixtureJson(HudsonFixtureName, 'election')
  ).unsafeUnwrap();

  mockOf(convertElectionDefinition).mockReturnValue({
    success: true,
    election,
    issues: [],
  });

  const outputFile = fileSync();
  const exitCode = await main(
    [
      getFixturePath(HudsonFixtureName, 'definition', '.xml'),
      'front.jpeg',
      'back.jpeg',
      '-o',
      outputFile.name,
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
    stderr: '',
  });

  expect(readFileSync(outputFile.name, 'utf-8')).toEqual(
    JSON.stringify(election, null, 2)
  );
});

test('convert fails', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  mockOf(convertElectionDefinition).mockReturnValue({
    success: false,
    issues: [
      {
        kind: ConvertIssueKind.MissingDefinitionProperty,
        message: 'ElectionID is missing',
        property: 'AVSInterface > AccuvoteHeaderInfo > ElectionID',
      },
    ],
  });

  const exitCode = await main(
    [
      getFixturePath(HudsonFixtureName, 'definition', '.xml'),
      'front.jpeg',
      'back.jpeg',
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
