import { assert, assertDefined, iter, range } from '@votingworks/basics';
import { Buffer } from 'buffer';
import {
  electionGeneral,
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  BallotPaperSize,
  BallotStyle,
  BallotType,
  Election,
  getBallotStyle,
  getContests,
  UiStringsPackage,
  VotesDict,
} from '@votingworks/types';
import { join } from 'path';
import makeDebug from 'debug';
import { markBallotDocument, voteIsCandidate } from './mark_ballot';
import {
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './vx_default_ballot_template';
import { Renderer } from './renderer';

const debug = makeDebug('hmpb:ballot_fixtures');

// For now, don't include any translated strings in the fixtures
const translatedElectionStrings: UiStringsPackage = {};

export const fixturesDir = join(__dirname, '../fixtures');

export const famousNamesFixtures = (() => {
  const dir = join(fixturesDir, 'famous-names');
  const electionPath = join(dir, 'election.json');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');

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

  return {
    dir,
    electionPath,
    blankBallotPath,
    markedBallotPath,
    allBallotProps,
    ...blankBallotProps,
    votes,

    async generate(renderer: Renderer, { markedOnly = false } = {}) {
      debug(`Generating: ${blankBallotPath}`);
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          vxDefaultBallotTemplate,
          allBallotProps,
          translatedElectionStrings
        );

      const blankBallot = ballotDocuments[0];
      const blankBallotPdf = markedOnly
        ? Buffer.from('')
        : await blankBallot.renderToPdf();

      debug(`Generating: ${markedBallotPath}`);
      const markedBallot = await markBallotDocument(
        renderer,
        blankBallot,
        votes
      );
      const markedBallotPdf = await markedBallot.renderToPdf();

      return {
        electionDefinition,
        blankBallotPdf,
        markedBallotPdf,
      };
    },
  };
})();

export const generalElectionFixtures = (() => {
  const dir = join(fixturesDir, 'general-election');

  function makeElectionFixtureSpec(paperSize: BallotPaperSize) {
    const electionDir = join(dir, paperSize);
    const electionPath = join(electionDir, 'election.json');
    const blankBallotPath = join(electionDir, 'blank-ballot.pdf');
    const markedBallotPath = join(electionDir, 'marked-ballot.pdf');
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

    // Has ballot measures
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId: '12' })
    );
    const precinctId = assertDefined(ballotStyle.precincts[0]);

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

    return {
      electionDir,
      paperSize,
      electionPath,
      allBallotProps,
      precinctId,
      ballotStyleId: ballotStyle.id,
      votes,
      unmarkedWriteIns,
      blankBallotPath,
      markedBallotPath,
    };
  }

  const fixtureSpecs = Object.fromEntries(
    Object.values(BallotPaperSize).map((paperSize) => [
      paperSize as BallotPaperSize,
      makeElectionFixtureSpec(paperSize),
    ])
  );

  return {
    ...(fixtureSpecs as Record<
      BallotPaperSize,
      ReturnType<typeof makeElectionFixtureSpec>
    >),

    async generate(
      renderer: Renderer,
      {
        markedOnly = false,
        paperSizes = Object.values(BallotPaperSize),
      }: { markedOnly?: boolean; paperSizes?: BallotPaperSize[] } = {}
    ) {
      async function generateElectionFixtures(
        spec: ReturnType<typeof makeElectionFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const { electionDefinition, ballotDocuments } =
          await renderAllBallotsAndCreateElectionDefinition(
            renderer,
            vxDefaultBallotTemplate,
            spec.allBallotProps,
            translatedElectionStrings
          );
        const [blankBallot] = assertDefined(
          iter(ballotDocuments)
            .zip(spec.allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );

        const blankBallotPdf = markedOnly
          ? Buffer.from('')
          : await blankBallot.renderToPdf();

        debug(`Generating: ${spec.markedBallotPath}`);
        const markedBallot = await markBallotDocument(
          renderer,
          blankBallot,
          spec.votes,
          spec.unmarkedWriteIns
        );
        const markedBallotPdf = await markedBallot.renderToPdf();

        return {
          electionDefinition,
          blankBallotPdf,
          markedBallotPdf,
        };
      }

      return Object.fromEntries(
        await Promise.all(
          Object.entries(fixtureSpecs)
            .filter(
              ([paperSize]) =>
                !paperSizes || paperSizes.includes(paperSize as BallotPaperSize)
            )
            .map(async ([paperSize, spec]) => {
              const generated = await generateElectionFixtures(spec);
              return [paperSize, generated];
            })
        )
      );
    },
  };
})();

export const primaryElectionFixtures = (() => {
  const dir = join(fixturesDir, 'primary-election');
  const electionPath = join(dir, 'election.json');

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

  function makePartyFixtureSpec(partyLabel: string, ballotStyle: BallotStyle) {
    const blankBallotPath = join(dir, `${partyLabel}-blank-ballot.pdf`);
    const otherPrecinctBlankBallotPath = join(
      dir,
      `${partyLabel}-other-precinct-blank-ballot.pdf`
    );
    const markedBallotPath = join(dir, `${partyLabel}-marked-ballot.pdf`);

    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const otherPrecinctId = assertDefined(ballotStyle.precincts[1]);
    assert(precinctId !== otherPrecinctId);
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

    return {
      ballotStyleId: ballotStyle.id,
      otherPrecinctId,
      precinctId,
      blankBallotPath,
      otherPrecinctBlankBallotPath,
      markedBallotPath,
      votes,
    };
  }

  const mammalParty = makePartyFixtureSpec(
    'mammal',
    assertDefined(getBallotStyle({ election, ballotStyleId: 'm-c1-w1' }))
  );
  const fishParty = makePartyFixtureSpec(
    'fish',
    assertDefined(getBallotStyle({ election, ballotStyleId: 'f-c1-w1' }))
  );

  return {
    dir,
    allBallotProps,
    electionPath,
    mammalParty,
    fishParty,

    async generate(renderer: Renderer, { markedOnly = false } = {}) {
      const { electionDefinition, ballotDocuments } =
        await renderAllBallotsAndCreateElectionDefinition(
          renderer,
          vxDefaultBallotTemplate,
          allBallotProps,
          translatedElectionStrings
        );

      async function generatePartyFixtures(
        spec: ReturnType<typeof makePartyFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const [blankBallot] = assertDefined(
          iter(ballotDocuments)
            .zip(allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );
        const blankBallotPdf = markedOnly
          ? Buffer.from('')
          : await blankBallot.renderToPdf();

        debug(`Generating: ${spec.otherPrecinctBlankBallotPath}`);
        const [otherPrecinctBlankBallot] = assertDefined(
          iter(ballotDocuments)
            .zip(allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.otherPrecinctId
            )
        );
        const otherPrecinctBlankBallotPdf = markedOnly
          ? Buffer.from('')
          : await otherPrecinctBlankBallot.renderToPdf();

        debug(`Generating: ${spec.markedBallotPath}`);
        const markedBallot = await markBallotDocument(
          renderer,
          blankBallot,
          spec.votes
        );
        const markedBallotPdf = await markedBallot.renderToPdf();

        return {
          electionDefinition,
          blankBallotPdf,
          otherPrecinctBlankBallotPdf,
          markedBallotPdf,
        };
      }

      return {
        electionDefinition,
        mammalParty: await generatePartyFixtures(mammalParty),
        fishParty: await generatePartyFixtures(fishParty),
      };
    },
  };
})();
