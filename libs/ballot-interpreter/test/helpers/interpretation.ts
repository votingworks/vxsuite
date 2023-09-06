import { iter } from '@votingworks/basics';
import { voteToOptionId } from '@votingworks/hmpb-render-backend';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { GridLayout, Vote, VotesDict } from '@votingworks/types';
import { tmpNameSync } from 'tmp';
import { readFile } from 'fs/promises';

export async function ballotPdfToPageImages(
  pdfFile: string
): Promise<string[]> {
  const pdfContents = await readFile(pdfFile);
  const pdfImages = pdfToImages(pdfContents, { scale: 200 / 72 });
  return await iter(pdfImages)
    .map(async ({ page }) => {
      const path = tmpNameSync({ postfix: '.jpg' });
      await writeImageData(path, page);
      return path;
    })
    .toArray();
}

export function votesForSheet(
  votes: VotesDict,
  sheetNumber: number,
  gridLayout: GridLayout
): VotesDict {
  return Object.fromEntries(
    Object.entries(votes).filter(([contestId]) => {
      return gridLayout.gridPositions.some(
        (position) =>
          position.contestId === contestId &&
          position.sheetNumber === sheetNumber
      );
    })
  );
}

export function sortVotes(vote: Vote): Vote {
  return [...vote].sort((a, b) =>
    voteToOptionId(a).localeCompare(voteToOptionId(b))
  ) as Vote;
}

export function sortVotesDict(votes: VotesDict): VotesDict {
  return Object.fromEntries(
    Object.entries(votes).map(([contestId, candidates]) => [
      contestId,
      sortVotes(candidates ?? []),
    ])
  );
}
