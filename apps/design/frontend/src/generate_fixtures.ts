import { join } from 'path';
import * as fs from 'fs';
import { renderDocumentToPdf } from './render_ballot';
import {
  allBubbleBallotElection,
  allBubbleBallotTestDeck,
} from './all_bubble_ballots';

export function main(): void {
  const fixturesDir = join(__dirname, '../fixtures');
  fs.rmSync(fixturesDir, { recursive: true });
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-test-deck-document.json'),
    JSON.stringify(allBubbleBallotTestDeck, null, 2)
  );
  renderDocumentToPdf(
    allBubbleBallotTestDeck,
    fs.createWriteStream(join(fixturesDir, 'all-bubble-ballot-test-deck.pdf'))
  );
  fs.writeFileSync(
    join(fixturesDir, 'all-bubble-ballot-election.json'),
    JSON.stringify(allBubbleBallotElection, null, 2)
  );
}
