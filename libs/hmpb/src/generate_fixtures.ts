import { mkdir, rm, writeFile } from 'fs/promises';
import { BallotPaperSize } from '@votingworks/types';
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
  const generated = await famousNamesFixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );
  await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
  await writeFile(fixtures.markedBallotPath, generated.markedBallotPdf);
}

async function generateGeneralElectionFixtures(renderer: Renderer) {
  const allFixtures = generalElectionFixtures;
  const allGenerated = await generalElectionFixtures.generate(renderer);
  for (const paperSize of Object.values(BallotPaperSize)) {
    const fixtures = allFixtures[paperSize];
    const generated = allGenerated[paperSize];
    await mkdir(fixtures.electionDir, { recursive: true });
    await writeFile(
      fixtures.electionPath,
      generated.electionDefinition.electionData
    );
    await writeFile(fixtures.blankBallotPath, generated.blankBallotPdf);
    await writeFile(fixtures.markedBallotPath, generated.markedBallotPdf);
  }
}

async function generatePrimaryElectionFixtures(renderer: Renderer) {
  const fixtures = primaryElectionFixtures;
  const generated = await primaryElectionFixtures.generate(renderer);
  await mkdir(fixtures.dir, { recursive: true });
  await writeFile(
    fixtures.electionPath,
    generated.electionDefinition.electionData
  );

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
