import React from 'react';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BaseBallotProps,
  BallotStyleId,
  BallotType,
  getBallotStyle,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDefined, iter } from '@votingworks/basics';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { createRustRenderer, createRustRendererPool } from './rust_renderer';
import {
  createPlaywrightRenderer,
  createPlaywrightRendererPool,
} from './playwright_renderer';
import { Renderer } from './renderer';
import { CONTENT_SLOT_CLASS, PAGE_CLASS } from './ballot_components';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';

const OUTPUT_DIR = join(__dirname, '../rust-output');

async function measureContentSlot(
  label: string,
  renderer: Renderer
): Promise<void> {
  const electionGeneral = readElectionGeneral();
  const election = {
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
  } as const;

  const props = {
    election,
    ballotStyleId: '5' as BallotStyleId,
    precinctId: assertDefined(
      getBallotStyle({ election, ballotStyleId: '5' as BallotStyleId })
    ).precincts[0],
    ballotType: BallotType.Absentee as const,
    ballotMode: 'official' as const,
  } as const;

  const scratchpad = await renderer.createScratchpad(
    vxDefaultBallotTemplate.stylesComponent(props)
  );

  const frameResult = vxDefaultBallotTemplate.frameComponent({
    ...props,
    pageNumber: 1,
    children: <div className={CONTENT_SLOT_CLASS} />,
  });

  const measurements = await scratchpad.measureElements(
    frameResult.unsafeUnwrap(),
    `.${CONTENT_SLOT_CLASS}`
  );
  console.log(`${label} content slot:`, measurements);

  // Also measure the page itself
  const document = scratchpad.convertToDocument();
  const pages = await document.inspectElements(`.${PAGE_CLASS}`);
  console.log(`${label} page:`, pages);

  // Inspect header/instructions elements by styled-component classes
  for (const sel of ['.sc-dOvA-dm', '.sc-eSfNbN', 'svg', 'img']) {
    const els = await document.inspectElements(sel);
    if (els.length > 0) {
      console.log(
        `${label} ${sel}:`,
        els.map((e) => ({
          x: e.x.toFixed(1),
          y: e.y.toFixed(1),
          w: e.width.toFixed(1),
          h: e.height.toFixed(1),
        }))
      );
    }
  }

  // Dump HTML content for debugging
  const content = await document.getContent();
  const { writeFile: writeFileAsync } = await import('node:fs/promises');
  await writeFileAsync(
    `/tmp/claude-1001/${label.toLowerCase()}-frame.html`,
    content
  );
  console.log(
    `${label} HTML dumped to /tmp/claude-1001/${label.toLowerCase()}-frame.html`
  );

  await document.close();
}

const BALLOT_STYLE_IDS: BallotStyleId[] = [
  '5' as BallotStyleId,
  '12' as BallotStyleId,
];

interface TimingResult {
  ballotStyleId: string;
  renderer: string;
  layoutMs: number;
  renderMs: number;
}

async function generateBallotComparison(): Promise<void> {
  const electionGeneral = readElectionGeneral();
  const election = {
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
  } as const;

  await mkdir(OUTPUT_DIR, { recursive: true });

  const timings: TimingResult[] = [];

  for (const ballotStyleId of BALLOT_STYLE_IDS) {
    const targetBallotStyle = assertDefined(
      getBallotStyle({ election, ballotStyleId })
    );
    const allBallotProps: BaseBallotProps[] = targetBallotStyle.precincts.map(
      (precinctId): BaseBallotProps => ({
        election,
        ballotStyleId: targetBallotStyle.id,
        precinctId,
        ballotType: BallotType.Absentee,
        ballotMode: 'official',
      })
    );

    const precinctId = assertDefined(targetBallotStyle.precincts[0]);

    // --- Rust renderer ---
    console.log(`\n--- Ballot style ${ballotStyleId}: Rust renderer ---`);
    const rustPool = await createRustRendererPool();

    const rustLayoutStart = performance.now();
    const { electionDefinition, ballotContents } =
      await layOutBallotsAndCreateElectionDefinition(
        rustPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );
    const rustLayoutMs = performance.now() - rustLayoutStart;

    const [blankBallotContents, ballotProps] = assertDefined(
      iter(ballotContents)
        .zip(allBallotProps)
        .find(
          ([, props]) =>
            props.ballotStyleId === targetBallotStyle.id &&
            props.precinctId === precinctId
        )
    );

    const rustRenderStart = performance.now();
    const rustBlankPdf = await rustPool.runTask(async (renderer) => {
      const ballotDocument =
        await renderer.loadDocumentFromContent(blankBallotContents);
      return renderBallotPdfWithMetadataQrCode(
        ballotProps,
        ballotDocument,
        electionDefinition
      );
    });
    const rustRenderMs = performance.now() - rustRenderStart;

    timings.push({
      ballotStyleId: String(ballotStyleId),
      renderer: 'Rust',
      layoutMs: rustLayoutMs,
      renderMs: rustRenderMs,
    });

    const rustPath = join(OUTPUT_DIR, `style-${ballotStyleId}-rust-blank.pdf`);
    await writeFile(rustPath, rustBlankPdf);
    console.log(`  Layout: ${rustLayoutMs.toFixed(0)}ms`);
    console.log(`  Render: ${rustRenderMs.toFixed(0)}ms`);
    console.log(`  Output: ${rustPath}`);

    await rustPool.close();

    // --- Chromium renderer ---
    console.log(`\n--- Ballot style ${ballotStyleId}: Chromium renderer ---`);
    const chromiumPool = await createPlaywrightRendererPool();

    const chromiumLayoutStart = performance.now();
    const { electionDefinition: chromiumEd, ballotContents: chromiumContents } =
      await layOutBallotsAndCreateElectionDefinition(
        chromiumPool,
        vxDefaultBallotTemplate,
        allBallotProps,
        'vxf'
      );
    const chromiumLayoutMs = performance.now() - chromiumLayoutStart;

    const [chromiumBlankContents, chromiumBallotProps] = assertDefined(
      iter(chromiumContents)
        .zip(allBallotProps)
        .find(
          ([, props]) =>
            props.ballotStyleId === targetBallotStyle.id &&
            props.precinctId === precinctId
        )
    );

    const chromiumRenderStart = performance.now();
    const chromiumBlankPdf = await chromiumPool.runTask(async (renderer) => {
      const ballotDocument = await renderer.loadDocumentFromContent(
        chromiumBlankContents
      );
      return renderBallotPdfWithMetadataQrCode(
        chromiumBallotProps,
        ballotDocument,
        chromiumEd
      );
    });
    const chromiumRenderMs = performance.now() - chromiumRenderStart;

    timings.push({
      ballotStyleId: String(ballotStyleId),
      renderer: 'Chromium',
      layoutMs: chromiumLayoutMs,
      renderMs: chromiumRenderMs,
    });

    const chromiumPath = join(
      OUTPUT_DIR,
      `style-${ballotStyleId}-chromium-blank.pdf`
    );
    await writeFile(chromiumPath, chromiumBlankPdf);
    console.log(`  Layout: ${chromiumLayoutMs.toFixed(0)}ms`);
    console.log(`  Render: ${chromiumRenderMs.toFixed(0)}ms`);
    console.log(`  Output: ${chromiumPath}`);

    await chromiumPool.close();
  }

  // Print timing summary
  console.log('\n=== Timing Summary ===');
  console.log('Style | Renderer | Layout (ms) | Render (ms) | Total (ms)');
  console.log('------|----------|-------------|-------------|----------');
  for (const t of timings) {
    const total = t.layoutMs + t.renderMs;
    console.log(
      `${t.ballotStyleId.padEnd(5)} | ${t.renderer.padEnd(8)} | ${t.layoutMs
        .toFixed(0)
        .padStart(11)} | ${t.renderMs.toFixed(0).padStart(11)} | ${total
        .toFixed(0)
        .padStart(9)}`
    );
  }
}

export async function main(): Promise<number> {
  // Step 1: Diagnostic measurements
  console.log('=== Step 1: Diagnostic measurements ===\n');

  const rustRenderer = await createRustRenderer();
  await measureContentSlot('Rust', rustRenderer);
  await rustRenderer.close();

  const playwrightRenderer = await createPlaywrightRenderer();
  await measureContentSlot('Chromium', playwrightRenderer);
  await playwrightRenderer.close();

  // Step 2: Generate ballot PDFs for all styles with timing
  console.log(
    '\n=== Step 2: Generate ballots (styles: %s) ===',
    BALLOT_STYLE_IDS.join(', ')
  );
  try {
    await generateBallotComparison();
  } catch (e) {
    console.error('Ballot generation failed:', e);
    return 1;
  }

  console.log('\nDone!');
  return 0;
}
