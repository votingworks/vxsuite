/**
 * Benchmark comparing pdf-lib renderer vs Chromium/Playwright renderer.
 *
 * Run with: npx tsx src/pdf_ballot_renderer_benchmark.ts
 */

import {
  electionFamousNames2021Fixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { BallotType } from '@votingworks/types';
import { renderBallotToPdf } from './pdf_ballot_renderer';
import {
  allBaseBallotProps,
  layOutBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { createPlaywrightRendererPool } from './playwright_renderer';

interface BenchmarkResult {
  name: string;
  pdfLibMs: number;
  chromiumMs: number;
  speedup: number;
  pdfLibPages: number;
  chromiumPages: number;
}

async function benchmarkElection(
  name: string,
  election: ReturnType<typeof readElectionGeneral>,
  iterations: number = 3
): Promise<BenchmarkResult> {
  const allProps = allBaseBallotProps(election);
  const testProps = allProps.filter(
    (p) => p.ballotMode === 'test' && p.ballotType === BallotType.Precinct
  );
  const ballotProps = testProps[0];

  // Warm up pdf-lib
  const warmupResult = await renderBallotToPdf(election, ballotProps);
  const pdfLibPages =
    warmupResult.gridLayout.gridPositions.length > 0
      ? Math.max(
          ...warmupResult.gridLayout.gridPositions.map((p) => p.sheetNumber)
        ) * 2
      : 2;

  // Benchmark pdf-lib
  const pdfLibStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await renderBallotToPdf(election, ballotProps);
  }
  const pdfLibMs = (performance.now() - pdfLibStart) / iterations;

  // Benchmark Chromium
  const rendererPool = await createPlaywrightRendererPool();
  try {
    // Warm up Chromium
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      vxDefaultBallotTemplate,
      [ballotProps],
      'vxf'
    );

    // Benchmark Chromium - full layout + render pipeline
    const chromiumStart = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        [ballotProps],
        'vxf'
      );
    }
    const chromiumMs = (performance.now() - chromiumStart) / iterations;

    const chromiumPages = pdfLibPages; // same election, should be same page count

    return {
      name,
      pdfLibMs,
      chromiumMs,
      speedup: chromiumMs / pdfLibMs,
      pdfLibPages,
      chromiumPages,
    };
  } finally {
    await rendererPool.close();
  }
}

async function main() {
  console.log('=== PDF Ballot Renderer Benchmark ===\n');
  console.log(
    'Comparing pdf-lib vs Chromium/Playwright rendering performance.\n'
  );

  const results: BenchmarkResult[] = [];

  // Famous Names election (simple, 2 pages)
  console.log('Benchmarking: Famous Names election...');
  const famousNames = electionFamousNames2021Fixtures.readElection();
  results.push(
    await benchmarkElection('Famous Names (2 pages)', famousNames, 5)
  );

  // General Election (complex, 6 pages, ballot measures with rich text)
  console.log('Benchmarking: General Election...');
  const general = readElectionGeneral();
  results.push(
    await benchmarkElection('General Election (6 pages)', general, 3)
  );

  // Batch rendering benchmark - render all ballot styles
  console.log(
    'Benchmarking: Batch rendering (all famous names ballot styles)...'
  );
  const famousNamesProps = allBaseBallotProps(famousNames).filter(
    (p) => p.ballotMode === 'test' && p.ballotType === BallotType.Precinct
  );

  // pdf-lib batch
  const batchPdfLibStart = performance.now();
  await Promise.all(
    famousNamesProps.map((props) => renderBallotToPdf(famousNames, props))
  );
  const batchPdfLibMs = performance.now() - batchPdfLibStart;

  // Chromium batch
  const batchPool = await createPlaywrightRendererPool();
  try {
    const batchChromiumStart = performance.now();
    await layOutBallotsAndCreateElectionDefinition(
      batchPool,
      vxDefaultBallotTemplate,
      famousNamesProps,
      'vxf'
    );
    const batchChromiumMs = performance.now() - batchChromiumStart;

    results.push({
      name: `Batch: ${famousNamesProps.length} ballots`,
      pdfLibMs: batchPdfLibMs,
      chromiumMs: batchChromiumMs,
      speedup: batchChromiumMs / batchPdfLibMs,
      pdfLibPages: famousNamesProps.length * 2,
      chromiumPages: famousNamesProps.length * 2,
    });
  } finally {
    await batchPool.close();
  }

  // Cold start benchmark - includes browser launch time
  console.log('Benchmarking: Cold start (includes browser launch)...');

  // pdf-lib cold start (no browser needed - just font loading)
  const coldPdfLibStart = performance.now();
  await renderBallotToPdf(famousNames, famousNamesProps[0]);
  const coldPdfLibMs = performance.now() - coldPdfLibStart;

  // Chromium cold start (new pool = new browser instance)
  const coldChromiumStart = performance.now();
  const coldPool = await createPlaywrightRendererPool();
  await layOutBallotsAndCreateElectionDefinition(
    coldPool,
    vxDefaultBallotTemplate,
    [famousNamesProps[0]],
    'vxf'
  );
  await coldPool.close();
  const coldChromiumMs = performance.now() - coldChromiumStart;

  results.push({
    name: 'Cold start (1 ballot)',
    pdfLibMs: coldPdfLibMs,
    chromiumMs: coldChromiumMs,
    speedup: coldChromiumMs / coldPdfLibMs,
    pdfLibPages: 2,
    chromiumPages: 2,
  });

  // Print results
  console.log('\n=== Results ===\n');
  console.log('| Benchmark | pdf-lib | Chromium | Speedup |');
  console.log('|-----------|---------|----------|---------|');
  for (const r of results) {
    console.log(
      `| ${r.name.padEnd(35)} | ${r.pdfLibMs
        .toFixed(0)
        .padStart(6)}ms | ${r.chromiumMs.toFixed(0).padStart(7)}ms | ${r.speedup
        .toFixed(1)
        .padStart(5)}x |`
    );
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
