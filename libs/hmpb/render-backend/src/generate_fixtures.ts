import { join } from 'path';
import * as fs from 'fs';
import { Document } from '@votingworks/hmpb-layout';
import { finished } from 'stream/promises';
import { writeFile } from 'fs/promises';
import { convertPdfToGrayscale, renderDocumentToPdf } from './render_ballot';
import {
  allBubbleBallotDir,
  allBubbleBallotFixtures,
} from './all_bubble_ballot_fixtures';
import {
  famousNamesDir,
  famousNamesFixtures,
  fixturesDir,
  primaryElectionDir,
  primaryElectionFixtures,
  generalElectionFixtures,
} from './ballot_fixtures';

async function generateBallotFixture(
  fixtureDir: string,
  label: string,
  document: Document,
  options: { convertToGrayscale: boolean } = { convertToGrayscale: false }
) {
  // eslint-disable-next-line no-console
  console.log(
    `Generating: ${join(fixtureDir.replace(fixturesDir, ''), label)}`
  );
  fs.writeFileSync(
    join(fixtureDir, `${label}-document.json`),
    JSON.stringify(document, null, 2)
  );
  const pdf = renderDocumentToPdf(document);
  const outputPdfPath = join(fixtureDir, `${label}.pdf`);
  if (options.convertToGrayscale) {
    const grayscalePdf = await convertPdfToGrayscale(pdf);
    await writeFile(outputPdfPath, grayscalePdf);
  } else {
    const fileStream = fs.createWriteStream(outputPdfPath);
    pdf.pipe(fileStream);
    pdf.end();
    await finished(fileStream);
  }
}

async function generateAllBubbleBallotFixtures() {
  fs.mkdirSync(allBubbleBallotDir, { recursive: true });

  const { electionDefinition, blankBallot, filledBallot, cyclingTestDeck } =
    allBubbleBallotFixtures;

  fs.writeFileSync(
    join(allBubbleBallotDir, 'election.json'),
    electionDefinition.electionData
  );

  const ballots = {
    'blank-ballot': blankBallot,
    'filled-ballot': filledBallot,
    'cycling-test-deck': cyclingTestDeck,
  } as const;
  for (const [label, document] of Object.entries(ballots)) {
    await generateBallotFixture(allBubbleBallotDir, label, document);
  }
}

async function generateFamousNamesFixtures() {
  fs.mkdirSync(famousNamesDir, { recursive: true });
  const { electionDefinition, blankBallot, markedBallot } = famousNamesFixtures;

  fs.writeFileSync(
    join(famousNamesDir, 'election.json'),
    electionDefinition.electionData
  );

  const ballots = {
    'blank-ballot': blankBallot,
    'marked-ballot': markedBallot,
  } as const;
  for (const [label, document] of Object.entries(ballots)) {
    await generateBallotFixture(famousNamesDir, label, document);
  }
}

async function generateGeneralElectionFixtures() {
  for (const {
    electionDefinition,
    electionDir,
    blankBallot,
    markedBallot,
  } of generalElectionFixtures) {
    fs.mkdirSync(electionDir, { recursive: true });
    fs.writeFileSync(
      join(electionDir, 'election.json'),
      electionDefinition.electionData
    );

    const ballots = {
      'blank-ballot': blankBallot,
      'marked-ballot': markedBallot,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      await generateBallotFixture(electionDir, label, document);
    }
  }
}

async function generatePrimaryElectionFixtures() {
  fs.mkdirSync(primaryElectionDir, { recursive: true });
  const { electionDefinition, mammalParty, fishParty } =
    primaryElectionFixtures;

  fs.writeFileSync(
    join(primaryElectionDir, 'election.json'),
    electionDefinition.electionData
  );

  for (const partyFixtures of [mammalParty, fishParty]) {
    const { partyLabel, blankBallot, markedBallot, otherPrecinctBlankBallot } =
      partyFixtures;
    const ballots = {
      [`${partyLabel}-blank-ballot`]: blankBallot,
      [`${partyLabel}-marked-ballot`]: markedBallot,
      [`${partyLabel}-other-precinct-blank-ballot`]: otherPrecinctBlankBallot,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      await generateBallotFixture(primaryElectionDir, label, document, {
        convertToGrayscale: true,
      });
    }
  }
}

export async function main(): Promise<void> {
  fs.rmSync(fixturesDir, { recursive: true });

  await generateAllBubbleBallotFixtures();
  await generateFamousNamesFixtures();
  await generateGeneralElectionFixtures();
  await generatePrimaryElectionFixtures();
}
