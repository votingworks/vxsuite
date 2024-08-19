import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { dirSync, tmpNameSync } from 'tmp';
import { PDFDocument } from 'pdf-lib';
import * as correctDefinition from './correct_definition';

test('single card', async () => {
  const outputDir = dirSync().name;
  const config: correctDefinition.Config = {
    cards: [
      {
        definitionPath:
          electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath(),
        pdfPath:
          electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
        outputDir,
      },
    ],
  };

  const configPath = tmpNameSync({ postfix: '.json' });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const resolvedConfig = (
    await correctDefinition.resolveConfig(configPath, config)
  ).unsafeUnwrap();

  const [resolvedCardConfig] = resolvedConfig.cards;
  const corrected = (
    await correctDefinition.correctCandidateCoordinates(resolvedCardConfig!)
  ).unsafeUnwrap();
  expect(corrected).toMatchSnapshot();
});

test('multiple cards in one PDF', async () => {
  const workdir = dirSync().name;
  const definitionPath =
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asFilePath();
  const ballotPdf =
    electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asBuffer();

  // duplicate the first two pages of the ballot PDF
  const pdfDocument = await PDFDocument.load(ballotPdf);
  for (const page of await pdfDocument.copyPages(pdfDocument, [0, 1])) {
    pdfDocument.addPage(page);
  }
  const pdfPath = join(workdir, 'ballot.pdf');
  await writeFile(pdfPath, await pdfDocument.save());

  const outputDir = dirSync().name;
  const config: correctDefinition.Config = {
    cards: [
      {
        definitionPath,
        pdfPath,
        outputDir,
        frontPage: 1,
        backPage: 2,
      },
      {
        definitionPath,
        pdfPath,
        outputDir,
        frontPage: 3,
        backPage: 4,
      },
    ],
  };

  const configPath = tmpNameSync({ postfix: '.json' });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const resolvedConfig = (
    await correctDefinition.resolveConfig(configPath, config)
  ).unsafeUnwrap();

  const [resolvedCardConfig1, resolvedCardConfig2] = resolvedConfig.cards;
  const corrected1 = (
    await correctDefinition.correctCandidateCoordinates(resolvedCardConfig1!)
  ).unsafeUnwrap();
  const corrected2 = (
    await correctDefinition.correctCandidateCoordinates(resolvedCardConfig2!)
  ).unsafeUnwrap();
  expect(corrected1).toEqual(corrected2);
});

test.each([
  ['invalid XML', 'invalid'],
  ['invalid definition', '<?xml version="1.0"?><AVSInterface />'],
])('definition parse error: %s', async (name, xml) => {
  const outputDir = dirSync().name;
  const definitionPath = tmpNameSync({ postfix: '.xml' });
  await writeFile(definitionPath, xml);
  const config: correctDefinition.Config = {
    cards: [
      {
        definitionPath,
        pdfPath:
          electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asFilePath(),
        outputDir,
      },
    ],
  };

  const configPath = tmpNameSync({ postfix: '.json' });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const resolveConfigError = (
    await correctDefinition.resolveConfig(configPath, config)
  ).unsafeUnwrapErr();

  expect(resolveConfigError.message).toContain('Failed to parse definition');
});
