import { readFile } from 'fs/promises';
import { join } from 'path';
import { convertElectionDefinition } from '.';
import { readFixtureBallotCardDefinition } from '../test/fixtures';
import { BubbleLayout } from './convert/types';

test('ballot proofing', async () => {
  const conwayDir = join(__dirname, '../test/fixtures/conway-primary');
  const demBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'dem-definition.xml'), 'utf-8'),
    await readFile(join(conwayDir, 'dem-ballot-template.pdf'))
  );

  const repBallotCardDefinition = readFixtureBallotCardDefinition(
    await readFile(join(conwayDir, 'rep-definition.xml'), 'utf-8'),
    await readFile(join(conwayDir, 'rep-ballot-template.pdf'))
  );

  const converted = (
    await convertElectionDefinition(
      [demBallotCardDefinition, repBallotCardDefinition],
      { bubbleLayout: BubbleLayout.RelativeSpacial }
    )
  ).unsafeUnwrap();

  for (const [, pdfs] of converted.result.ballotPdfs) {
    await expect(pdfs.printing).toMatchPdfSnapshot();
    await expect(pdfs.proofing).toMatchPdfSnapshot();
  }
});
