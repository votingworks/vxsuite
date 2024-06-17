import { assertDefined, iter } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { pdfToImages } from '@votingworks/image-utils';
import { renderToPdf } from '@votingworks/printing';
import { ElectionDefinition, SheetOf, VotesDict } from '@votingworks/types';
import { BmdPaperBallot } from '@votingworks/ui';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';

export async function renderTestModeBallot(
  electionDefinition: ElectionDefinition,
  precinctId: string,
  ballotStyleId: string,
  votes: VotesDict
): Promise<Buffer> {
  const ballot = (
    <BmdPaperBallot
      electionDefinition={electionDefinition}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votes={votes}
      isLiveMode={false}
      generateBallotId={() => '1'}
      machineType="mark"
    />
  );

  return renderToPdf({
    document: ballot,
  });
}

export async function convertBallotToImages(
  pdf: Buffer
): Promise<SheetOf<ImageData>> {
  const [page1, page2] = await iter(pdfToImages(pdf, { scale: 200 / 72 }))
    .map((page) => page.page)
    .take(2)
    .toArray();

  return [
    assertDefined(page1),
    // if there's only one page, use a blank page for the back
    page2 ??
      (await electionFamousNames2021Fixtures.machineMarkedBallotPage2.asImageData()),
  ];
}
