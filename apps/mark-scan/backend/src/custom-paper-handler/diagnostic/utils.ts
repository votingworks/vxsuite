import { readElection } from '@votingworks/fs';
import {
  ElectionDefinition,
  ElectionPackageFileName,
} from '@votingworks/types';
import { join } from 'path';
import { generateMockVotes } from '@votingworks/utils';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { iter, assert, assertDefined } from '@votingworks/basics';
import tmp from 'tmp';
import { Buffer } from 'buffer';
import { renderTestModeBallotWithoutLanguageContext } from '../../util/render_ballot';

export const DIAGNOSTIC_ELECTION_PATH = join(
  __dirname,
  ElectionPackageFileName.ELECTION
);

export function renderDiagnosticMockBallot(
  electionDefinition: ElectionDefinition
): Promise<Buffer> {
  const { election } = electionDefinition;
  return renderTestModeBallotWithoutLanguageContext(
    electionDefinition,
    election.precincts[0].id,
    election.ballotStyles[0].id,
    generateMockVotes(election)
  );
}

export async function getDiagnosticMockBallotImagePath(): Promise<string> {
  const electionDefinitionResult = await readElection(DIAGNOSTIC_ELECTION_PATH);
  const electionDefinition = electionDefinitionResult.unsafeUnwrap();

  const pdfData = await renderDiagnosticMockBallot(electionDefinition);

  const first = assertDefined(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 })).first()
  );
  assert(first.pageCount === 1);
  const file = tmp.fileSync({ postfix: '.jpg' });
  await writeImageData(file.name, first.page);
  return file.name;
}
