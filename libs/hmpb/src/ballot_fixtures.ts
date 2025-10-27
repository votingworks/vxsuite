import { assert, assertDefined, iter, Optional } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import {
  BaseBallotProps,
  HmpbBallotPaperSize,
  BallotStyle,
  BallotStyleId,
  BallotType,
  Election,
  getBallotStyle,
  getContests,
  LanguageCode,
} from '@votingworks/types';
import { join } from 'node:path';
import makeDebug from 'debug';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import { createTestVotes, markBallotDocument } from './mark_ballot';
import {
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
      rendererPool: RendererPool,
      { generatePageImages = false } = {}
    ) {
      debug(`Generating: ${blankBallotPath}`);
      const layouts = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );

      assert(
        layouts.electionDefinition.ballotHash === electionDefinition.ballotHash,
        'If this fails its likely because the lib/fixtures election fixtures are out of date. Run pnpm generate-election-packages in libs/fixture-generators'
      );

      const blankBallotContents = layouts.ballotContents[0];
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
            'vxf'
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

    async generate(rendererPool: RendererPool, { markedOnly = false } = {}) {
      const layouts = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
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
    // Make one ballot measure description too long to fit on one page to test
    // that it gets split onto multiple pages
    const newContests = baseElection.contests.map((contest) =>
      contest.id === 'proposition-1' && contest.type === 'yesno'
        ? {
            ...contest,
            description: contest.description.repeat(5),
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
      getBallotStyle({ election, ballotStyleId: '1_en' as BallotStyleId })
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
            'vxf'
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
})();

export const timingMarkPaperFixtures = (() => {
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
      { paperSize: HmpbBallotPaperSize.Letter, paperType: 'standard' },
      { paperSize: HmpbBallotPaperSize.Legal, paperType: 'standard' },
      { paperSize: HmpbBallotPaperSize.Custom17, paperType: 'standard' },
      { paperSize: HmpbBallotPaperSize.Custom19, paperType: 'standard' },
      { paperSize: HmpbBallotPaperSize.Custom22, paperType: 'standard' },
      { paperSize: HmpbBallotPaperSize.Letter, paperType: 'qa-overlay' },
      { paperSize: HmpbBallotPaperSize.Legal, paperType: 'qa-overlay' },
      { paperSize: HmpbBallotPaperSize.Custom17, paperType: 'qa-overlay' },
      { paperSize: HmpbBallotPaperSize.Custom19, paperType: 'qa-overlay' },
      { paperSize: HmpbBallotPaperSize.Custom22, paperType: 'qa-overlay' },
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
})();

export const calibrationSheetFixtures = (() => {
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
})();
