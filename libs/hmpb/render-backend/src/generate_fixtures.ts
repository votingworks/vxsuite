import { join } from 'path';
import * as fs from 'fs';
import { Document } from '@votingworks/hmpb-layout';
import { renderDocumentToPdf } from './render_ballot';
import {
  allBubbleBallotDir,
  allBubbleBallotFixtures,
} from './all_bubble_ballot_fixtures';
import {
  famousNamesDir,
  famousNamesFixtures,
  fixturesDir,
  sampleElectionFixtures,
} from './ballot_fixtures';

function generateBallotFixture(
  fixtureDir: string,
  label: string,
  document: Document
): void {
  fs.writeFileSync(
    join(fixtureDir, `${label}-document.json`),
    JSON.stringify(document, null, 2)
  );
  const pdf = renderDocumentToPdf(document);
  pdf.pipe(fs.createWriteStream(join(fixtureDir, `${label}.pdf`)));
  pdf.end();
}

function generateAllBubbleBallotFixtures(): void {
  fs.mkdirSync(allBubbleBallotDir, { recursive: true });

  const { electionDefinition, blankBallot, filledBallot, cyclingTestDeck } =
    allBubbleBallotFixtures;

  fs.writeFileSync(
    join(allBubbleBallotDir, 'election.json'),
    JSON.stringify(electionDefinition.election, null, 2)
  );

  const ballots = {
    'blank-ballot': blankBallot,
    'filled-ballot': filledBallot,
    'cycling-test-deck': cyclingTestDeck,
  } as const;
  for (const [label, document] of Object.entries(ballots)) {
    generateBallotFixture(allBubbleBallotDir, label, document);
  }
}

function generateFamousNamesFixtures(): void {
  fs.mkdirSync(famousNamesDir, { recursive: true });
  const { electionDefinition, blankBallot, markedBallot } = famousNamesFixtures;

  fs.writeFileSync(
    join(famousNamesDir, 'election.json'),
    JSON.stringify(electionDefinition.election, null, 2)
  );

  const ballots = {
    'blank-ballot': blankBallot,
    'marked-ballot': markedBallot,
  } as const;
  for (const [label, document] of Object.entries(ballots)) {
    generateBallotFixture(famousNamesDir, label, document);
  }
}

function generateSampleElectionFixtures(): void {
  for (const {
    electionDefinition,
    electionDir,
    blankBallot,
    markedBallot,
  } of sampleElectionFixtures) {
    fs.mkdirSync(electionDir, { recursive: true });
    fs.writeFileSync(
      join(electionDir, 'election.json'),
      JSON.stringify(electionDefinition.election, null, 2)
    );

    const ballots = {
      'blank-ballot': blankBallot,
      'marked-ballot': markedBallot,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      generateBallotFixture(electionDir, label, document);
    }
  }
}

export function main(): void {
  fs.rmSync(fixturesDir, { recursive: true });

  generateAllBubbleBallotFixtures();
  generateFamousNamesFixtures();
  generateSampleElectionFixtures();
}
