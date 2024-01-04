import { basename, join } from 'path';
import * as fs from 'fs';
import { finished } from 'stream/promises';
import tmp from 'tmp';
import { Document } from '@votingworks/hmpb-layout';
import { safeParseElection } from '@votingworks/types';
import {
  allBubbleBallotDir,
  allBubbleBallotFixtures,
} from './all_bubble_ballot_fixtures';
import { renderDocumentToPdf } from './render_ballot';
import {
  famousNamesDir,
  famousNamesFixtures,
  generalElectionFixtures,
  primaryElectionDir,
  primaryElectionFixtures,
} from './ballot_fixtures';

function normalizePdf(pdf: string): string {
  return pdf.replace(/ID \[<.+> <.+>\]/, '').replace(/(D:\d+Z)/, '');
}

async function checkBallotFixture(
  fixtureDir: string,
  label: string,
  document: Document
) {
  const savedDocument = fs.readFileSync(
    join(fixtureDir, `${label}-document.json`),
    'utf8'
  );
  expect(JSON.parse(savedDocument)).toEqual(document);

  const savedPdf = fs.readFileSync(join(fixtureDir, `${label}.pdf`), 'utf8');

  // For now, skip PDF comparison on CI because it doesn't seem to work.
  if (!process.env.CI) {
    const pdfTmpFile = tmp.fileSync();
    const fileStream = fs.createWriteStream(pdfTmpFile.name);
    const pdf = renderDocumentToPdf(document);
    pdf.pipe(fileStream);
    pdf.end();
    await finished(fileStream);

    expect(normalizePdf(savedPdf)).toEqual(
      normalizePdf(fs.readFileSync(pdfTmpFile.name, 'utf8'))
    );
    pdfTmpFile.removeCallback();
  }
}

describe('fixtures are up to date - run `pnpm generate-fixtures` if this test fails', () => {
  test('all bubble ballot fixtures', async () => {
    const { electionDefinition, blankBallot, filledBallot, cyclingTestDeck } =
      allBubbleBallotFixtures;

    const savedElection = fs.readFileSync(
      join(allBubbleBallotDir, 'election.json'),
      'utf8'
    );
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    const ballots = {
      'blank-ballot': blankBallot,
      'filled-ballot': filledBallot,
      'cycling-test-deck': cyclingTestDeck,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      await checkBallotFixture(allBubbleBallotDir, label, document);
    }
  });

  test('famous names fixtures', async () => {
    const { electionDefinition, blankBallot, markedBallot } =
      famousNamesFixtures;

    const savedElection = fs.readFileSync(
      join(famousNamesDir, 'election.json'),
      'utf8'
    );
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    const ballots = {
      'blank-ballot': blankBallot,
      'marked-ballot': markedBallot,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      await checkBallotFixture(famousNamesDir, label, document);
    }
  });

  for (const {
    electionDir,
    electionDefinition,
    blankBallot,
    markedBallot,
  } of generalElectionFixtures) {
    test(`general election fixtures - ${basename(electionDir)}`, async () => {
      const savedElection = fs.readFileSync(
        join(electionDir, 'election.json'),
        'utf8'
      );
      expect(safeParseElection(savedElection).ok()).toEqual(
        electionDefinition.election
      );

      const ballots = {
        'blank-ballot': blankBallot,
        'marked-ballot': markedBallot,
      } as const;
      for (const [label, document] of Object.entries(ballots)) {
        await checkBallotFixture(electionDir, label, document);
      }
    });
  }

  test(`primary election fixtures`, async () => {
    const { electionDefinition } = primaryElectionFixtures;
    const savedElection = fs.readFileSync(
      join(primaryElectionDir, 'election.json'),
      'utf8'
    );
    expect(safeParseElection(savedElection).ok()).toEqual(
      electionDefinition.election
    );

    const { fishParty, mammalParty } = primaryElectionFixtures;
    const ballots = {
      'fish-blank-ballot': fishParty.blankBallot,
      'fish-marked-ballot': fishParty.markedBallot,
      'mammal-blank-ballot': mammalParty.blankBallot,
      'mammal-marked-ballot': mammalParty.markedBallot,
    } as const;
    for (const [label, document] of Object.entries(ballots)) {
      await checkBallotFixture(primaryElectionDir, label, document);
    }
  });
});
