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
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { createRustRendererPool } from './rust_renderer';
import { createPlaywrightRendererPool } from './playwright_renderer';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { RendererPool } from './renderer';

vi.setConfig({
  testTimeout: 300_000,
});

const OUTPUT_DIR = join(__dirname, '../fixtures/rust-renderer');

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

describe('Rust renderer benchmark', () => {
  const BALLOT_STYLE_ID = '12' as BallotStyleId;
  const ITERATIONS = 5;

  test('performance: Rust vs Chromium full pipeline', async () => {
    const election = makeElection();
    const allBallotProps = makeBallotProps(election, BALLOT_STYLE_ID);

    // Warmup + measure Rust
    const rustPool = await createRustRendererPool();
    // Warmup run
    await renderBallotPdf(rustPool, allBallotProps);

    const rustTimes: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = performance.now();
      await renderBallotPdf(rustPool, allBallotProps);
      rustTimes.push(performance.now() - start);
    }
    await rustPool.close();

    // Warmup + measure Chromium
    const chromiumPool = await createPlaywrightRendererPool();
    // Warmup run
    await renderBallotPdf(chromiumPool, allBallotProps);

    const chromiumTimes: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      const start = performance.now();
      await renderBallotPdf(chromiumPool, allBallotProps);
      chromiumTimes.push(performance.now() - start);
    }
    await chromiumPool.close();

    const rustAvg = rustTimes.reduce((a, b) => a + b, 0) / rustTimes.length;
    const chromiumAvg =
      chromiumTimes.reduce((a, b) => a + b, 0) / chromiumTimes.length;
    const speedup = chromiumAvg / rustAvg;

    // eslint-disable-next-line no-console
    console.log('\n=== Benchmark Results (Style 12, full pipeline) ===');
    // eslint-disable-next-line no-console
    console.log(
      `Rust:     ${rustTimes
        .map((t) => `${t.toFixed(0)}ms`)
        .join(', ')}  avg: ${rustAvg.toFixed(0)}ms`
    );
    // eslint-disable-next-line no-console
    console.log(
      `Chromium: ${chromiumTimes
        .map((t) => `${t.toFixed(0)}ms`)
        .join(', ')}  avg: ${chromiumAvg.toFixed(0)}ms`
    );
    // eslint-disable-next-line no-console
    console.log(`Speedup:  ${speedup.toFixed(1)}x faster\n`);

    // Sanity check: Rust should be faster
    expect(rustAvg).toBeLessThan(chromiumAvg);
  });
});

describe('Rust renderer high-res comparison', () => {
  test('generate 300 DPI page images for visual comparison', async () => {
    const BALLOT_STYLE_ID = '12' as BallotStyleId;
    const SCALE = 300 / 72; // 300 DPI

    const election = makeElection();
    const allBallotProps = makeBallotProps(election, BALLOT_STYLE_ID);

    const rustPool = await createRustRendererPool();
    const chromiumPool = await createPlaywrightRendererPool();

    const [rustPdf, chromiumPdf] = await Promise.all([
      renderBallotPdf(rustPool, allBallotProps),
      renderBallotPdf(chromiumPool, allBallotProps),
    ]);

    await rustPool.close();
    await chromiumPool.close();

    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Save PDFs
    writeFileSync(join(OUTPUT_DIR, 'bench-rust.pdf'), rustPdf);
    writeFileSync(join(OUTPUT_DIR, 'bench-chromium.pdf'), chromiumPdf);

    // Save page images at 300 DPI
    const rustPages = pdfToImages(rustPdf, { scale: SCALE });
    const chromiumPages = pdfToImages(chromiumPdf, { scale: SCALE });

    for await (const { page, pageNumber } of rustPages) {
      await writeImageData(
        join(OUTPUT_DIR, `style-12-rust-p${pageNumber}-300dpi.png`),
        page
      );
    }
    for await (const { page, pageNumber } of chromiumPages) {
      await writeImageData(
        join(OUTPUT_DIR, `style-12-chromium-p${pageNumber}-300dpi.png`),
        page
      );
    }
  });
});
