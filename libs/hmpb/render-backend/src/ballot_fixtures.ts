/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { assert, assertDefined, iter, range } from '@votingworks/basics';
import {
  electionGeneral,
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { voteIsCandidate } from '@votingworks/hmpb-layout';
import {
  BallotPaperSize,
  BallotStyle,
  BallotType,
  Election,
  getBallotStyle,
  getContests,
  VotesDict,
} from '@votingworks/types';
import { join } from 'path';
import makeDebug from 'debug';
import {
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
  vxDefaultBallotTemplate,
  markBallotDocument,
} from './next';
import { Renderer } from './next/renderer';

const debug = makeDebug('hmpb:ballot_fixtures');

export const fixturesDir = join(__dirname, '../fixtures');

export async function generateFamousNamesFixtures(renderer: Renderer) {
  const dir = join(fixturesDir, 'famous-names');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  debug(`Generating: ${blankBallotPath}`);

  const { election } = electionFamousNames2021Fixtures;
  const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map(
      (precinctId): BaseBallotProps => ({
        election,
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    )
  );
  const { electionDefinition, ballotDocuments } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      vxDefaultBallotTemplate,
      allBallotProps
    );

  const blankBallot = ballotDocuments[0];
  const blankBallotPdf = await blankBallot.renderToPdf();

  const blankBallotProps = allBallotProps[0];
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId: blankBallotProps.ballotStyleId })
  );
  const contests = getContests({ election, ballotStyle });

  const votes: VotesDict = Object.fromEntries(
    contests.map((contest, i) => {
      assert(contest.type === 'candidate');
      const candidates = range(0, contest.seats).map(
        (j) => contest.candidates[(i + j) % contest.candidates.length]
      );
      return [contest.id, candidates];
    })
  );

  const markedBallotPath = join(dir, 'marked-ballot.pdf');
  debug(`Generating: ${markedBallotPath}`);
  const markedBallot = await markBallotDocument(renderer, blankBallot, votes);
  const markedBallotPdf = await markedBallot.renderToPdf();

  return {
    dir,
    electionDefinition,
    ...blankBallotProps,
    blankBallotPdf,
    blankBallotPath,
    markedBallotPdf,
    markedBallotPath,
    votes,
  };
}

export async function generateGeneralElectionFixtures(renderer: Renderer) {
  const dir = join(fixturesDir, 'general-election');
  const fixtures = [];

  for (const paperSize of Object.values(BallotPaperSize)) {
    const electionDir = join(dir, paperSize);
    const blankBallotPath = join(electionDir, 'blank-ballot.pdf');
    debug(`Generating: ${blankBallotPath}`);

    const election: Election = {
      ...electionGeneral,
      ballotLayout: {
        ...electionGeneral.ballotLayout,
        paperSize,
      },
    };
    const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
      ballotStyle.precincts.map(
        (precinctId): BaseBallotProps => ({
          election,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode: 'official',
        })
      )
    );
    const { electionDefinition, ballotDocuments } =
      await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        allBallotProps
      );

    // Has ballot measures
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId: '12' })
    );
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const [blankBallot] = assertDefined(
      iter(ballotDocuments)
        .zip(allBallotProps)
        .find(
          ([, props]) =>
            props.ballotStyleId === ballotStyle.id &&
            props.precinctId === precinctId
        )
    );

    const blankBallotPdf = await blankBallot.renderToPdf();

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

    const markedBallotPath = join(electionDir, 'marked-ballot.pdf');
    debug(`Generating: ${markedBallotPath}`);
    const markedBallot = await markBallotDocument(
      renderer,
      blankBallot,
      votes,
      unmarkedWriteIns
    );
    const markedBallotPdf = await markedBallot.renderToPdf();

    fixtures.push({
      electionDir,
      paperSize,
      electionDefinition,
      precinctId,
      ballotStyleId: ballotStyle.id,
      blankBallotPdf,
      markedBallotPdf,
      votes,
      unmarkedWriteIns,
      blankBallotPath,
      markedBallotPath,
    });
  }

  return fixtures;
}

export async function generatePrimaryElectionFixtures(renderer: Renderer) {
  const dir = join(fixturesDir, 'primary-election');
  const { election } = electionPrimaryPrecinctSplitsFixtures;

  const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map(
      (precinctId): BaseBallotProps => ({
        election,
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    )
  );
  const { electionDefinition, ballotDocuments } =
    await renderAllBallotsAndCreateElectionDefinition(
      renderer,
      vxDefaultBallotTemplate,
      allBallotProps
    );

  async function makePartyFixtures(
    partyLabel: string,
    ballotStyle: BallotStyle
  ) {
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const otherPrecinctId = assertDefined(ballotStyle.precincts[1]);
    assert(precinctId !== otherPrecinctId);
    const [blankBallot] = assertDefined(
      iter(ballotDocuments)
        .zip(allBallotProps)
        .find(
          ([, props]) =>
            props.ballotStyleId === ballotStyle.id &&
            props.precinctId === precinctId
        )
    );
    const blankBallotPath = join(dir, `${partyLabel}-blank-ballot.pdf`);
    debug(`Generating: ${blankBallotPath}`);
    const blankBallotPdf = await blankBallot.renderToPdf();

    const [otherPrecinctBlankBallot] = assertDefined(
      iter(ballotDocuments)
        .zip(allBallotProps)
        .find(
          ([, props]) =>
            props.ballotStyleId === ballotStyle.id &&
            props.precinctId === otherPrecinctId
        )
    );
    const otherPrecinctBlankBallotPath = join(
      dir,
      `${partyLabel}-other-precinct-blank-ballot.pdf`
    );
    debug(`Generating: ${otherPrecinctBlankBallotPath}`);
    const otherPrecinctBlankBallotPdf =
      await otherPrecinctBlankBallot.renderToPdf();

    const contests = getContests({ election, ballotStyle });
    const votes: VotesDict = Object.fromEntries(
      contests.map((contest, i) => {
        if (contest.type === 'candidate') {
          const candidates = range(0, contest.seats).map(
            (j) => contest.candidates[(i + j) % contest.candidates.length]
          );
          return [contest.id, candidates];
        }
        return [
          contest.id,
          i % 2 === 0 ? [contest.yesOption.id] : [contest.noOption.id],
        ];
      })
    );

    const markedBallotPath = join(dir, `${partyLabel}-marked-ballot.pdf`);
    debug(`Generating: ${markedBallotPath}`);
    const markedBallot = await markBallotDocument(renderer, blankBallot, votes);
    const markedBallotPdf = await markedBallot.renderToPdf();

    return {
      precinctId,
      blankBallotPath,
      blankBallotPdf,
      otherPrecinctBlankBallotPath,
      otherPrecinctBlankBallotPdf,
      markedBallotPath,
      markedBallotPdf,
      votes,
    };
  }

  return {
    dir,
    electionDefinition,
    mammalParty: await makePartyFixtures(
      'mammal',
      assertDefined(getBallotStyle({ election, ballotStyleId: 'm-c1-w1' }))
    ),
    fishParty: await makePartyFixtures(
      'fish',
      assertDefined(getBallotStyle({ election, ballotStyleId: 'f-c1-w1' }))
    ),
  };
}
