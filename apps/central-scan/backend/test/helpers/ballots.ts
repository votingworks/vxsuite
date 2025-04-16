import { iter } from '@votingworks/basics';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { getTemporaryRootDir } from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { ElectionDefinition, SheetOf, asSheet } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { tmpNameSync } from 'tmp';

async function generateSheetFromPdf(pdfData: Buffer): Promise<SheetOf<string>> {
  return asSheet(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 }))
      .take(2)
      .map(async ({ page }) => {
        const path = tmpNameSync({
          postfix: '.png',
          dir: getTemporaryRootDir(),
        });
        await writeImageData(path, page);
        return path;
      })
      .toArray()
  );
}

export async function generateBmdBallotFixture(): Promise<{
  electionDefinition: ElectionDefinition;
  sheet: SheetOf<string>;
}> {
  const { electionDefinition } = vxFamousNamesFixtures;
  return {
    electionDefinition,
    sheet: await generateSheetFromPdf(
      await renderBmdBallotFixture({
        electionDefinition,
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        votes: DEFAULT_FAMOUS_NAMES_VOTES,
      })
    ),
  };
}

export async function generateHmpbFixture(): Promise<{
  electionDefinition: ElectionDefinition;
  sheet: SheetOf<string>;
}> {
  return {
    electionDefinition: vxFamousNamesFixtures.electionDefinition,
    sheet: await generateSheetFromPdf(
      await fs.readFile(vxFamousNamesFixtures.markedBallotPath)
    ),
  };
}
