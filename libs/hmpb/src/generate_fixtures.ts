import { mkdir, rm, writeFile } from 'node:fs/promises';
import { iter } from '@votingworks/basics';
import { writeImageData } from '@votingworks/image-utils';
import { allBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  fixturesDir,
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionFixtures,
} from './ballot_fixtures';
import { Renderer } from './renderer';
import { createPlaywrightRenderer } from './playwright_renderer';

async function generateAllBubbleBallotFixtures(renderer: Renderer) {
  const fixtures = allBubbleBallotFixtures;
  const generated = await allBubbleBallotFixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.filledBallotPath, generated.filledBallotPdf);
  await writeFile(fixtures.cyclingTestDeckPath, generated.cyclingTestDeckPdf);
}

async function generateFamousNamesFixtures(renderer: Renderer) {
  const fixtures = famousNamesFixtures;
  const generated = await fixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.markedBallotPath, generated.markedBallotPdf);
}

async function generateGeneralElectionFixtures(renderer: Renderer) {
  const fixtures = generalElectionFixtures;
  const allGenerated = await fixtures.generate(renderer, fixtures.fixtureSpecs);
  for (const [spec, generated] of iter(fixtures.fixtureSpecs).zip(
    allGenerated
  )) {
    await mkdir(spec.electionDir, { recursive: true });
    await writeFile(
      spec.electionPath,
      generated.electionDefinition.electionData
    );
    await writeFile(spec.blankBallotPath, generated.blankBallotPdf);
    await writeFile(spec.markedBallotPath, generated.markedBallotPdf);
    if (generated.blankBallotPageImages) {
      for (const [i, image] of generated.blankBallotPageImages.entries()) {
        await writeImageData(
          spec.blankBallotPath.replace('.pdf', `-p${i + 1}.jpg`),
          image
        );
      }
    }
  }
}

async function generatePrimaryElectionFixtures(renderer: Renderer) {
  const fixtures = primaryElectionFixtures;
  const generated = await fixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });

  for (const party of ['mammalParty', 'fishParty'] as const) {
    const partyFixtures = fixtures[party];
    const partyGenerated = generated[party];
    await writeFile(
      partyFixtures.blankBallotPath,
      partyGenerated.blankBallotPdf
    );
    await writeFile(
      partyFixtures.otherPrecinctBlankBallotPath,
      partyGenerated.otherPrecinctBlankBallotPdf
    );
    await writeFile(
      partyFixtures.markedBallotPath,
      partyGenerated.markedBallotPdf
    );
  }
}

export async function main(): Promise<void> {
  await rm(fixturesDir, { recursive: true, force: true });
  const renderer = await createPlaywrightRenderer();

  await generateAllBubbleBallotFixtures(renderer);
  await generateFamousNamesFixtures(renderer);
  await generateGeneralElectionFixtures(renderer);
  await generatePrimaryElectionFixtures(renderer);

  await renderer.cleanup();
}
