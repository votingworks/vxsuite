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
import {
  createImageData,
  pdfToImages,
  writeImageData,
} from '@votingworks/image-utils';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { expectToMatchSavedPdf } from '../test/helpers';
import {
  fixturesDir,
  nhGeneralElectionFixtures,
  msGeneralElectionFixtures,
} from './ballot_fixtures';
import {
  BallotPageTemplate,
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { createRustRendererPool } from './rust_renderer';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { nhBallotTemplate } from './ballot_templates/nh_ballot_template';
import { msBallotTemplate } from './ballot_templates/ms_ballot_template';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 120_000,
});

const RUST_FIXTURES_DIR = join(fixturesDir, 'rust-renderer');

const BALLOT_STYLE_IDS: BallotStyleId[] = [
  '5' as BallotStyleId,
  '12' as BallotStyleId,
];

// Threshold for Rust-vs-Chromium comparison. The renderers produce slightly
// different output due to inherent layout engine differences (Taffy vs Blink)
// that cause ~0.3pt text position drift across the page. We compare at 200 DPI
// to reduce the impact of sub-pixel rendering differences, and use a threshold
// that catches large layout regressions while tolerating minor positioning.
const RUST_VS_CHROMIUM_COMPARISON_SCALE = 200 / 72;
const RUST_VS_CHROMIUM_FAILURE_THRESHOLD = 0.035;

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
  allBallotProps: BaseBallotProps[],
  template: BallotPageTemplate<BaseBallotProps> = vxDefaultBallotTemplate
): Promise<Uint8Array> {
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      template,
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

/**
 * Compares Rust and Chromium PDFs page-by-page, saving per-page images and
 * diff composites (rust | red-highlighted diff | chromium) to the output dir.
 */
async function compareRendererPages(
  rustPdf: Uint8Array,
  chromiumPdf: Uint8Array,
  outputDir: string,
  prefix: string
): Promise<void> {
  const rustPages = pdfToImages(rustPdf, {
    scale: RUST_VS_CHROMIUM_COMPARISON_SCALE,
  });
  const chromiumPages = pdfToImages(chromiumPdf, {
    scale: RUST_VS_CHROMIUM_COMPARISON_SCALE,
  });
  const pagePairs = iter(rustPages).zip(chromiumPages);

  await mkdir(outputDir, { recursive: true });
  for await (const [
    { page: rustPage, pageNumber },
    { page: chromiumPage },
  ] of pagePairs) {
    const pagePrefix = `${prefix}-p${pageNumber}`;
    await writeImageData(join(outputDir, `${pagePrefix}-rust.png`), rustPage);
    await writeImageData(
      join(outputDir, `${pagePrefix}-chromium.png`),
      chromiumPage
    );

    // Generate diff composite: [rust | red-highlighted diff | chromium]
    const { width, height } = rustPage;
    const diffImg = createImageData(width, height);
    for (let i = 0; i < width * height * 4; i += 4) {
      const dr = Math.abs(
        (rustPage.data[i] ?? 0) - (chromiumPage.data[i] ?? 0)
      );
      const dg = Math.abs(
        (rustPage.data[i + 1] ?? 0) - (chromiumPage.data[i + 1] ?? 0)
      );
      const db = Math.abs(
        (rustPage.data[i + 2] ?? 0) - (chromiumPage.data[i + 2] ?? 0)
      );
      const maxDiff = Math.max(dr, dg, db);
      diffImg.data[i] = maxDiff > 0 ? 255 : 0;
      diffImg.data[i + 1] = 0;
      diffImg.data[i + 2] = 0;
      diffImg.data[i + 3] = 255;
    }
    const composite = createImageData(3 * width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const srcIdx = (y * width + x) * 4;
        for (const [img, dx] of [
          [rustPage, 0],
          [diffImg, width],
          [chromiumPage, 2 * width],
        ] as Array<[ImageData, number]>) {
          const dstIdx = (y * 3 * width + (x + dx)) * 4;
          composite.data[dstIdx] = img.data[srcIdx]!;
          composite.data[dstIdx + 1] = img.data[srcIdx + 1]!;
          composite.data[dstIdx + 2] = img.data[srcIdx + 2]!;
          composite.data[dstIdx + 3] = img.data[srcIdx + 3]!;
        }
      }
    }
    await writeImageData(join(outputDir, `${pagePrefix}-diff.png`), composite);

    await expect(rustPage).toMatchImage(chromiumPage, {
      failureThreshold: RUST_VS_CHROMIUM_FAILURE_THRESHOLD,
    });
  }
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
    'VxDefault style %s renders similarly to Chromium',
    async (ballotStyleId) => {
      const election = makeElection();
      const allBallotProps = makeBallotProps(election, ballotStyleId);

      const [rustPdf, chromiumPdf] = await Promise.all([
        renderBallotPdf(rustPool, allBallotProps),
        renderBallotPdf(chromiumPool, allBallotProps),
      ]);

      await compareRendererPages(
        rustPdf,
        chromiumPdf,
        RUST_FIXTURES_DIR,
        `style-${ballotStyleId}`
      );
    }
  );

  test('NH ballot renders similarly to Chromium', async () => {
    const spec = nhGeneralElectionFixtures.fixtureSpecs[0]; // Letter size

    const [rustPdf, chromiumPdf] = await Promise.all([
      renderBallotPdf(
        rustPool,
        spec.allBallotProps,
        nhBallotTemplate as BallotPageTemplate<BaseBallotProps>
      ),
      renderBallotPdf(
        chromiumPool,
        spec.allBallotProps,
        nhBallotTemplate as BallotPageTemplate<BaseBallotProps>
      ),
    ]);

    await compareRendererPages(
      rustPdf,
      chromiumPdf,
      join(RUST_FIXTURES_DIR, 'nh'),
      'nh'
    );
  });

  test('MS ballot renders similarly to Chromium', async () => {
    const [rustPdf, chromiumPdf] = await Promise.all([
      renderBallotPdf(
        rustPool,
        msGeneralElectionFixtures.allBallotProps,
        msBallotTemplate
      ),
      renderBallotPdf(
        chromiumPool,
        msGeneralElectionFixtures.allBallotProps,
        msBallotTemplate
      ),
    ]);

    await compareRendererPages(
      rustPdf,
      chromiumPdf,
      join(RUST_FIXTURES_DIR, 'ms'),
      'ms'
    );
  });
});
