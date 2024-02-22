import { writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { BallotType, safeParseElection } from '@votingworks/types';
import { renderBallotToPdf } from './render_ballot';
import { BallotProps, ballotPageTemplate, pageDimensions } from './template';
import { createPlaywrightRenderer } from './playwright_renderer';

const electionJson = readFileSync(
  '../../fixtures/data/electionGeneral/election.json'
).toString('utf-8');
const election = safeParseElection(electionJson).unsafeUnwrap();
const ballotStyle = election.ballotStyles[0];
const precinct = election.precincts[0];
const exampleBallotProps: BallotProps = {
  election,
  ballotStyle,
  precinct,
  ballotType: BallotType.Precinct,
  ballotMode: 'official',
};

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
  const t1 = Date.now();
  const renderer = await createPlaywrightRenderer();
  const ballotPdf = await renderBallotToPdf(
    renderer,
    ballotPageTemplate,
    exampleBallotProps,
    { pageDimensions }
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
