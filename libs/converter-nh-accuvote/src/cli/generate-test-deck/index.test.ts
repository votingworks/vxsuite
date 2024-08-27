import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { fakeReadable, fakeWritable } from '@votingworks/test-utils';
import { BallotType } from '@votingworks/types';
import { readdir, readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { dirSync, tmpNameSync } from 'tmp';
import { typedAs } from '@votingworks/basics';
import { main } from '.';
import { Stdio, stripAnsi } from '..';
import {
  ConvertConfigJurisdiction,
  ConvertOutputManifest,
  GenerateTestDeckConfig,
} from '../../convert/types';

async function prepareInputs({
  config,
  electionPath = electionGridLayoutNewHampshireTestBallotFixtures.electionJson.asFilePath(),
}: { config?: GenerateTestDeckConfig; electionPath?: string } = {}) {
  const pdfPath =
    electionGridLayoutNewHampshireTestBallotFixtures.templatePdf.asFilePath();
  const convertOutputPath = dirSync().name;
  const convertCardConfig: ConvertConfigJurisdiction = {
    name: 'Test',
    cards: [
      {
        ballot: pdfPath,
        definition:
          electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asFilePath(),
      },
    ],
    output: convertOutputPath,
  };
  const convertOutputManifest: ConvertOutputManifest = {
    electionPath,
    config: convertCardConfig,
    cards: [
      {
        ballotStyleId: 'ballot-style-c43745c4',
        precinctId: 'town-id-00701-precinct',
        ballotType: BallotType.Precinct,
        printBallotPath: pdfPath,
        correctedDefinitionPath: 'not-used',
        proofBallotPath: 'not-used',
      },
    ],
  };
  const manifestPath = tmpNameSync({ postfix: '.json' });
  await writeFile(manifestPath, JSON.stringify(convertOutputManifest, null, 2));
  const configPath = tmpNameSync({ postfix: '.json' });
  const testDeckOutputPath = dirSync().name;
  await writeFile(
    configPath,
    JSON.stringify(
      typedAs<GenerateTestDeckConfig>(
        config ?? {
          electionType: 'general',
          jurisdictions: [
            {
              name: 'Test',
              input: manifestPath,
              output: testDeckOutputPath,
            },
          ],
        }
      ),
      null,
      2
    )
  );

  return { pdfPath, configPath, testDeckOutputPath };
}

test.each(['-h', '--help'])('help: %s', async (arg) => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main([arg], io)).toEqual(0);
  expect(stripAnsi(io.stdout.toString())).toMatchSnapshot();
});

test('happy path', async () => {
  const { pdfPath, configPath, testDeckOutputPath } = await prepareInputs();

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-c', configPath], io)).toEqual(0);

  expect(stripAnsi(io.stderr.toString())).toContain('📍 Test (1/1)');
  expect(stripAnsi(io.stderr.toString())).toContain(
    '📄 Ballot Style: ballot-style-c43745c4 (Precinct: town-id-00701-precinct)'
  );

  expect(await readdir(testDeckOutputPath)).toEqual([basename(pdfPath)]);
  await expect(
    await readFile(join(testDeckOutputPath, basename(pdfPath)))
  ).toMatchPdfSnapshot();
});

test('invalid options', async () => {
  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main([], io)).toEqual(1);
  expect(stripAnsi(io.stderr.toString())).toContain(
    'Error: Missing required argument: --config'
  );
});

test('invalid manifest', async () => {
  const { configPath } = await prepareInputs({
    config: {
      electionType: 'general',
      jurisdictions: [
        {
          name: 'Test',
          input: 'invalid-path',
          output: 'not-used',
        },
      ],
    },
  });

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-c', configPath], io)).toEqual(1);
  expect(stripAnsi(io.stderr.toString())).toContain('Error: Invalid manifest');
});

test('missing election file', async () => {
  const { configPath } = await prepareInputs({
    electionPath: 'invalid-path',
  });

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-c', configPath], io)).toEqual(1);
  expect(stripAnsi(io.stderr.toString())).toContain(
    'Error: Cannot read election file'
  );
});

test('invalid election file', async () => {
  const electionPath = tmpNameSync({ postfix: '.json' });
  await writeFile(electionPath, 'invalid-json');

  const { configPath } = await prepareInputs({ electionPath });

  const io: Stdio = {
    stdin: fakeReadable(),
    stdout: fakeWritable(),
    stderr: fakeWritable(),
  };

  expect(await main(['-c', configPath], io)).toEqual(1);
  expect(stripAnsi(io.stderr.toString())).toContain('Error: Invalid election');
});
