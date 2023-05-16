import { join } from 'path';
import * as fs from 'fs';
import { allBubbleBallots } from './all_bubble_ballots';
import { renderDocumentToPdf } from './render_ballot';

export function main(): void {
  const fixturesDir = join(__dirname, '../fixtures');
  for (const [name, ballot] of Object.entries(allBubbleBallots)) {
    const ballotDir = join(fixturesDir, name);
    // eslint-disable-next-line no-console
    console.log(`Writing ballot and election to ${ballotDir}`);
    fs.mkdirSync(ballotDir, { recursive: true });
    fs.writeFileSync(
      join(ballotDir, 'ballot-document.json'),
      JSON.stringify(ballot.ballotDocument, null, 2)
    );
    renderDocumentToPdf(
      ballot.ballotDocument,
      fs.createWriteStream(join(ballotDir, 'ballot.pdf'))
    );
    fs.writeFileSync(
      join(ballotDir, 'election.json'),
      JSON.stringify(ballot.election, null, 2)
    );
  }
}
