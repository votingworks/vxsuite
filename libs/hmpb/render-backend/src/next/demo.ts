import { writeFile } from 'fs/promises';
import { range } from '@votingworks/basics';
import { renderBallotToPdf } from './render_ballot';
import {
  MiniElection,
  ballotPageTemplate,
  pageDimensions,
  pageMargins,
} from './template';

/**
 * There are three layers to this rendering stack:
 * - A ballot template (template.tsx)
 * - A ballot rendering module (render_ballot.tsx)
 * - A document rendering module (renderer.tsx)
 *
 * The template defines the layout of the ballot. I imagine us making different
 * templates to customize the ballot for different customers.
 *
 * The ballot rendering module takes a template and its props and renders it to
 * PDF. It contains logic that would apply to any ballot, regardless of the
 * specific layout (e.g. pagination, extracting grid layouts, adding QR codes).
 *
 * The document rendering module is a thin wrapper around Playwright/headless
 * Chromium.
 *
 * I suggest starting by reading the renderBallotToPdf function that's called
 * below and branching out from there.
 */
async function main() {
  const election: MiniElection = {
    title: 'Mini Election',
    contests: range(0, 10).map((i) => ({
      title: `Contest ${i + 1}`,
      candidates: range(0, 5).map((j) => `Candidate ${i + 1}-${j + 1}`),
    })),
  };
  const t1 = Date.now();
  const ballotPdf = await renderBallotToPdf(
    ballotPageTemplate,
    { election },
    { pageDimensions, pageMargins }
  );
  const t2 = Date.now();
  const outputPath = 'ballot.pdf';
  await writeFile(outputPath, ballotPdf);
  // eslint-disable-next-line no-console
  console.log(`Rendered and saved ballot to ${outputPath} in ${t2 - t1}ms`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
