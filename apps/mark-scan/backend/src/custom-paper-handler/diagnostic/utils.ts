import { readElection } from '@votingworks/fs';
import {
  ElectionDefinition,
  ElectionPackageFileName,
  SimpleRenderer,
} from '@votingworks/types';
import { join } from 'node:path';
import { generateMockVotes } from '@votingworks/utils';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { iter, assert, assertDefined } from '@votingworks/basics';
import tmp from 'tmp';
import { Buffer } from 'node:buffer';
import { createSimpleRenderer } from '@votingworks/printing';
import { renderTestModeBallotWithoutLanguageContext } from '../../util/render_ballot';

export const DIAGNOSTIC_ELECTION_PATH = join(
  __dirname,
  ElectionPackageFileName.ELECTION
);

export function renderDiagnosticMockBallot(
  renderer: SimpleRenderer,
  electionDefinition: ElectionDefinition
): Promise<Buffer> {
  const { election } = electionDefinition;
  return renderTestModeBallotWithoutLanguageContext(
    renderer,
    electionDefinition,
    election.precincts[0].id,
    election.ballotStyles[0].id,
    generateMockVotes(election)
  );
}

/**
 * This function is for testing only, such as mocking the driver scanAndSave response
 * during the scanning state of the paper handler diagnostic.
 * It renders a mock ballot for the paper handler diagnostic election as an image,
 * saves it to a tmp dir, and returns the filepath.
 */
export async function getDiagnosticMockBallotImagePath(): Promise<string> {
  const electionDefinitionResult = await readElection(DIAGNOSTIC_ELECTION_PATH);
  const electionDefinition = electionDefinitionResult.unsafeUnwrap();
  const renderer = await createSimpleRenderer();

  const pdfData = await renderDiagnosticMockBallot(
    renderer,
    electionDefinition
  );

  const first = assertDefined(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 })).first()
  );
  assert(first.pageCount === 1);
  const file = tmp.fileSync({ postfix: '.jpg' });
  await writeImageData(file.name, first.page);
  await renderer.cleanup();
  return file.name;
}
