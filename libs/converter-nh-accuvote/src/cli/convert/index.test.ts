import { err, ok } from '@votingworks/basics';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable, mockOf } from '@votingworks/test-utils';
import { createImageData } from 'canvas';
import { readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { dirSync, tmpNameSync } from 'tmp';
import { main } from '.';
import { Stdio, stripAnsi } from '..';
import { convertElectionDefinition } from '../../convert/convert_election_definition';
import { ConvertConfig, ConvertIssueKind } from '../../convert/types';

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

test.each(['-h', '--help'])('help: %s', async (flag) => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main([flag], io)).toEqual(0);

  expect(stripAnsi(io.stdout.toString())).toMatchSnapshot();
});

test('missing config file after --config', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--config'], io);

  expect(stripAnsi(io.stderr.toString())).toMatchSnapshot();
  expect(exitCode).toEqual(1);
});

test('unexpected option', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  const exitCode = await main(['--nope'], io);

  expect(stripAnsi(io.stderr.toString())).toMatchSnapshot();
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
      result: {
        electionDefinition,
        ballotPdfs: new Map(),
        correctedDefinitions: new Map(),
      },
      issues: [],
    })
  );

  const config: ConvertConfig = {
    electionType: 'general',
    jurisdictions: [
      {
        name: 'Hudson',
        cards: [
          {
            definition:
              electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
            ballot:
              electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
          },
        ],
        output: dirSync().name,
      },
    ],
  };

  const configPath = tmpNameSync({ postfix: '.json' });
  await writeFile(configPath, JSON.stringify(config, null, 2));

  const exitCode = await main(['-c', configPath], io);

  expect({
    exitCode,
    stdout: io.stdout.toString(),
    stderr: io.stderr.toString(),
  }).toEqual({
    exitCode: 0,
    stdout: '',
    stderr: expect.stringMatching(/Hudson \(1\/1\)/),
  });

  expect(
    readFileSync(
      join(config.jurisdictions[0]!.output, 'election.json'),
      'utf-8'
    )
  ).toEqual(electionDefinition.electionData);
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

  const config: ConvertConfig = {
    electionType: 'general',
    jurisdictions: [
      {
        name: 'Hudson',
        cards: [
          {
            definition:
              electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
            ballot:
              electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
          },
        ],
        output: dirSync().name,
      },
    ],
  };

  const configPath = tmpNameSync({ postfix: '.json' });
  await writeFile(configPath, JSON.stringify(config, null, 2));

  const exitCode = await main(['-c', configPath], io);

  expect({
    exitCode,
    stdout: io.stdout.toString(),
    stderr: io.stderr.toString(),
  }).toEqual({
    exitCode: 1,
    stdout: '',
    stderr: expect.stringContaining(
      'error: conversion completed with issues:\n- ElectionID is missing\n'
    ),
  });
});
