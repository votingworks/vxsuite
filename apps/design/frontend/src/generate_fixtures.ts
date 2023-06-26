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
  renderDocumentToPdf(
    allBubbleBallotCyclingTestDeck,
    fs.createWriteStream(
      join(fixturesDir, 'all-bubble-ballot-cycling-test-deck.pdf')
    )
  );

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-blank-ballot-document.json'),
    JSON.stringify(allBubbleBallotBlankBallot, null, 2)
  );
  renderDocumentToPdf(
    allBubbleBallotBlankBallot,
    fs.createWriteStream(
      join(fixturesDir, 'all-bubble-ballot-blank-ballot.pdf')
    )
  );

  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-filled-card-document.json'),
    JSON.stringify(allBubbleBallotFilledBallot, null, 2)
  );
  renderDocumentToPdf(
    allBubbleBallotFilledBallot,
    fs.createWriteStream(join(fixturesDir, 'all-bubble-ballot-filled-card.pdf'))
  );
}
