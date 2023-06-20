import { join } from 'path';
import * as fs from 'fs';
import { renderDocumentToPdf } from './render_ballot';
import {
  allBubbleBallotBlankBallot,
  allBubbleBallotCyclingTestDeck,
  allBubbleBallotElection,
  allBubbleBallotFilledBallot,
} from './all_bubble_ballots';

export function main(): void {
  const fixturesDir = join(__dirname, '../fixtures');
  fs.rmSync(fixturesDir, { recursive: true });
  fs.mkdirSync(fixturesDir, { recursive: true });

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-election.json'),
    JSON.stringify(allBubbleBallotElection, null, 2)
  );

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-cycling-test-deck-document.json'),
    JSON.stringify(allBubbleBallotCyclingTestDeck, null, 2)
  );
  const testDeckPdf = renderDocumentToPdf(allBubbleBallotCyclingTestDeck);
  testDeckPdf.pipe(
    fs.createWriteStream(
      join(fixturesDir, 'all-bubble-ballot-cycling-test-deck.pdf')
    )
  );
  testDeckPdf.end();

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-blank-ballot-document.json'),
    JSON.stringify(allBubbleBallotBlankBallot, null, 2)
  );
  const blankBallotPdf = renderDocumentToPdf(allBubbleBallotBlankBallot);
  blankBallotPdf.pipe(
    fs.createWriteStream(
      join(fixturesDir, 'all-bubble-ballot-blank-ballot.pdf')
    )
  );
  blankBallotPdf.end();

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-filled-card-document.json'),
    JSON.stringify(allBubbleBallotFilledBallot, null, 2)
  );
  const filledBallotPdf = renderDocumentToPdf(allBubbleBallotFilledBallot);
  filledBallotPdf.pipe(
    fs.createWriteStream(join(fixturesDir, 'all-bubble-ballot-filled-card.pdf'))
  );
  filledBallotPdf.end();
}
