import { readElection } from '@votingworks/fs';
import {
  type ElectionDefinition,
  type GrayImageData,
  ElectionPackageFileName,
  NO_CANDIDATE_ORDERINGS,
} from '@votingworks/types';
import { join } from 'node:path';
import { generateMockVotes } from '@votingworks/utils';
import { toGrayScale } from '@votingworks/image-utils';
import { pdfToImages } from '@votingworks/image-utils/pdf';
import { iter, assert, assertDefined } from '@votingworks/basics';

import { renderTestModeBallotWithoutLanguageContext } from '../../util/render_ballot.js';

export const DIAGNOSTIC_ELECTION_PATH = join(
  import.meta.dirname,
  ElectionPackageFileName.ELECTION
);

export function renderDiagnosticMockBallot(
  electionDefinition: ElectionDefinition
): Promise<Uint8Array> {
  const { election } = electionDefinition;
  return renderTestModeBallotWithoutLanguageContext(
    electionDefinition,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    election.precincts[0]!.id,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    election.ballotStyles[0]!,
    NO_CANDIDATE_ORDERINGS,
    generateMockVotes(election)
  );
}

/**
 * Renders a mock ballot for the paper handler diagnostic election as an image,
 * for use in tests.
 */
export async function getDiagnosticMockBallotImage(): Promise<GrayImageData> {
  const electionDefinitionResult = await readElection(DIAGNOSTIC_ELECTION_PATH);
  const electionDefinition = electionDefinitionResult.unsafeUnwrap();

  const pdfData = await renderDiagnosticMockBallot(electionDefinition);

  const first = assertDefined(
    await iter(pdfToImages(pdfData, { scale: 200 / 72 })).first()
  );
  assert(first.pageCount === 1);
  const { data, width, height } = first.page;
  return toGrayScale(data, width, height);
}
