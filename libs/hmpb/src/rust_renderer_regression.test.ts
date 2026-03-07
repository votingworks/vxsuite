import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BaseBallotProps,
  BallotStyleId,
  BallotType,
  Election,
  HmpbBallotPaperSize,
  getBallotStyle,
} from '@votingworks/types';
import { assertDefined, iter } from '@votingworks/basics';
import { pdfToImages } from '@votingworks/image-utils';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import { fixturesDir } from './ballot_fixtures';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { createRustRendererPool } from './rust_renderer';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

const RUST_FIXTURES_DIR = join(fixturesDir, 'rust-renderer');

const BALLOT_STYLE_IDS: BallotStyleId[] = [
  '5' as BallotStyleId,
  '12' as BallotStyleId,
];

function makeElection(): Election {
  const electionGeneral = readElectionGeneral();
  return {
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
  } as const;
}

function makeBallotProps(
  election: Election,
  ballotStyleId: BallotStyleId
): BaseBallotProps[] {
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  return ballotStyle.precincts.map(
    (precinctId): BaseBallotProps => ({
      election,
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Absentee,
      ballotMode: 'official',
    })
  );
}

async function renderBallotPdf(
  rendererPool: RendererPool,
  allBallotProps: BaseBallotProps[]
): Promise<Uint8Array> {
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      vxDefaultBallotTemplate,
      allBallotProps,
      'vxf'
    );

  const { precinctId } = allBallotProps[0];
  const [blankBallotContents, ballotProps] = assertDefined(
    iter(ballotContents)
      .zip(allBallotProps)
      .find(([, props]) => props.precinctId === precinctId)
  );

  return rendererPool.runTask(async (renderer) => {
    const ballotDocument =
      await renderer.loadDocumentFromContent(blankBallotContents);
    return renderBallotPdfWithMetadataQrCode(
      ballotProps,
      ballotDocument,
      electionDefinition
    );
  });
}

describe('Rust renderer regression (vs saved references)', () => {
  let rustPool: RendererPool;
  beforeAll(async () => {
    rustPool = await createRustRendererPool();
  });

  afterAll(async () => {
    await rustPool.close();
  });

  test.each(BALLOT_STYLE_IDS)(
    'style %s matches saved reference',
    async (ballotStyleId) => {
      const election = makeElection();
      const allBallotProps = makeBallotProps(election, ballotStyleId);
      const pdf = await renderBallotPdf(rustPool, allBallotProps);

      const referencePath = join(
        RUST_FIXTURES_DIR,
        `style-${ballotStyleId}-blank.pdf`
      );

      if (process.env['UPDATE_REFERENCES']) {
        const fs = await import('node:fs');
        fs.writeFileSync(referencePath, pdf);
        return;
      }

      await expectToMatchSavedPdf(pdf, referencePath);
    }
  );
});

// Threshold for Rust-vs-Chromium comparison. The renderers produce slightly
// different output due to inherent layout engine differences (Taffy vs Blink)
// that cause ~0.3pt text position drift across the page. We compare at 200 DPI
// to reduce the impact of sub-pixel rendering differences, and use a threshold
// that catches large layout regressions while tolerating minor positioning.
const RUST_VS_CHROMIUM_COMPARISON_SCALE = 200 / 72;
const RUST_VS_CHROMIUM_FAILURE_THRESHOLD = 0.035;

describe('Rust renderer vs Chromium', () => {
  let rustPool: RendererPool;
  let chromiumPool: RendererPool;

  beforeAll(async () => {
    rustPool = await createRustRendererPool();
    chromiumPool = await createPlaywrightRendererPool();
  });

  afterAll(async () => {
    await rustPool.close();
    await chromiumPool.close();
  });

  test.each(BALLOT_STYLE_IDS)(
    'style %s renders similarly to Chromium',
    async (ballotStyleId) => {
      const election = makeElection();
      const allBallotProps = makeBallotProps(election, ballotStyleId);

      const [rustPdf, chromiumPdf] = await Promise.all([
        renderBallotPdf(rustPool, allBallotProps),
        renderBallotPdf(chromiumPool, allBallotProps),
      ]);

      const rustPages = pdfToImages(rustPdf, {
        scale: RUST_VS_CHROMIUM_COMPARISON_SCALE,
      });
      const chromiumPages = pdfToImages(chromiumPdf, {
        scale: RUST_VS_CHROMIUM_COMPARISON_SCALE,
      });
      const pagePairs = iter(rustPages).zip(chromiumPages);

      for await (const [
        { page: rustPage, pageNumber },
        { page: chromiumPage },
      ] of pagePairs) {
        await expect(rustPage).toMatchImage(chromiumPage, {
          diffPath: join(
            RUST_FIXTURES_DIR,
            `style-${ballotStyleId}-vs-chromium-p${pageNumber}-diff.png`
          ),
          failureThreshold: RUST_VS_CHROMIUM_FAILURE_THRESHOLD,
        });
      }
    }
  );
});
