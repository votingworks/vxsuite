import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable, mockOf } from '@votingworks/test-utils';
import { createImageData } from 'canvas';
import { readFileSync } from 'fs';
import { fileSync } from 'tmp';
import { main } from '.';
import { Stdio } from '..';
import { convertElectionDefinition, ConvertIssueKind } from '../../convert';

jest.mock('../../convert');
jest.mock('../../images', (): typeof import('../../images') => ({
  matchTemplate: jest.fn(),
  scoreTemplateMatch: jest.fn(),
}));
jest.mock(
  '@votingworks/image-utils',
  (): Partial<typeof import('@votingworks/image-utils')> => {
    const notImplementedMock = jest.fn().mockImplementation(() => {
      throw new Error('not implemented');
    });

    const grayImageMock: jest.Mocked<
      import('@votingworks/image-utils').GrayImage
    > = {
      width: 1,
      height: 1,
      channels: 1,
      length: 1,
      step: 1,
      isRgba: jest.fn().mockReturnValue(false),
      isGray: jest.fn().mockReturnValue(true),
      at: notImplementedMock,
      asDataUrl: notImplementedMock,
      asImageData: notImplementedMock,
      binarize: notImplementedMock,
      copy: notImplementedMock,
      count: notImplementedMock,
      crop: notImplementedMock,
      diff: notImplementedMock,
      fill: notImplementedMock,
      outline: notImplementedMock,
      raw: notImplementedMock,
      rotate180: notImplementedMock,
      row: notImplementedMock,
      setAt: notImplementedMock,
      setRaw: notImplementedMock,
      toGray: jest.fn().mockImplementation(() => grayImageMock),
      toRgba: notImplementedMock,
    };

    return {
      imageDebugger: jest.fn(),
      loadImage: jest.fn().mockReturnValue(grayImageMock),
      loadGrayImage: jest.fn().mockReturnValue(grayImageMock),
      toImageData: jest.fn().mockReturnValue(createImageData(1, 1)),
      wrapImageData: jest.fn().mockReturnValue(grayImageMock),
    };
  }
);

test('--help', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['--help'], io)).toEqual(0);

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

  expect(await main(['-h'], io)).toEqual(0);

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
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
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
    "error: unknown option: --nope
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
    ['definition.xml', 'front.jpeg', 'back.jpeg', 'what-is-this.json'],
    io
  );

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: unexpected argument: what-is-this.json
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

  const exitCode = await main(['front.jpeg', 'back.jpeg'], io);

  expect(io.stderr.toString()).toMatchInlineSnapshot(`
    "error: missing definition path
    "
  `);
  expect(exitCode).toEqual(1);
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
  expect(exitCode).toEqual(1);
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
  expect(exitCode).toEqual(1);
});

test('convert to stdout', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const { election } = electionGridLayoutNewHampshireHudsonFixtures;

  mockOf(convertElectionDefinition).mockReturnValue({
    success: true,
    election,
    issues: [],
  });

  const exitCode = await main(
    [
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
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

  const { election } = electionGridLayoutNewHampshireHudsonFixtures;

  mockOf(convertElectionDefinition).mockReturnValue({
    success: true,
    election,
    issues: [],
  });

  const outputFile = fileSync();
  const exitCode = await main(
    [
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
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
      electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
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
