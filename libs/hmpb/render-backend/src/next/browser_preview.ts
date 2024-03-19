import './polyfills';
import { BallotType, VotesDict, getContests } from '@votingworks/types';
import { electionGeneral } from '@votingworks/fixtures';
import { assertDefined, range } from '@votingworks/basics';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';
import { BaseBallotProps, renderBallotTemplate } from './render_ballot';
import { createBrowserPreviewRenderer } from './browser_preview_renderer';
import { markBallotDocument, voteIsCandidate } from './mark_ballot';

const election = electionGeneral;
const ballotStyle = election.ballotStyles[0];
const exampleBallotProps: BaseBallotProps = {
  election,
  ballotStyleId: ballotStyle.id,
  precinctId: ballotStyle.precincts[0],
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

export async function main(): Promise<void> {
  const renderer = createBrowserPreviewRenderer();
  const document = await renderBallotTemplate(
    renderer,
    vxDefaultBallotTemplate,
    exampleBallotProps
  );
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
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
