import { assert, assertDefined, iter, Optional } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  HmpbBallotPaperSize,
  BallotStyle,
  BallotStyleId,
  BallotType,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { join } from 'node:path';
import makeDebug from 'debug';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import { createTestVotes, markBallotDocument } from './mark_ballot';
import {
  BaseBallotProps,
  renderAllBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { Renderer } from './renderer';
import {
  NhBallotProps,
  nhBallotTemplate,
} from './ballot_templates/nh_ballot_template';

const debug = makeDebug('hmpb:ballot_fixtures');

export const fixturesDir = join(__dirname, '../fixtures');

export const vxFamousNamesFixtures = (() => {
  const dir = join(fixturesDir, 'vx-famous-names');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');

  const election = electionFamousNames2021Fixtures.readElection();
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
  const { votes } = createTestVotes(contests);

  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  return {
    dir,
    electionDefinition,
    blankBallotPath,
    markedBallotPath,
    allBallotProps,
    ...blankBallotProps,
    votes,

    async generate(
      renderer: Renderer,
      { markedOnly = false, generatePageImages = false } = {}
    ) {
      debug(`Generating: ${blankBallotPath}`);
      const rendered = await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );

      assert(
        rendered.electionDefinition.ballotHash ===
          electionDefinition.ballotHash,
        'If this fails its likely because the lib/fixtures election fixtures are out of date. Run pnpm generate-election-packages in libs/fixture-generators'
      );

      const blankBallot = rendered.ballotDocuments[0];
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

      let blankBallotPageImages: Optional<ImageData[]>;
      let markedBallotPageImages: Optional<ImageData[]>;
      if (generatePageImages) {
        [blankBallotPageImages, markedBallotPageImages] = await Promise.all(
          [
            { path: blankBallotPath, pdf: blankBallotPdf },
            { path: markedBallotPath, pdf: markedBallotPdf },
          ].map(async ({ path, pdf }) => {
            debug(`Generating page images for: ${path}`);
            return await iter(
              pdfToImages(pdf, {
                scale: 200 / 72,
              })
            )
              .map(({ page }) => page)
              .toArray();
          })
        );
      }

      return {
        electionDefinition: rendered.electionDefinition,
        blankBallotPath,
        markedBallotPath,
        blankBallotPdf,
        markedBallotPdf,
        blankBallotPageImages,
        markedBallotPageImages,
      };
    },
  };
})();

export const vxGeneralElectionFixtures = (() => {
  const dir = join(fixturesDir, 'vx-general-election');

  function makeElectionFixtureSpec(election: Election) {
    const electionDir = join(
      dir,
      [election.ballotLayout.paperSize, election.ballotStyles[0].languages?.[0]]
        .filter((label) => Boolean(label))
        .join('-')
    );
    const electionPath = join(electionDir, 'election.json');
    const blankBallotPath = join(electionDir, 'blank-ballot.pdf');
    const markedBallotPath = join(electionDir, 'marked-ballot.pdf');
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
      getBallotStyle({ election, ballotStyleId: '12' as BallotStyleId })
    );
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const contests = getContests({ election, ballotStyle });
    const { votes, unmarkedWriteIns } = createTestVotes(contests);
    const { paperSize } = election.ballotLayout;
    const languageCode = ballotStyle.languages?.[0] ?? 'en';
    return {
      electionDir,
      paperSize,
      languageCode,
      electionPath,
      allBallotProps,
      precinctId,
      ballotStyleId: ballotStyle.id,
      votes,
      unmarkedWriteIns,
      blankBallotPath,
      markedBallotPath,
      generatePageImages:
        paperSize === HmpbBallotPaperSize.Letter && languageCode === 'en',
    };
  }

  const electionGeneral = readElectionGeneral();
  const paperSizeElections = Object.values(HmpbBallotPaperSize).map(
    (paperSize) => ({
      ...electionGeneral,
      ballotLayout: { ...electionGeneral.ballotLayout, paperSize },
    })
  );

  const languageElections = ['zh-Hans', 'zh-Hant', 'es-US'].map((language) => ({
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Legal,
    },
    ballotStyles: electionGeneral.ballotStyles.map((ballotStyle) => ({
      ...ballotStyle,
      languages: [language, 'en'],
    })),
  }));

  const fixtureSpecs = [...paperSizeElections, ...languageElections].map(
    makeElectionFixtureSpec
  );

  return {
    dir,
    fixtureSpecs,

    async generate(
      renderer: Renderer,
      specs: Array<ReturnType<typeof makeElectionFixtureSpec>>
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
            'vxf'
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
        const blankBallotPdf = await blankBallot.renderToPdf();

        debug(`Generating: ${spec.markedBallotPath}`);
        const markedBallot = await markBallotDocument(
          renderer,
          blankBallot,
          spec.votes,
          spec.unmarkedWriteIns
        );
        const markedBallotPdf = await markedBallot.renderToPdf();

        let blankBallotPageImages;
        if (spec.generatePageImages) {
          debug(`Generating page images for: ${spec.blankBallotPath}`);
          blankBallotPageImages = await iter(
            pdfToImages(blankBallotPdf, {
              scale: 200 / 72,
            })
          )
            .map(({ page }) => page)
            .toArray();
        }

        return {
          electionDefinition,
          blankBallotPdf,
          markedBallotPdf,
          blankBallotPageImages,
        };
      }

      return await Promise.all(specs.map(generateElectionFixtures));
    },
  };
})();

export const vxPrimaryElectionFixtures = (() => {
  const dir = join(fixturesDir, 'vx-primary-election');

  const election = electionPrimaryPrecinctSplitsFixtures.readElection();
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
    const { votes } = createTestVotes(contests);

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
    assertDefined(
      getBallotStyle({ election, ballotStyleId: '1-Ma_en' as BallotStyleId })
    )
  );
  const fishParty = makePartyFixtureSpec(
    'fish',
    assertDefined(
      getBallotStyle({ election, ballotStyleId: '1-F_en' as BallotStyleId })
    )
  );

  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  return {
    dir,
    allBallotProps,
    electionDefinition,
    mammalParty,
    fishParty,

    async generate(renderer: Renderer, { markedOnly = false } = {}) {
      const rendered = await renderAllBallotsAndCreateElectionDefinition(
        renderer,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );
      assert(
        rendered.electionDefinition.ballotHash ===
          electionDefinition.ballotHash,
        'If this fails its likely because the lib/fixtures election fixtures are out of date. Run pnpm generate-election-packages in libs/fixture-generators'
      );

      async function generatePartyFixtures(
        spec: ReturnType<typeof makePartyFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const [blankBallot] = assertDefined(
          iter(rendered.ballotDocuments)
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
          iter(rendered.ballotDocuments)
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
          electionDefinition: rendered.electionDefinition,
          blankBallotPdf,
          otherPrecinctBlankBallotPdf,
          markedBallotPdf,
        };
      }

      return {
        electionDefinition: rendered.electionDefinition,
        mammalParty: await generatePartyFixtures(mammalParty),
        fishParty: await generatePartyFixtures(fishParty),
      };
    },
  };
})();

export const nhGeneralElectionFixtures = (() => {
  const dir = join(fixturesDir, 'nh-general-election');

  const baseElection = readElectionGeneral();

  function makeFixtureSpec(
    paperSize: HmpbBallotPaperSize,
    props: Partial<NhBallotProps>
  ) {
    const electionDir = join(
      dir,
      [paperSize, props.compact ? 'compact' : ''].filter(Boolean).join('-')
    );
    const election: Election = {
      ...baseElection,
      ballotLayout: {
        ...baseElection.ballotLayout,
        paperSize,
      },
      // Make one ballot measure description too long to fit on one page to test
      // that it gets split onto multiple pages
      contests: baseElection.contests.map((contest) =>
        contest.id === 'proposition-1' && contest.type === 'yesno'
          ? {
              ...contest,
              description: contest.description.repeat(5),
            }
          : contest
      ),
    };
    const electionPath = join(electionDir, 'election.json');
    const blankBallotPath = join(electionDir, 'blank-ballot.pdf');
    const markedBallotPath = join(electionDir, 'marked-ballot.pdf');
    const allBallotProps = election.ballotStyles.flatMap((ballotStyle) =>
      ballotStyle.precincts.map(
        (precinctId): BaseBallotProps => ({
          election,
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode: 'official',
          ...props,
        })
      )
    );

    // Has ballot measures
    const ballotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId: '12' as BallotStyleId })
    );
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const contests = getContests({ election, ballotStyle });
    const { votes, unmarkedWriteIns } = createTestVotes(contests);
    return {
      electionDir,
      electionPath,
      paperSize,
      allBallotProps,
      precinctId,
      ballotStyleId: ballotStyle.id,
      votes,
      unmarkedWriteIns,
      blankBallotPath,
      markedBallotPath,
    };
  }

  const customNhProps = {
    electionTitleOverride: 'Overriden Election Title',
    electionSealOverride: vxFamousNamesFixtures.election.seal,
    clerkSignatureImage: `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
          <rect width="200" height="50" style="fill: none; stroke-width: 2; stroke: black;" />
          <text y="20" fill="black">Clerk Signature Image</text>
        </svg>
      `.trim(),
    clerkSignatureCaption: 'Clerk Signature Caption',
  } as const;
  const fixtureSpecs = [
    makeFixtureSpec(HmpbBallotPaperSize.Letter, {}),
    makeFixtureSpec(HmpbBallotPaperSize.Legal, customNhProps),
    makeFixtureSpec(HmpbBallotPaperSize.Letter, {
      ...customNhProps,
      compact: true,
    }),
    makeFixtureSpec(HmpbBallotPaperSize.Legal, { compact: true }),
  ];

  return {
    dir,
    fixtureSpecs,

    async generate(
      renderer: Renderer,
      specs: Array<ReturnType<typeof makeFixtureSpec>>
    ) {
      async function generateFixtures(
        spec: ReturnType<typeof makeFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const { electionDefinition, ballotDocuments } =
          await renderAllBallotsAndCreateElectionDefinition(
            renderer,
            nhBallotTemplate,
            spec.allBallotProps,
            'vxf'
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
        const blankBallotPdf = await blankBallot.renderToPdf();

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

      return await Promise.all(specs.map(generateFixtures));
    },
  };
})();
