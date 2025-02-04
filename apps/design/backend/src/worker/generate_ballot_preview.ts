import { translateBallotStrings } from '@votingworks/backend';
import { find, ok, Result } from '@votingworks/basics';
import {
  BallotLayoutError,
  BallotMode,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  renderBallotPreviewToPdf,
} from '@votingworks/hmpb';
import {
  BallotStyleId,
  BallotType,
  Election,
  ElectionId,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { createBallotPropsForTemplate } from '../ballots';
import { WorkerContext } from './context';
import { getPdfFileName } from '../utils';

export async function generateBallotPreviewPdf(
  { workspace, translator }: WorkerContext,
  {
    electionId,
    precinctId,
    ballotStyleId,
    ballotType,
    ballotMode,
  }: {
    electionId: ElectionId;
    precinctId: string;
    ballotStyleId: BallotStyleId;
    ballotType: BallotType;
    ballotMode: BallotMode;
  }
): Promise<Result<{ pdfData: Buffer; fileName: string }, BallotLayoutError>> {
  const {
    election,
    ballotLanguageConfigs,
    precincts,
    ballotStyles,
    ballotTemplateId,
  } = await workspace.store.getElection(electionId);
  const ballotStrings = await translateBallotStrings(
    translator,
    election,
    hmpbStringsCatalog,
    ballotLanguageConfigs
  );
  const electionWithBallotStrings: Election = {
    ...election,
    ballotStrings,
  };
  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    electionWithBallotStrings,
    precincts,
    ballotStyles
  );
  const ballotProps = find(
    allBallotProps,
    (props) =>
      props.precinctId === precinctId &&
      props.ballotStyleId === ballotStyleId &&
      props.ballotType === ballotType &&
      props.ballotMode === ballotMode
  );
  const renderer = await createPlaywrightRenderer();
  let ballotPdf: Result<Buffer, BallotLayoutError>;
  try {
    ballotPdf = await renderBallotPreviewToPdf(
      renderer,
      ballotTemplates[ballotTemplateId],
      // NOTE: Changing this text means you should also change the font size
      // of the <Watermark> component in the ballot template.

      { ...ballotProps, watermark: 'PROOF' }
    );
  } finally {
    // eslint-disable-next-line no-console
    renderer.cleanup().catch(console.error);
  }
  if (ballotPdf.isErr()) return ballotPdf;

  const precinct = find(election.precincts, (p) => p.id === precinctId);
  return ok({
    pdfData: ballotPdf.ok(),
    fileName: `PROOF-${getPdfFileName(
      precinct.name,
      ballotStyleId,
      ballotType,
      ballotMode
    )}`,
  });
}
