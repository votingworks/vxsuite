import {
  assert,
  assertDefined,
  find,
  iter,
  Optional,
} from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  electionCombinedBallotPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
  readElectionGeneral,
  readElectionStraightParty,
} from '@votingworks/fixtures';
import {
  BaseBallotProps,
  Candidate,
  CandidateContest,
  HmpbBallotPaperSize,
  BallotStyle,
  BallotType,
  Election,
  getBallotStyle,
  getContests,
  LanguageCode,
  LATEST_SOFTWARE_VERSION,
  VotesDict,
} from '@votingworks/types';
import { join } from 'node:path';
import makeDebug from 'debug';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import { createTestVotes, markBallotDocument } from './mark_ballot';
import {
  allBaseBallotProps,
  ElectionSerializationOptions,
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import * as timingMarkPaperTemplate from './timing_mark_paper/template';
import * as calibrationSheetTemplate from './calibration_sheet/template';
import { Renderer, RendererPool } from './renderer';
import {
  NhBallotProps,
  nhBallotTemplate,
} from './ballot_templates/nh_ballot_template';
import { convertPdfToCmyk } from './pdf_conversion';
import { generateBallotStyles } from './ballot_styles';
import { miBallotTemplate } from './ballot_templates/mi_ballot_template';
import { msBallotTemplate } from './ballot_templates/ms_ballot_template';
import { nhStateBallotTemplate } from './ballot_templates/nh_state_ballot_template';
import { NhStateBallotProps } from './ballot_templates/nh_state_ballot_components';

const debug = makeDebug('hmpb:ballot_fixtures');

export const fixturesDir = join(__dirname, '../fixtures');

const serializationOptions: ElectionSerializationOptions = {
  format: 'vxf',
  version: LATEST_SOFTWARE_VERSION,
};

/**
 * Wraps a fixture factory so its body runs lazily on first property access
 * rather than at module load. Importing this module therefore does not eagerly
 * parse election files, so tooling can run even when a generated election
 * fixture is temporarily invalid (e.g. while regenerating fixtures after a
 * breaking election-format change). The result is memoized on first access.
 */
function lazyFixtures<T extends object>(build: () => T): T {
  let cached: T | undefined;
  function resolve(): T {
    if (cached === undefined) {
      cached = build();
    }
    return cached;
  }
  return new Proxy(Object.create(null) as T, {
    get: (_target, prop) => Reflect.get(resolve(), prop),
    has: (_target, prop) => Reflect.has(resolve(), prop),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, prop) =>
      Reflect.getOwnPropertyDescriptor(resolve(), prop),
  });
}

export const vxFamousNamesFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'vx-famous-names');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');
  const blankOfficialBallotPath = join(dir, 'blank-official-ballot.pdf');
  const markedOfficialBallotPath = join(dir, 'marked-official-ballot.pdf');
  const sampleBallotPath = join(dir, 'sample-ballot.pdf');

  const election = electionFamousNames2021Fixtures.readElection();
  const allProps = allBaseBallotProps(election);
  const allBallotPropsTest = allProps.filter(
    (props) =>
      props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
  );
  const allBallotPropsOfficial = allProps.filter(
    (props) =>
      props.ballotMode === 'official' &&
      props.ballotType === BallotType.Precinct
  );
  const allBallotPropsSample = allProps.filter(
    (props) =>
      props.ballotMode === 'sample' && props.ballotType === BallotType.Precinct
  );
  // For backwards compatibility, use test mode as default
  const allBallotProps = allBallotPropsTest;
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
    blankOfficialBallotPath,
    markedOfficialBallotPath,
    allBallotProps,
    allBallotPropsTest,
    allBallotPropsOfficial,
    ...blankBallotProps,
    votes,
    sampleBallotPath,

    async generate(
      rendererPool: RendererPool,
      { generatePageImages = false } = {}
    ) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const allBallotProps = [
        ...allBallotPropsTest,
        ...allBallotPropsOfficial,
        ...allBallotPropsSample,
      ];
      debug(`Generating: ${blankBallotPath}`);
      debug(`Generating: ${blankOfficialBallotPath}`);
      debug(`Generating: ${sampleBallotPath}`);
      const layouts = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        serializationOptions
      );

      assert(
        layouts.electionDefinition.ballotHash === electionDefinition.ballotHash,
        'If this fails its likely because the lib/fixtures election fixtures are out of date. Run pnpm generate-election-packages in libs/fixture-generators'
      );

      const contentsWithProps = iter(layouts.ballotContents)
        .zip(allBallotProps)
        .toArray();
      const [blankBallotContents] = find(
        contentsWithProps,
        ([, props]) => props.ballotMode === 'test'
      );
      const [blankOfficialBallotContents] = find(
        contentsWithProps,
        ([, props]) => props.ballotMode === 'official'
      );
      const [blankSampleBallotContents] = find(
        contentsWithProps,
        ([, props]) => props.ballotMode === 'sample'
      );

      const {
        blankBallotPdf,
        markedBallotPdf,
        blankOfficialBallotPdf,
        markedOfficialBallotPdf,
        sampleBallotPdf,
      } = await rendererPool.runTask(async (renderer) => {
        // Generate test mode ballots
        const ballotDocument =
          await renderer.loadDocumentFromContent(blankBallotContents);
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
          allBallotPropsTest[0],
          ballotDocument,
          electionDefinition
        );

        debug(`Generating: ${markedBallotPath}`);
        await markBallotDocument(ballotDocument, votes);
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const markedBallotPdf = await ballotDocument.renderToPdf();

        // Generate official mode ballots
        const officialBallotDocument = await renderer.loadDocumentFromContent(
          blankOfficialBallotContents
        );
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const blankOfficialBallotPdf = await renderBallotPdfWithMetadataQrCode(
          allBallotPropsOfficial[0],
          officialBallotDocument,
          electionDefinition
        );

        debug(`Generating: ${markedOfficialBallotPath}`);
        await markBallotDocument(officialBallotDocument, votes);
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const markedOfficialBallotPdf =
          await officialBallotDocument.renderToPdf();

        // Generate sample mode ballots
        const sampleBallotDocument = await renderer.loadDocumentFromContent(
          blankSampleBallotContents
        );
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const sampleBallotPdf = await renderBallotPdfWithMetadataQrCode(
          allBallotPropsSample[0],
          sampleBallotDocument,
          electionDefinition
        );

        return {
          blankBallotPdf,
          markedBallotPdf,
          blankOfficialBallotPdf,
          markedOfficialBallotPdf,
          sampleBallotPdf,
        };
      });

      let blankBallotPageImages: Optional<ImageData[]>;
      let markedBallotPageImages: Optional<ImageData[]>;
      let blankOfficialBallotPageImages: Optional<ImageData[]>;
      let markedOfficialBallotPageImages: Optional<ImageData[]>;
      if (generatePageImages) {
        [
          blankBallotPageImages,
          markedBallotPageImages,
          blankOfficialBallotPageImages,
          markedOfficialBallotPageImages,
        ] = await Promise.all(
          [
            { path: blankBallotPath, pdf: blankBallotPdf },
            { path: markedBallotPath, pdf: markedBallotPdf },
            { path: blankOfficialBallotPath, pdf: blankOfficialBallotPdf },
            { path: markedOfficialBallotPath, pdf: markedOfficialBallotPdf },
          ].map(async ({ path, pdf }) => {
            debug(`Generating page images for: ${path}`);
            return await iter(
              pdfToImages(Uint8Array.from(pdf), {
                scale: 200 / 72,
              })
            )
              .map(({ page }) => page)
              .toArray();
          })
        );
      }

      return {
        electionDefinition,
        blankBallotPath,
        markedBallotPath,
        blankOfficialBallotPath,
        markedOfficialBallotPath,
        blankBallotPdf,
        markedBallotPdf,
        blankOfficialBallotPdf,
        markedOfficialBallotPdf,
        blankBallotPageImages,
        markedBallotPageImages,
        blankOfficialBallotPageImages,
        markedOfficialBallotPageImages,
        sampleBallotPath,
        sampleBallotPdf,
      };
    },
  };
});

export const vxGeneralElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'vx-general-election');

  function makeElectionFixtureSpec(election: Election) {
    const electionDir = join(
      dir,
      [election.ballotLayout.paperSize, election.ballotStyles[0].languages[0]]
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
      getBallotStyle({ election, ballotStyleId: '12' })
    );
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const contests = getContests({ election, ballotStyle });
    const { votes, unmarkedWriteIns } = createTestVotes(contests);
    const { paperSize } = election.ballotLayout;
    const languageCode = ballotStyle.languages[0];
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
      rendererPool: RendererPool,
      specs: Array<ReturnType<typeof makeElectionFixtureSpec>>
    ) {
      async function generateElectionFixtures(
        spec: ReturnType<typeof makeElectionFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const { electionDefinition, ballotContents } =
          await layOutBallotsAndCreateElectionDefinition(
            rendererPool,
            vxDefaultBallotTemplate,
            spec.allBallotProps,
            serializationOptions
          );
        const [blankBallotContents, ballotProps] = assertDefined(
          iter(ballotContents)
            .zip(spec.allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );

        const { blankBallotPdf, markedBallotPdf } = await rendererPool.runTask(
          async (renderer) => {
            const ballotDocument =
              await renderer.loadDocumentFromContent(blankBallotContents);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
              ballotProps,
              ballotDocument,
              electionDefinition
            );

            debug(`Generating: ${spec.markedBallotPath}`);
            await markBallotDocument(
              ballotDocument,
              spec.votes,
              spec.unmarkedWriteIns
            );
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const markedBallotPdf = await ballotDocument.renderToPdf();

            return { blankBallotPdf, markedBallotPdf };
          }
        );

        let blankBallotPageImages;
        if (spec.generatePageImages) {
          debug(`Generating page images for: ${spec.blankBallotPath}`);
          blankBallotPageImages = await iter(
            pdfToImages(Uint8Array.from(blankBallotPdf), {
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

      return iter(specs).async().map(generateElectionFixtures).toArray();
    },
  };
});

export const vxPrimaryElectionFixtures = lazyFixtures(() => {
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
    assertDefined(getBallotStyle({ election, ballotStyleId: '1-Ma_en' }))
  );
  const fishParty = makePartyFixtureSpec(
    'fish',
    assertDefined(getBallotStyle({ election, ballotStyleId: '1-F_en' }))
  );

  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  return {
    dir,
    allBallotProps,
    electionDefinition,
    mammalParty,
    fishParty,

    async generate(rendererPool: RendererPool, { markedOnly = false } = {}) {
      const layouts = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        serializationOptions
      );
      assert(
        layouts.electionDefinition.ballotHash === electionDefinition.ballotHash,
        'If this fails its likely because the lib/fixtures election fixtures are out of date. Run pnpm generate-election-packages in libs/fixture-generators'
      );

      async function generatePartyFixtures(
        spec: ReturnType<typeof makePartyFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const [blankBallotContents, ballotProps] = assertDefined(
          iter(layouts.ballotContents)
            .zip(allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );

        const { blankBallotPdf, markedBallotPdf } = await rendererPool.runTask(
          async (renderer) => {
            const ballotDocument =
              await renderer.loadDocumentFromContent(blankBallotContents);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const blankBallotPdf = markedOnly
              ? Buffer.from('')
              : await renderBallotPdfWithMetadataQrCode(
                  ballotProps,
                  ballotDocument,
                  layouts.electionDefinition
                );

            debug(`Generating: ${spec.markedBallotPath}`);
            await markBallotDocument(ballotDocument, spec.votes);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const markedBallotPdf = await renderBallotPdfWithMetadataQrCode(
              ballotProps,
              ballotDocument,
              electionDefinition
            );

            return { blankBallotPdf, markedBallotPdf };
          }
        );

        debug(`Generating: ${spec.otherPrecinctBlankBallotPath}`);
        const [otherPrecinctBlankBallot, otherPrecinctBallotProps] =
          assertDefined(
            iter(layouts.ballotContents)
              .zip(allBallotProps)
              .find(
                ([, props]) =>
                  props.ballotStyleId === spec.ballotStyleId &&
                  props.precinctId === spec.otherPrecinctId
              )
          );
        const otherPrecinctBlankBallotPdf = markedOnly
          ? Buffer.from('')
          : await rendererPool.runTask(async (renderer) => {
              const otherPrecinctBallotDocument =
                await renderer.loadDocumentFromContent(
                  otherPrecinctBlankBallot
                );
              return await renderBallotPdfWithMetadataQrCode(
                otherPrecinctBallotProps,
                otherPrecinctBallotDocument,
                electionDefinition
              );
            });

        return {
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
});

export const nhGeneralElectionFixtures = lazyFixtures(() => {
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
    const newContests = baseElection.contests.map((contest) =>
      // Make one ballot measure description too long to fit on one page to test
      // that it gets split onto multiple pages
      contest.id === 'proposition-1' && contest.type === 'yesno'
        ? {
            ...contest,
            description: contest.description.repeat(5),
          }
        : // Give one ballot measure a third option to test that it gets rendered
        // correctly. v4.0 exports transform it to a candidate contest;
        // v4.1+ exports it natively with all options.
        contest.id === 'question-a' && contest.type === 'yesno'
        ? {
            ...contest,
            options: [
              ...contest.options,
              {
                id: 'third-option',
                label: 'Third Option',
              },
            ] as typeof contest.options,
          }
        : contest
    );

    const election: Election = {
      ...baseElection,
      ballotLayout: {
        ...baseElection.ballotLayout,
        paperSize,
      },
      // Regenerate ballot styles to apply rotation logic
      ballotStyles: generateBallotStyles({
        ballotTemplateId: 'NhBallot',
        electionType: 'general',
        isMiCombinedBallotPrimary: false,
        ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
        precincts: [...baseElection.precincts],
        parties: baseElection.parties,
        contests: newContests,
        electionId: baseElection.id,
      }),
      contests: newContests,
      signature: {
        caption: 'Base Election Signature Caption',
        image: `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
          <rect width="200" height="50" style="fill: none; stroke-width: 2; stroke: black;" />
          <text y="20" fill="black">Base Election Signature Image</text>
        </svg>
      `.trim(),
      },
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
      getBallotStyle({ election, ballotStyleId: '1_en' })
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

  const customNhProps: Partial<NhBallotProps> = {
    electionTitleOverride: 'Overriden Election Title',
    electionSealOverride: vxFamousNamesFixtures.election.seal,
    clerkSignatureImage: `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
          <rect width="200" height="50" style="fill: none; stroke-width: 2; stroke: black;" />
          <text y="20" fill="black">Clerk Signature Image</text>
        </svg>
      `.trim(),
    clerkSignatureCaption: 'Clerk Signature Caption',
  };
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
      rendererPool: RendererPool,
      specs: Array<ReturnType<typeof makeFixtureSpec>>
    ) {
      async function generateFixtures(
        spec: ReturnType<typeof makeFixtureSpec>
      ) {
        debug(`Generating: ${spec.blankBallotPath}`);
        const { electionDefinition, ballotContents } =
          await layOutBallotsAndCreateElectionDefinition(
            rendererPool,
            nhBallotTemplate,
            spec.allBallotProps,
            serializationOptions
          );
        const [blankBallotContents, ballotProps] = assertDefined(
          iter(ballotContents)
            .zip(spec.allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );

        const { blankBallotPdf, markedBallotPdf } = await rendererPool.runTask(
          async (renderer) => {
            const ballotDocument =
              await renderer.loadDocumentFromContent(blankBallotContents);
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
              ballotProps,
              ballotDocument,
              electionDefinition
            );

            debug(`Generating: ${spec.markedBallotPath}`);
            await markBallotDocument(
              ballotDocument,
              spec.votes,
              spec.unmarkedWriteIns
            );
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const markedBallotPdf = await ballotDocument.renderToPdf();

            return { blankBallotPdf, markedBallotPdf };
          }
        );

        return {
          electionDefinition,
          blankBallotPdf,
          markedBallotPdf,
        };
      }

      return iter(specs).async().map(generateFixtures).toArray();
    },
  };
});

const NH_STATE_TEST_SIGNATURE = {
  caption: 'Test Signature Caption',
  image: `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <rect width="200" height="50" style="fill: none; stroke-width: 2; stroke: black;" />
      <text y="20" fill="black">Test Signature</text>
    </svg>
  `.trim(),
} as const;

export const nhStateGeneralElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'nh-state-general-election');
  const electionPath = join(dir, 'election.json');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');
  const handCountBlankBallotPath = join(dir, 'hand-count-blank-ballot.pdf');
  const federalOfficeOnlyBlankBallotPath = join(
    dir,
    'federal-office-only-blank-ballot.pdf'
  );

  const baseElection = readElectionGeneral();
  // Rename contests so the NH state template's isFederalOfficeContest matcher
  // picks them up for FOO ballots.
  const contests = baseElection.contests.map((contest) => {
    if (contest.title === 'President and Vice-President') {
      // eslint-disable-next-line no-param-reassign
      contest = {
        ...contest,
        title: 'President and Vice-President of the United States',
      };
    } else if (contest.title === 'Senator') {
      // eslint-disable-next-line no-param-reassign
      contest = { ...contest, title: 'United States Senator' };
    } else if (contest.title === 'Representative, District 6') {
      // eslint-disable-next-line no-param-reassign
      contest = {
        ...contest,
        title: 'Representative in Congress, District 6',
      };
    }
    if (contest.type !== 'candidate') return contest;
    // Rearrange candidates so we get one per column (Dem, Rep, single Other) so
    // the layout matches what a real NH ballot would have.
    const democraticPartyId = assertDefined(
      baseElection.parties.find((p) => p.name.toLowerCase().startsWith('dem'))
    ).id;
    const republicanPartyId = assertDefined(
      baseElection.parties.find((p) => p.name.toLowerCase().startsWith('rep'))
    ).id;
    const trimmedCandidates = contest.candidates
      .slice(0, 3)
      .map((candidate, index) => {
        if (index === 0) return { ...candidate, partyIds: [democraticPartyId] };
        if (index === 1) return { ...candidate, partyIds: [republicanPartyId] };
        return candidate;
      });
    return {
      ...contest,
      allowWriteIns: true,
      candidates: trimmedCandidates,
    };
  });
  const election: Election = {
    ...baseElection,
    contests,
    ballotLayout: {
      ...baseElection.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
    ballotStyles: generateBallotStyles({
      ballotTemplateId: 'NhStateBallot',
      electionType: 'general',
      isMiCombinedBallotPrimary: false,
      ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
      precincts: [...baseElection.precincts],
      parties: baseElection.parties,
      contests,
      electionId: baseElection.id,
    }),
    signature: NH_STATE_TEST_SIGNATURE,
  };

  const allBallotProps: NhStateBallotProps[] = election.ballotStyles.flatMap(
    (ballotStyle) =>
      ballotStyle.precincts.map((precinctId) => ({
        election,
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        ballotMode: 'official' as const,
      }))
  );

  const ballotStyle = assertDefined(election.ballotStyles[0]);
  const precinctId = assertDefined(ballotStyle.precincts[0]);
  const ballotStyleContests = getContests({ election, ballotStyle });
  const { votes, unmarkedWriteIns } = createTestVotes(ballotStyleContests);

  const handCountBallotProps: NhStateBallotProps[] = allBallotProps.map(
    (props) => ({
      ...props,
      ballotType: BallotType.Absentee,
      isHandCount: true,
    })
  );
  const federalOfficeOnlyBallotProps: NhStateBallotProps[] = allBallotProps.map(
    (props) => ({
      ...props,
      ballotType: BallotType.Absentee,
      isFederalOfficeOnly: true,
    })
  );
  const combinedBallotProps: NhStateBallotProps[] = [
    ...allBallotProps,
    ...handCountBallotProps,
    ...federalOfficeOnlyBallotProps,
  ];

  return {
    dir,
    electionPath,
    blankBallotPath,
    markedBallotPath,
    handCountBlankBallotPath,
    federalOfficeOnlyBlankBallotPath,
    allBallotProps: combinedBallotProps,
    precinctId,
    ballotStyleId: ballotStyle.id,
    votes,
    unmarkedWriteIns,

    async generate(rendererPool: RendererPool) {
      const layout = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        nhStateBallotTemplate,
        combinedBallotProps,
        serializationOptions
      );

      async function renderBallotPdf(
        match: (props: NhStateBallotProps) => boolean,
        paths: { blankPath: string; markedPath?: string }
      ) {
        const [contents, chosenProps] = assertDefined(
          iter(layout.ballotContents)
            .zip(combinedBallotProps)
            .find(([, props]) => match(props))
        );
        return rendererPool.runTask(async (renderer) => {
          const doc = await renderer.loadDocumentFromContent(contents);
          debug(`Generating: ${paths.blankPath}`);
          const blankPdf = await renderBallotPdfWithMetadataQrCode(
            chosenProps,
            doc,
            layout.electionDefinition
          );
          if (!paths.markedPath) {
            return { blankPdf };
          }
          debug(`Generating: ${paths.markedPath}`);
          await markBallotDocument(doc, votes, unmarkedWriteIns);
          const markedPdf = await doc.renderToPdf();
          return { blankPdf, markedPdf };
        });
      }

      const defaultResult = await renderBallotPdf(
        (props) =>
          props.ballotStyleId === ballotStyle.id &&
          props.precinctId === precinctId &&
          !props.isHandCount &&
          !props.isFederalOfficeOnly,
        { blankPath: blankBallotPath, markedPath: markedBallotPath }
      );
      const handCountResult = await renderBallotPdf(
        (props) =>
          props.ballotStyleId === ballotStyle.id &&
          props.precinctId === precinctId &&
          Boolean(props.isHandCount),
        { blankPath: handCountBlankBallotPath }
      );
      const federalOfficeOnlyResult = await renderBallotPdf(
        (props) =>
          props.ballotStyleId === ballotStyle.id &&
          props.precinctId === precinctId &&
          Boolean(props.isFederalOfficeOnly),
        { blankPath: federalOfficeOnlyBlankBallotPath }
      );

      return {
        electionDefinition: layout.electionDefinition,
        blankBallotPdf: defaultResult.blankPdf,
        markedBallotPdf: assertDefined(defaultResult.markedPdf),
        handCountBlankBallotPdf: handCountResult.blankPdf,
        federalOfficeOnlyBlankBallotPdf: federalOfficeOnlyResult.blankPdf,
      };
    },
  };
});

export const nhStatePrimaryElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'nh-state-primary-election');
  const electionPath = join(dir, 'election.json');
  const demHandCountBlankBallotPath = join(
    dir,
    'dem-hand-count-blank-ballot.pdf'
  );
  const baseElection = electionPrimaryPrecinctSplitsFixtures.readElection();
  // Rename the Mammal/Fish parties to Democrat/Republican so the primary
  // template's color tinting (which keys off isDemocraticParty /
  // isRepublicanParty name matching) takes effect.
  const enStrings = baseElection.ballotStrings['en'] ?? {};
  const election: Election = {
    ...baseElection,
    parties: baseElection.parties.map((party) => {
      if (party.name === 'Mammal') {
        return {
          ...party,
          name: 'Democrat',
          fullName: 'Democratic Party',
          abbrev: 'D',
        };
      }
      if (party.name === 'Fish') {
        return {
          ...party,
          name: 'Republican',
          fullName: 'Republican Party',
          abbrev: 'R',
        };
      }
      return party;
    }),
    // Match NH state federal-office naming conventions.
    contests: baseElection.contests.map((contest) => {
      const renamed =
        contest.title.startsWith('Congressional ') &&
        contest.title.includes('Representative')
          ? {
              ...contest,
              title: contest.title.replace(
                'Representative',
                'Representative in Congress'
              ),
            }
          : contest;
      if (renamed.type !== 'candidate') return renamed;
      return { ...renamed, allowWriteIns: true };
    }),
    ballotStrings: {
      ...baseElection.ballotStrings,
      en: {
        ...enStrings,
        partyName: {
          ...(enStrings['partyName'] as Record<string, string>),
          '0': 'Democrat',
          '1': 'Republican',
        },
        partyFullName: {
          ...(enStrings['partyFullName'] as Record<string, string>),
          '0': 'Democratic Party',
          '1': 'Republican Party',
        },
      },
    },
    signature: NH_STATE_TEST_SIGNATURE,
  };
  const allBallotProps: NhStateBallotProps[] = election.ballotStyles.flatMap(
    (ballotStyle) =>
      ballotStyle.precincts.map((precinctId) => ({
        election,
        ballotStyleId: ballotStyle.id,
        precinctId,
        ballotType: BallotType.Precinct,
        ballotMode: 'official' as const,
      }))
  );

  function makePartyFixtureSpec(partyLabel: string, ballotStyle: BallotStyle) {
    const blankBallotPath = join(dir, `${partyLabel}-blank-ballot.pdf`);
    const markedBallotPath = join(dir, `${partyLabel}-marked-ballot.pdf`);
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const contests = getContests({ election, ballotStyle });
    const { votes, unmarkedWriteIns } = createTestVotes(contests);
    return {
      ballotStyleId: ballotStyle.id,
      precinctId,
      blankBallotPath,
      markedBallotPath,
      votes,
      unmarkedWriteIns,
    };
  }

  const demParty = makePartyFixtureSpec(
    'dem',
    assertDefined(getBallotStyle({ election, ballotStyleId: '1-Ma_en' }))
  );
  const repParty = makePartyFixtureSpec(
    'rep',
    assertDefined(getBallotStyle({ election, ballotStyleId: '1-F_en' }))
  );

  const demHandCountBallotProps: NhStateBallotProps = {
    election,
    ballotStyleId: demParty.ballotStyleId,
    precinctId: demParty.precinctId,
    ballotType: BallotType.Absentee,
    ballotMode: 'official',
    isHandCount: true,
  };
  const demFederalOfficeOnlyBallotProps: NhStateBallotProps = {
    election,
    ballotStyleId: demParty.ballotStyleId,
    precinctId: demParty.precinctId,
    ballotType: BallotType.Absentee,
    ballotMode: 'official',
    isFederalOfficeOnly: true,
  };
  const combinedBallotProps: NhStateBallotProps[] = [
    ...allBallotProps,
    demHandCountBallotProps,
    demFederalOfficeOnlyBallotProps,
  ];
  const demFederalOfficeOnlyBlankBallotPath = join(
    dir,
    'dem-federal-office-only-blank-ballot.pdf'
  );

  return {
    dir,
    electionPath,
    allBallotProps: combinedBallotProps,
    demParty,
    repParty,
    demHandCountBlankBallotPath,
    demFederalOfficeOnlyBlankBallotPath,

    async generate(rendererPool: RendererPool) {
      const layout = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        nhStateBallotTemplate,
        combinedBallotProps,
        serializationOptions
      );

      async function renderBallotPdf(spec: {
        match: (props: NhStateBallotProps) => boolean;
        blankPath: string;
        markedPath?: string;
        votes?: ReturnType<typeof createTestVotes>['votes'];
        unmarkedWriteIns?: ReturnType<
          typeof createTestVotes
        >['unmarkedWriteIns'];
      }) {
        const [contents, chosenProps] = assertDefined(
          iter(layout.ballotContents)
            .zip(combinedBallotProps)
            .find(([, props]) => spec.match(props))
        );
        return rendererPool.runTask(async (renderer) => {
          const doc = await renderer.loadDocumentFromContent(contents);
          debug(`Generating: ${spec.blankPath}`);
          const blankPdf = await renderBallotPdfWithMetadataQrCode(
            chosenProps,
            doc,
            layout.electionDefinition
          );
          if (!spec.markedPath) {
            return { blankPdf };
          }
          debug(`Generating: ${spec.markedPath}`);
          await markBallotDocument(
            doc,
            assertDefined(spec.votes),
            spec.unmarkedWriteIns
          );
          const markedPdf = await doc.renderToPdf();
          return { blankPdf, markedPdf };
        });
      }

      const demResult = await renderBallotPdf({
        match: (props) =>
          props.ballotStyleId === demParty.ballotStyleId &&
          props.precinctId === demParty.precinctId &&
          !props.isHandCount &&
          !props.isFederalOfficeOnly,
        blankPath: demParty.blankBallotPath,
        markedPath: demParty.markedBallotPath,
        votes: demParty.votes,
        unmarkedWriteIns: demParty.unmarkedWriteIns,
      });
      const repResult = await renderBallotPdf({
        match: (props) =>
          props.ballotStyleId === repParty.ballotStyleId &&
          props.precinctId === repParty.precinctId &&
          !props.isHandCount &&
          !props.isFederalOfficeOnly,
        blankPath: repParty.blankBallotPath,
        markedPath: repParty.markedBallotPath,
        votes: repParty.votes,
        unmarkedWriteIns: repParty.unmarkedWriteIns,
      });
      const demHandCountResult = await renderBallotPdf({
        match: (props) =>
          props.ballotStyleId === demParty.ballotStyleId &&
          props.precinctId === demParty.precinctId &&
          Boolean(props.isHandCount),
        blankPath: demHandCountBlankBallotPath,
      });
      const demFederalOfficeOnlyResult = await renderBallotPdf({
        match: (props) =>
          props.ballotStyleId === demParty.ballotStyleId &&
          props.precinctId === demParty.precinctId &&
          Boolean(props.isFederalOfficeOnly),
        blankPath: demFederalOfficeOnlyBlankBallotPath,
      });

      return {
        electionDefinition: layout.electionDefinition,
        demParty: {
          ...demParty,
          blankBallotPdf: demResult.blankPdf,
          markedBallotPdf: assertDefined(demResult.markedPdf),
        },
        repParty: {
          ...repParty,
          blankBallotPdf: repResult.blankPdf,
          markedBallotPdf: assertDefined(repResult.markedPdf),
        },
        demHandCountBlankBallotPdf: demHandCountResult.blankPdf,
        demFederalOfficeOnlyBlankBallotPdf: demFederalOfficeOnlyResult.blankPdf,
      };
    },
  };
});

export const msGeneralElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'ms-general-election');
  const electionPath = join(dir, 'election.json');
  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');

  const election = readElectionGeneral();
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

  return {
    dir,
    electionPath,
    blankBallotPath,
    markedBallotPath,
    allBallotProps,
    ...blankBallotProps,
    votes,

    async generate(rendererPool: RendererPool) {
      debug(`Generating: ${blankBallotPath}`);
      const { ballotContents, electionDefinition } =
        await layOutBallotsAndCreateElectionDefinition(
          rendererPool,
          msBallotTemplate,
          allBallotProps,
          serializationOptions
        );

      const blankBallotContents = ballotContents[0];
      const { blankBallotPdf, markedBallotPdf } = await rendererPool.runTask(
        async (renderer) => {
          const ballotDocument =
            await renderer.loadDocumentFromContent(blankBallotContents);
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
            allBallotProps[0],
            ballotDocument,
            electionDefinition
          );

          debug(`Generating: ${markedBallotPath}`);
          await markBallotDocument(ballotDocument, votes);
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const markedBallotPdf = await ballotDocument.renderToPdf();

          return { blankBallotPdf, markedBallotPdf };
        }
      );

      return {
        electionDefinition,
        blankBallotPath,
        markedBallotPath,
        blankBallotPdf,
        markedBallotPdf,
      };
    },
  };
});

export const miClosedPrimaryElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'mi-closed-primary-election');
  const electionPath = join(dir, 'election.json');

  const baseElection = electionTwoPartyPrimaryFixtures.readElection();
  const nonpartisanContest: CandidateContest = {
    id: 'zoo-director',
    districtId: 'district-1',
    type: 'candidate',
    title: 'Zoo Director',
    seats: 1,
    allowWriteIns: true,
    candidates: [
      { id: 'frank-the-flamingo', name: 'Frank the Flamingo' },
      { id: 'pearl-the-penguin', name: 'Pearl the Penguin' },
    ],
  };
  const election: Election = {
    ...baseElection,
    contests: [...baseElection.contests, nonpartisanContest],
  };
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
    const markedBallotPath = join(dir, `${partyLabel}-marked-ballot.pdf`);
    const precinctId = assertDefined(ballotStyle.precincts[0]);
    const contests = getContests({ election, ballotStyle });
    const { votes } = createTestVotes(contests);

    return {
      ballotStyleId: ballotStyle.id,
      precinctId,
      blankBallotPath,
      markedBallotPath,
      votes,
    };
  }

  const mammalParty = makePartyFixtureSpec(
    'mammal',
    assertDefined(getBallotStyle({ election, ballotStyleId: '1M' }))
  );
  const fishParty = makePartyFixtureSpec(
    'fish',
    assertDefined(getBallotStyle({ election, ballotStyleId: '2F' }))
  );

  return {
    dir,
    electionPath,
    allBallotProps,
    mammalParty,
    fishParty,

    async generate(rendererPool: RendererPool) {
      const { ballotContents, electionDefinition } =
        await layOutBallotsAndCreateElectionDefinition(
          rendererPool,
          miBallotTemplate,
          allBallotProps,
          serializationOptions
        );

      async function generatePartyFixtures(
        spec: ReturnType<typeof makePartyFixtureSpec>
      ) {
        const [blankBallotContents, ballotProps] = assertDefined(
          iter(ballotContents)
            .zip(allBallotProps)
            .find(
              ([, props]) =>
                props.ballotStyleId === spec.ballotStyleId &&
                props.precinctId === spec.precinctId
            )
        );

        return rendererPool.runTask(async (renderer) => {
          const ballotDocument =
            await renderer.loadDocumentFromContent(blankBallotContents);

          debug(`Generating: ${spec.blankBallotPath}`);
          const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
            ballotProps,
            ballotDocument,
            electionDefinition
          );

          debug(`Generating: ${spec.markedBallotPath}`);
          await markBallotDocument(ballotDocument, spec.votes);
          const markedBallotPdf = await ballotDocument.renderToPdf();

          return { blankBallotPdf, markedBallotPdf };
        });
      }

      const mammalResult = await generatePartyFixtures(mammalParty);
      const fishResult = await generatePartyFixtures(fishParty);

      return {
        electionDefinition,
        mammalParty: {
          ...mammalParty,
          ...mammalResult,
        },
        fishParty: {
          ...fishParty,
          ...fishResult,
        },
      };
    },
  };
});

export const miOpenPrimaryElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'mi-open-primary-election');
  const electionPath = join(dir, 'election.json');

  const election = electionCombinedBallotPrimaryFixtures.readElection();
  const ballotStyle = assertDefined(
    getBallotStyle({
      election,
      ballotStyleId: 'ballot-style-1',
    })
  );
  const precinctId = assertDefined(ballotStyle.precincts[0]);
  const allBallotProps = election.ballotStyles.flatMap((bs) =>
    bs.precincts.map(
      (pid): BaseBallotProps => ({
        election,
        ballotStyleId: bs.id,
        precinctId: pid,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    )
  );

  const contests = getContests({ election, ballotStyle });
  const { votes } = createTestVotes(contests);

  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');

  return {
    dir,
    electionPath,
    allBallotProps,
    blankBallotPath,
    markedBallotPath,
    ballotStyleId: ballotStyle.id,
    precinctId,
    votes,

    async generate(rendererPool: RendererPool) {
      const { ballotContents, electionDefinition } =
        await layOutBallotsAndCreateElectionDefinition(
          rendererPool,
          miBallotTemplate,
          allBallotProps,
          serializationOptions
        );

      const [blankBallotContents, ballotProps] = assertDefined(
        iter(ballotContents)
          .zip(allBallotProps)
          .find(
            ([, props]) =>
              props.ballotStyleId === ballotStyle.id &&
              props.precinctId === precinctId
          )
      );

      return rendererPool.runTask(async (renderer) => {
        const ballotDocument =
          await renderer.loadDocumentFromContent(blankBallotContents);

        debug(`Generating: ${blankBallotPath}`);
        const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
          ballotProps,
          ballotDocument,
          electionDefinition
        );

        debug(`Generating: ${markedBallotPath}`);
        await markBallotDocument(ballotDocument, votes);
        const markedBallotPdf = await ballotDocument.renderToPdf();

        return {
          electionDefinition,
          blankBallotPdf,
          markedBallotPdf,
        };
      });
    },
  };
});

export const miGeneralElectionFixtures = lazyFixtures(() => {
  const dir = join(fixturesDir, 'mi-general-election');
  const electionPath = join(dir, 'election.json');

  const election = readElectionStraightParty();
  const ballotStyle = assertDefined(election.ballotStyles[0]);
  const precinctId = assertDefined(ballotStyle.precincts[0]);
  const allBallotProps = election.ballotStyles.flatMap((bs) =>
    bs.precincts.map(
      (pid): BaseBallotProps => ({
        election,
        ballotStyleId: bs.id,
        precinctId: pid,
        ballotType: BallotType.Precinct,
        ballotMode: 'test',
      })
    )
  );

  function candidate(contestId: string, candidateId: string): Candidate {
    const contest = find(election.contests, (c) => c.id === contestId);
    assert(contest.type === 'candidate');
    return find(contest.candidates, (c) => c.id === candidateId);
  }

  const votes: VotesDict = {
    // Votes Federalist on straight party ticket
    'straight-party-ticket': ['0'],
    // Explicitly vote for the same party (to no effect)
    president: [candidate('president', 'barchi-hallaren')],
    // Vote for a different party (overriding straight party selection)
    governor: [candidate('governor', 'bargmann')],
    // Multi-seat contest (4 seats) with a partial vote and a write-in
    'county-commissioners': [
      candidate('county-commissioners', 'argent'),
      candidate('county-commissioners', 'bainbridge'),
      {
        id: 'write-in-0',
        name: 'Write-In #1',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
    // Votes for some nonpartisan contests
    'county-registrar-of-wills': [
      candidate('county-registrar-of-wills', 'ramachandrani'),
    ],
    'city-mayor': [candidate('city-mayor', 'white')],
    'city-council': [
      candidate('city-council', 'eagle'),
      candidate('city-council', 'rupp'),
    ],
    'judicial-robert-demergue': ['judicial-robert-demergue-option-yes'],
    'question-a': ['question-a-option-no'],
    'proposition-1': ['proposition-1-option-yes'],
  };

  const blankBallotPath = join(dir, 'blank-ballot.pdf');
  const markedBallotPath = join(dir, 'marked-ballot.pdf');

  return {
    dir,
    electionPath,
    allBallotProps,
    blankBallotPath,
    markedBallotPath,
    ballotStyleId: ballotStyle.id,
    precinctId,
    votes,

    async generate(rendererPool: RendererPool) {
      const { ballotContents, electionDefinition } =
        await layOutBallotsAndCreateElectionDefinition(
          rendererPool,
          miBallotTemplate,
          allBallotProps,
          serializationOptions
        );

      const [blankBallotContents, ballotProps] = assertDefined(
        iter(ballotContents)
          .zip(allBallotProps)
          .find(
            ([, props]) =>
              props.ballotStyleId === ballotStyle.id &&
              props.precinctId === precinctId
          )
      );

      return rendererPool.runTask(async (renderer) => {
        const ballotDocument =
          await renderer.loadDocumentFromContent(blankBallotContents);

        debug(`Generating: ${blankBallotPath}`);
        const blankBallotPdf = await renderBallotPdfWithMetadataQrCode(
          ballotProps,
          ballotDocument,
          electionDefinition
        );

        debug(`Generating: ${markedBallotPath}`);
        await markBallotDocument(ballotDocument, votes);
        const markedBallotPdf = await ballotDocument.renderToPdf();

        return {
          electionDefinition,
          blankBallotPdf,
          markedBallotPdf,
        };
      });
    },
  };
});

export const timingMarkPaperFixtures = lazyFixtures(() => {
  function specPaths(spec: {
    paperSize: HmpbBallotPaperSize;
    paperType: timingMarkPaperTemplate.TimingMarkPaperType;
  }): {
    dir: string;
    pdf: string;
  } {
    const { paperSize, paperType } = spec;
    const dir = join(fixturesDir, 'timing-mark-paper', paperSize);
    return {
      dir,
      pdf: join(dir, `timing-mark-paper-${paperType}.pdf`),
    };
  }

  return {
    fixtureSpecs: [
      ...Object.values(HmpbBallotPaperSize).map((paperSize) => ({
        paperSize,
        paperType: 'standard' as const,
      })),
      ...Object.values(HmpbBallotPaperSize).map((paperSize) => ({
        paperSize,
        paperType: 'qa-overlay' as const,
      })),
    ] as const,

    specPaths,

    async generate(
      renderer: Renderer,
      spec: {
        paperSize: HmpbBallotPaperSize;
        paperType: timingMarkPaperTemplate.TimingMarkPaperType;
      }
    ): Promise<{ pdf: Uint8Array }> {
      const document = await timingMarkPaperTemplate.render(
        renderer,
        spec.paperSize,
        spec.paperType
      );
      debug(
        `Generating: timing-mark-paper@${spec.paperSize} (${spec.paperType})`
      );
      const pdf = await document.renderToPdf();
      return { pdf: await convertPdfToCmyk(pdf) };
    },
  };
});

export const calibrationSheetFixtures = lazyFixtures(() => {
  function specPaths(paperSize: HmpbBallotPaperSize): {
    dir: string;
    pdf: string;
  } {
    const dir = join(fixturesDir, 'calibration-sheet');
    return {
      dir,
      pdf: join(dir, `calibration-sheet-${paperSize}.pdf`),
    };
  }

  return {
    specPaths,

    fixtureSpecs: Object.values(HmpbBallotPaperSize),

    async generate(
      renderer: Renderer,
      paperSize: HmpbBallotPaperSize
    ): Promise<{ pdf: Uint8Array }> {
      const document = await calibrationSheetTemplate.render(
        renderer,
        paperSize
      );
      debug(`Generating: calibration-sheet-${paperSize}.pdf`);
      const pdf = await document.renderToPdf();
      return { pdf: await convertPdfToCmyk(pdf) };
    },
  };
});
