import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { assert, iter } from '@votingworks/basics';
import { asSheet } from '@votingworks/types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { matchBubblesAndContestOptionsUsingContestColumns } from '.';
import { PdfReader } from '../../../pdf_reader';
import { PDF_PPI } from '../../../proofing';
import * as accuvote from '../../accuvote';
import { parseXml } from '../../dom_parser';

const CONWAY_FIXTURES_ROOT = join(
  __dirname,
  '../../../../test/fixtures/conway-primary'
);

test('match contest columns (Conway Democratic)', async () => {
  const pdf = await fs.readFile(
    join(CONWAY_FIXTURES_ROOT, 'dem-ballot-template.pdf')
  );
  const templateImages = asSheet(
    await iter(new PdfReader(pdf, { scale: 200 / PDF_PPI }).pages())
      .map(({ page }) => page)
      .toArray()
  );
  const definition = accuvote
    .parseXml(
      parseXml(
        await fs.readFile(
          join(CONWAY_FIXTURES_ROOT, 'dem-definition.xml'),
          'utf8'
        )
      )
    )
    .unsafeUnwrap();
  const gridsAndBubbles =
    findTemplateGridAndBubbles(templateImages).unsafeUnwrap();
  const matchResult = matchBubblesAndContestOptionsUsingContestColumns({
    definition,
    gridsAndBubbles,
  }).unsafeUnwrap();

  expect(matchResult.unmatched).toHaveLength(0);

  for (const contest of definition.candidates) {
    for (const candidate of contest.candidateNames) {
      const match = iter(matchResult.matched)
        .flatMap((matches) => matches)
        .find((m) => m.type === 'candidate' && m.candidate === candidate);

      assert(match, `No match for ${candidate.name}`);
    }
  }
});
