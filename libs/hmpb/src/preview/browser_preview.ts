import './polyfills';
import { BallotType, VotesDict, getContests } from '@votingworks/types';
import { electionGeneral } from '@votingworks/fixtures';
import { assertDefined, range } from '@votingworks/basics';
import { vxDefaultBallotTemplate } from '../vx_default_ballot_template';
import {
  BaseBallotProps,
  gridWidthToPixels,
  measureTimingMarkGrid,
  renderBallotTemplate,
} from '../render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';
import { markBallotDocument, voteIsCandidate } from '../mark_ballot';
import { BUBBLE_CLASS, OptionInfo, PAGE_CLASS } from '../ballot_components';

const election = electionGeneral;
const ballotStyle = election.ballotStyles[0];
const exampleBallotProps: BaseBallotProps = {
  election,
  ballotStyleId: ballotStyle.id,
  precinctId: ballotStyle.precincts[0],
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

/**
 * This preview script can be edited to preview ballot templates in a browser
 * while they are being developed. It allows you to use the browser's developer
 * tools to inspect the DOM and debug any rendering/layout issues.
 */
export async function main(): Promise<void> {
  const renderer = createBrowserPreviewRenderer();
  const document = await renderBallotTemplate(
    renderer,
    vxDefaultBallotTemplate,
    exampleBallotProps
  );

  // Mark some votes
  const contests = getContests({ election, ballotStyle });
  const votes: VotesDict = Object.fromEntries(
    contests.map((contest, i) => {
      if (contest.type === 'candidate') {
        const candidates = range(0, contest.seats - (i % 2)).map(
          (j) => contest.candidates[(i + j) % contest.candidates.length]
        );
        if (contest.allowWriteIns && i % 2 === 0) {
          const writeInIndex = i % contest.seats;
          candidates.push({
            id: `write-in-${writeInIndex}`,
            name: `Write-In #${writeInIndex + 1}`,
            isWriteIn: true,
            writeInIndex,
          });
        }
        return [contest.id, candidates];
      }
      return [
        contest.id,
        i % 2 === 0 ? [contest.yesOption.id] : [contest.noOption.id],
      ];
    })
  );
  const unmarkedWriteIns = contests.flatMap((contest, i) => {
    if (!(contest.type === 'candidate' && contest.allowWriteIns)) {
      return [];
    }
    // Skip contests where we already voted for a write-in above
    if (
      assertDefined(votes[contest.id]).some(
        (vote) => voteIsCandidate(vote) && vote.isWriteIn
      )
    ) {
      return [];
    }

    const writeInIndex = i % contest.seats;
    return [
      {
        contestId: contest.id,
        writeInIndex,
        name: `Unmarked Write-In #${writeInIndex + 1}`,
      },
    ];
  });
  await markBallotDocument(renderer, document, votes, unmarkedWriteIns);

  // Outline write-in areas
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  for (const [i, page] of pages.entries()) {
    const pageNumber = i + 1;
    const grid = await measureTimingMarkGrid(document, pageNumber);
    const bubbles = await document.inspectElements(
      `.${PAGE_CLASS}[data-page-number="${pageNumber}"] .${BUBBLE_CLASS}`
    );
    const pageElement = assertDefined(
      window.document.querySelector(
        `.${PAGE_CLASS}[data-page-number="${pageNumber}"]`
      )
    );
    const writeInAreaOverlay = window.document.createElement('div');
    writeInAreaOverlay.style.position = 'absolute';
    writeInAreaOverlay.style.left = '0';
    writeInAreaOverlay.style.top = '0';
    writeInAreaOverlay.style.width = '100%';
    writeInAreaOverlay.style.height = '100%';
    pageElement.appendChild(writeInAreaOverlay);
    for (const bubble of bubbles) {
      const optionInfo = JSON.parse(bubble.data.optionInfo) as OptionInfo;
      if (optionInfo.type === 'write-in') {
        const { writeInArea } = optionInfo;
        const writeInAreaElement = window.document.createElement('div');
        writeInAreaElement.style.position = 'absolute';
        writeInAreaElement.style.left = `${
          bubble.x +
          bubble.width / 2 -
          page.x -
          gridWidthToPixels(grid, writeInArea.left)
        }px`;
        writeInAreaElement.style.top = `${
          bubble.y +
          bubble.height / 2 -
          page.y -
          gridWidthToPixels(grid, writeInArea.top)
        }px`;
        writeInAreaElement.style.width = `${gridWidthToPixels(
          grid,
          writeInArea.left + writeInArea.right
        )}px`;
        writeInAreaElement.style.height = `${gridWidthToPixels(
          grid,
          writeInArea.top + writeInArea.bottom
        )}px`;
        writeInAreaElement.style.border = '1px solid red';
        writeInAreaOverlay.appendChild(writeInAreaElement);
      }
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
