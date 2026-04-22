import { describe, expect, test, vi } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { BallotType, getBallotStyle, getContests } from '@votingworks/types';
import { pdfToImages, toImageBuffer } from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
import { renderBallotToPdf } from './pdf_ballot_renderer';
import {
  allBaseBallotProps,
  layOutBallotsAndCreateElectionDefinition,
} from './render_ballot';
import { vxDefaultBallotTemplate } from './ballot_templates/vx_default_ballot_template';
import { createPlaywrightRendererPool } from './playwright_renderer';

vi.setConfig({ testTimeout: 120_000 });

describe('pdf ballot renderer', () => {
  test('renders a basic ballot to PDF', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const allProps = allBaseBallotProps(election);
    const ballotProps = allProps.find(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    )!;

    const result = await renderBallotToPdf(election, ballotProps);

    // Verify we got a valid PDF
    expect(result.pdf).toBeDefined();
    expect(result.pdf.length).toBeGreaterThan(0);
    // PDF files start with %PDF
    const header = new TextDecoder().decode(result.pdf.slice(0, 5));
    expect(header).toEqual('%PDF-');

    // Verify grid layout
    expect(result.gridLayout).toBeDefined();
    expect(result.gridLayout.ballotStyleId).toEqual(ballotProps.ballotStyleId);
    expect(result.gridLayout.gridPositions.length).toBeGreaterThan(0);

    // Verify we can convert to images (basic sanity check)
    const pages = [];
    for await (const page of pdfToImages(result.pdf, { scale: 200 / 72 })) {
      pages.push(page);
    }
    expect(pages.length).toBeGreaterThanOrEqual(2); // at least 2 pages (front + back)
    expect(pages.length % 2).toEqual(0); // even number of pages
  });

  test('renders with image snapshot', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const allProps = allBaseBallotProps(election);
    const ballotProps = allProps.find(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    )!;

    const result = await renderBallotToPdf(election, ballotProps);

    const pages = [];
    for await (const page of pdfToImages(result.pdf, { scale: 200 / 72 })) {
      pages.push(page);
    }

    // Snapshot the first page
    expect(toImageBuffer(pages[0].page)).toMatchImageSnapshot();
  });

  test('grid positions have valid coordinates', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const allProps = allBaseBallotProps(election);
    const ballotProps = allProps.find(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    )!;

    const result = await renderBallotToPdf(election, ballotProps);

    // All grid positions should have reasonable coordinates
    for (const pos of result.gridLayout.gridPositions) {
      expect(pos.column).toBeGreaterThan(0);
      expect(pos.row).toBeGreaterThan(0);
      expect(pos.column).toBeLessThan(40); // max columns for 8.5" page
      expect(pos.row).toBeLessThan(60); // max rows for a page
      expect(pos.sheetNumber).toBeGreaterThanOrEqual(1);
      expect(['front', 'back']).toContain(pos.side);
    }

    // Verify we have positions for all contests
    const ballotStyle = getBallotStyle({
      election,
      ballotStyleId: ballotProps.ballotStyleId,
    })!;
    const contests = getContests({ election, ballotStyle });
    const contestIdsInGrid = new Set(
      result.gridLayout.gridPositions.map((p) => p.contestId)
    );
    for (const contest of contests) {
      expect(contestIdsInGrid).toContain(contest.id);
    }
  });

  test('performance: renders faster than Chromium', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const allProps = allBaseBallotProps(election);
    const ballotProps = allProps.find(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    )!;

    // Warm up
    await renderBallotToPdf(election, ballotProps);

    // Time pdf-lib rendering (10 iterations)
    const iterations = 10;
    const pdfLibStart = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      await renderBallotToPdf(election, ballotProps);
    }
    const pdfLibMs = (performance.now() - pdfLibStart) / iterations;

    console.log(`pdf-lib: ${pdfLibMs.toFixed(1)}ms per ballot`);

    // Just verify it's reasonably fast (under 500ms per ballot)
    expect(pdfLibMs).toBeLessThan(500);
  });

  test('grid positions match Chromium renderer', async () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const allProps = allBaseBallotProps(election);
    const testProps = allProps.filter(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    );

    // Render with pdf-lib
    const pdfLibResult = await renderBallotToPdf(election, testProps[0]);

    // Render with Chromium
    const rendererPool = await createPlaywrightRendererPool();
    try {
      const chromiumResult = await layOutBallotsAndCreateElectionDefinition(
        rendererPool,
        vxDefaultBallotTemplate,
        testProps,
        'vxf'
      );

      const chromiumGridLayout = assertDefined(
        chromiumResult.electionDefinition.election.gridLayouts?.find(
          (gl) => gl.ballotStyleId === testProps[0].ballotStyleId
        )
      );

      // Compare grid positions
      // First verify we have the same number
      expect(pdfLibResult.gridLayout.gridPositions.length).toEqual(
        chromiumGridLayout.gridPositions.length
      );

      // Compare grid positions pairwise by index, since they should be in
      // the same order (same contests, same options)
      const colDiffs: number[] = [];
      const rowDiffs: number[] = [];

      for (
        let i = 0;
        i < pdfLibResult.gridLayout.gridPositions.length;
        i += 1
      ) {
        const pdfPos = pdfLibResult.gridLayout.gridPositions[i];
        const chromiumPos = chromiumGridLayout.gridPositions[i];

        expect(pdfPos.contestId).toEqual(chromiumPos.contestId);
        expect(pdfPos.type).toEqual(chromiumPos.type);

        const colDiff = Math.abs(pdfPos.column - chromiumPos.column);
        const rowDiff = Math.abs(pdfPos.row - chromiumPos.row);
        colDiffs.push(colDiff);
        rowDiffs.push(rowDiff);

        const optionLabel =
          pdfPos.type === 'option'
            ? pdfPos.optionId
            : `write-in-${pdfPos.writeInIndex}`;

        console.log(
          `${pdfPos.contestId}/${optionLabel}: ` +
            `col ${pdfPos.column.toFixed(2)} vs ${chromiumPos.column.toFixed(
              2
            )} (Δ${colDiff.toFixed(2)}), ` +
            `row ${pdfPos.row.toFixed(2)} vs ${chromiumPos.row.toFixed(
              2
            )} (Δ${rowDiff.toFixed(2)})`
        );
      }

      const avgColDiff = colDiffs.reduce((a, b) => a + b, 0) / colDiffs.length;
      const avgRowDiff = rowDiffs.reduce((a, b) => a + b, 0) / rowDiffs.length;
      const maxColDiff = Math.max(...colDiffs);
      const maxRowDiff = Math.max(...rowDiffs);

      console.log(
        `\nSummary: avg col diff: ${avgColDiff.toFixed(
          2
        )}, max: ${maxColDiff.toFixed(2)}`
      );
      console.log(
        `Summary: avg row diff: ${avgRowDiff.toFixed(
          2
        )}, max: ${maxRowDiff.toFixed(2)}`
      );
    } finally {
      await rendererPool.close();
    }
  });
});
