import { join } from 'path';
import * as fs from 'fs';
import { finished } from 'stream/promises';
import tmp from 'tmp';
import { allBubbleBallots } from './all_bubble_ballots';
import { renderDocumentToPdf } from './render_ballot';

function normalizePdf(pdf: string): string {
  return pdf.replace(/ID \[<.+> <.+>\]/, '').replace(/(D:\d+Z)/, '');
}

test('fixtures are up to date - run `pnpm generate-fixtures` if this test fails', async () => {
  const fixturesDir = join(__dirname, '../fixtures');
  for (const [name, ballot] of Object.entries(allBubbleBallots)) {
    const savedDocument = fs.readFileSync(
      join(fixturesDir, name, 'ballot-document.json'),
      'utf8'
    );
    expect(JSON.parse(savedDocument)).toEqual(ballot.ballotDocument);

    const savedElection = fs.readFileSync(
      join(fixturesDir, name, 'election.json'),
      'utf8'
    );
    expect(JSON.parse(savedElection)).toEqual(ballot.election);

    const savedPdf = fs.readFileSync(
      join(fixturesDir, name, 'ballot.pdf'),
      'utf8'
    );

    // For now, skip PDF comparison on CI because it doesn't seem to work.
    if (!process.env.CI) {
      const pdfTmpFile = tmp.fileSync();
      const pdfStream = fs.createWriteStream(pdfTmpFile.name);
      renderDocumentToPdf(ballot.ballotDocument, pdfStream);
      await finished(pdfStream);

      expect(normalizePdf(savedPdf)).toEqual(
        normalizePdf(fs.readFileSync(pdfTmpFile.name, 'utf8'))
      );
      pdfTmpFile.removeCallback();
    }
  }
});
