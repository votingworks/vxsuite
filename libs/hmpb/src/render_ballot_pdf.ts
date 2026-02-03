/* eslint-disable no-console */
import { readElection } from '@votingworks/fs';
import { writeFile } from 'node:fs/promises';
import { BallotType } from '@votingworks/types';
import { createPlaywrightRenderer } from './playwright_renderer';
import { BallotTemplateId, ballotTemplates } from './ballot_templates';
import { renderBallotPreviewToPdf } from './render_ballot';

const USAGE = `Usage: render-ballot-pdf <ballot-template-id> <election-path> <output-pdf-path>`;

export async function main(args: string[]): Promise<number> {
  if (args.length !== 3) {
    console.error(USAGE);
    return 1;
  }
  const [ballotTemplateId, electionPath, outputPdfPath] = args;

  const { election } = (await readElection(electionPath)).unsafeUnwrap();

  const ballotTemplate = ballotTemplates[ballotTemplateId as BallotTemplateId];
  if (!ballotTemplate) {
    console.error(`Unknown ballot template ID: ${ballotTemplateId}`);
    return 1;
  }

  const renderer = await createPlaywrightRenderer();
  try {
    const pdfBytes = (
      await renderBallotPreviewToPdf(renderer, ballotTemplate, {
        election,
        ballotMode: 'official',
        ballotType: BallotType.Precinct,
        ballotStyleId: election.ballotStyles[0].id,
        precinctId: election.ballotStyles[0].precincts[0],
      })
    ).unsafeUnwrap();
    await writeFile(outputPdfPath, pdfBytes);
  } catch (error) {
    console.error(`Error rendering ballot PDF: ${error}`);
    return 1;
  }
  await renderer.close();

  return 0;
}
