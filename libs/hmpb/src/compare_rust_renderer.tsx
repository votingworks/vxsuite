import React from 'react';
import { readElectionGeneral } from '@votingworks/fixtures';
import {
  BaseBallotProps,
  BallotStyleId,
  BallotType,
  getBallotStyle,
  getContests,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertDefined, iter } from '@votingworks/basics';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { createRustRenderer, createRustRendererPool } from './rust_renderer';
import { createPlaywrightRenderer } from './playwright_renderer';
import { Renderer } from './renderer';
import { CONTENT_SLOT_CLASS, PAGE_CLASS } from './ballot_components';
import {
  layOutBallotsAndCreateElectionDefinition,
  renderBallotPdfWithMetadataQrCode,
} from './render_ballot';
import { createTestVotes, markBallotDocument } from './mark_ballot';

const OUTPUT_DIR = join(__dirname, '../rust-output');
const FIXTURES_DIR = join(__dirname, '../fixtures/vx-general-election/letter');

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

  // Dump HTML for analysis
  const html = await document.getContent();
  if (label === 'Rust') {
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(join(__dirname, '../rust-output/diagnostic.html'), html);
    console.log(`${label} HTML dumped to rust-output/diagnostic.html`);
  }

  await document.close();
}

async function generateBallotComparison(): Promise<void> {
  const rendererPool = await createRustRendererPool();

  const electionGeneral = readElectionGeneral();
  const election = {
    ...electionGeneral,
    ballotLayout: {
      ...electionGeneral.ballotLayout,
      paperSize: HmpbBallotPaperSize.Letter,
    },
  } as const;

  const targetBallotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId: '5' as BallotStyleId })
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

  console.log('\n--- Generating ballots with Rust renderer ---');
  const { electionDefinition, ballotContents } =
    await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      vxDefaultBallotTemplate,
      allBallotProps,
      'vxf'
    );

  const ballotStyle = targetBallotStyle;
  const precinctId = assertDefined(ballotStyle.precincts[0]);
  const contests = getContests({ election, ballotStyle });
  const { votes, unmarkedWriteIns } = createTestVotes(contests);

  const [blankBallotContents, ballotProps] = assertDefined(
    iter(ballotContents)
      .zip(allBallotProps)
      .find(
        ([, props]) =>
          props.ballotStyleId === ballotStyle.id &&
          props.precinctId === precinctId
      )
  );

  const { blankBallotPdf, markedBallotPdf } = await rendererPool.runTask(
    async (renderer) => {
      const ballotDocument =
        await renderer.loadDocumentFromContent(blankBallotContents);
      const blank = await renderBallotPdfWithMetadataQrCode(
        ballotProps,
        ballotDocument,
        electionDefinition
      );

      await markBallotDocument(ballotDocument, votes, unmarkedWriteIns);
      const marked = await ballotDocument.renderToPdf();

      return { blankBallotPdf: blank, markedBallotPdf: marked };
    }
  );

  await mkdir(OUTPUT_DIR, { recursive: true });
  const blankPath = join(OUTPUT_DIR, 'blank-ballot.pdf');
  const markedPath = join(OUTPUT_DIR, 'marked-ballot.pdf');
  await writeFile(blankPath, blankBallotPdf);
  await writeFile(markedPath, markedBallotPdf);

  console.log(`Rust blank ballot: ${blankPath}`);
  console.log(`Rust marked ballot: ${markedPath}`);
  console.log(`Chromium reference: ${join(FIXTURES_DIR, 'blank-ballot.pdf')}`);

  await rendererPool.close();
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

  // Step 2: Generate ballot PDF
  console.log('\n=== Step 2: Generate ballot ===');
  try {
    await generateBallotComparison();
  } catch (e) {
    console.error('Ballot generation failed:', e);
    return 1;
  }

  console.log('\nDone!');
  return 0;
}
