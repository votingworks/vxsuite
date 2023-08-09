import { assert, assertDefined, find, iter } from '@votingworks/basics';
import { renderDocumentToPdf } from '@votingworks/hmpb-render-backend';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
  BallotPaperSize,
  ElectionDefinition,
  GridLayout,
  Id,
  PrecinctId,
  SheetOf,
  Vote,
  VotesDict,
} from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { Buffer } from 'buffer';
import {
  AnyElement,
  Document,
  gridPosition,
  measurements,
  TextBox,
} from '@votingworks/hmpb-layout';
import { InterpretFileResult, interpretSheet } from '../../src';

async function pdfToBuffer(pdf: PDFKit.PDFDocument): Promise<Buffer> {
  const promise = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
  });
  pdf.end();
  return promise;
}

export async function renderAndInterpretBallot({
  electionDefinition,
  precinctId,
  ballot,
  testMode = true,
}: {
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
  ballot: Document;
  testMode?: boolean;
}): Promise<SheetOf<InterpretFileResult>> {
  const pdfStream = renderDocumentToPdf(ballot);
  const pdfBuffer = await pdfToBuffer(pdfStream);
  const pageImages = await iter(
    pdfToImages(pdfBuffer, { scale: 200 / 72 })
  ).toArray();
  expect(pageImages.length).toEqual(2);
  const pageImagePaths: SheetOf<string> = [
    tmpNameSync({ postfix: '.jpg' }),
    tmpNameSync({ postfix: '.jpg' }),
  ];
  await writeImageData(pageImagePaths[0], assertDefined(pageImages[0]).page);
  await writeImageData(pageImagePaths[1], assertDefined(pageImages[1]).page);

  return interpretSheet(
    {
      electionDefinition,
      precinctSelection: singlePrecinctSelectionFor(precinctId),
      testMode,
    },
    pageImagePaths
  );
}

export function voteToOptionId(vote: Vote[number]): Id {
  return vote === 'yes' || vote === 'no' ? vote : vote.id;
}

export function markBallot(
  ballot: Document,
  gridLayout: GridLayout,
  votesToMark: VotesDict,
  paperSize: BallotPaperSize,
  density: number
): Document {
  assert(ballot.pages.length === 2, 'Only two page ballots are supported');
  const m = measurements(paperSize, density);
  function marksForPage(page: number): AnyElement[] {
    const side = page === 1 ? 'front' : 'back';
    const pagePositions = gridLayout.gridPositions.filter(
      (position) => position.side === side
    );
    return Object.entries(votesToMark).flatMap(([contestId, votes]) => {
      if (!votes) return [];
      const contestPositions = pagePositions.filter(
        (position) => position.contestId === contestId
      );
      if (contestPositions.length === 0) return []; // Contest not on this page
      return votes?.map((vote): TextBox => {
        const optionPosition = find(
          contestPositions,
          (position) =>
            position.type === 'option' &&
            position.optionId === voteToOptionId(vote)
        );
        // Add offset to get bubble center (since interpreter indexes from
        // timing marks, while layout indexes from ballot edge)
        const position = gridPosition(
          {
            column: optionPosition.column + 1,
            row: optionPosition.row + 1,
          },
          m
        );
        return {
          type: 'TextBox',
          // Offset by half bubble width/height
          x: position.x - 3,
          y: position.y - 5,
          width: 10,
          height: 10,
          textLines: ['X'],
          lineHeight: 10,
          fontSize: 10,
          fontWeight: 700,
        };
      });
    });
  }
  return {
    ...ballot,
    pages: ballot.pages.map((page, i) => ({
      ...page,
      children: page.children.concat(marksForPage(i + 1)),
    })),
  };
}
