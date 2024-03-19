import { join } from 'path';
import * as fs from 'fs';
import { generateAllBubbleBallotFixtures } from './all_bubble_ballot_fixtures';
import {
  generateFamousNamesFixtures,
  generatePrimaryElectionFixtures,
  generateGeneralElectionFixtures,
  fixturesDir,
} from './ballot_fixtures';
import { Renderer } from './next/renderer';
import { createPlaywrightRenderer } from './next';

async function writeAllBubbleBallotFixtures(renderer: Renderer) {
  const {
    dir,
    electionDefinition,
    blankBallotPath,
    blankBallotPdf,
    filledBallotPath,
    filledBallotPdf,
    cyclingTestDeckPath,
    cyclingTestDeckPdf,
  } = await generateAllBubbleBallotFixtures(renderer);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(join(dir, 'election.json'), electionDefinition.electionData);
  fs.writeFileSync(blankBallotPath, blankBallotPdf);
  fs.writeFileSync(filledBallotPath, filledBallotPdf);
  fs.writeFileSync(cyclingTestDeckPath, cyclingTestDeckPdf);
}

async function writeFamousNamesFixtures(renderer: Renderer) {
  const {
    dir,
    electionDefinition,
    blankBallotPdf,
    blankBallotPath,
    markedBallotPdf,
    markedBallotPath,
  } = await generateFamousNamesFixtures(renderer);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, 'election.json'), electionDefinition.electionData);
  fs.writeFileSync(blankBallotPath, blankBallotPdf);
  fs.writeFileSync(markedBallotPath, markedBallotPdf);
}

async function writeGeneralElectionFixtures(renderer: Renderer) {
  for (const {
    electionDefinition,
    electionDir,
    blankBallotPath,
    blankBallotPdf,
    markedBallotPath,
    markedBallotPdf,
  } of await generateGeneralElectionFixtures(renderer)) {
    fs.mkdirSync(electionDir, { recursive: true });
    fs.writeFileSync(
      join(electionDir, 'election.json'),
      electionDefinition.electionData
    );
    fs.writeFileSync(blankBallotPath, blankBallotPdf);
    fs.writeFileSync(markedBallotPath, markedBallotPdf);
  }
}

async function writePrimaryElectionFixtures(renderer: Renderer) {
  const { electionDefinition, dir, mammalParty, fishParty } =
    await generatePrimaryElectionFixtures(renderer);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(join(dir, 'election.json'), electionDefinition.electionData);

  for (const partyFixtures of [mammalParty, fishParty]) {
    const {
      blankBallotPath,
      blankBallotPdf,
      otherPrecinctBlankBallotPath,
      otherPrecinctBlankBallotPdf,
      markedBallotPath,
      markedBallotPdf,
    } = partyFixtures;
    fs.writeFileSync(blankBallotPath, blankBallotPdf);
    fs.writeFileSync(otherPrecinctBlankBallotPath, otherPrecinctBlankBallotPdf);
    fs.writeFileSync(markedBallotPath, markedBallotPdf);
  }
}

export async function main(): Promise<void> {
  fs.rmSync(fixturesDir, { recursive: true, force: true });
  const renderer = await createPlaywrightRenderer();

  await writeAllBubbleBallotFixtures(renderer);
  await writeFamousNamesFixtures(renderer);
  await writeGeneralElectionFixtures(renderer);
  await writePrimaryElectionFixtures(renderer);

  await renderer.cleanup();
}
