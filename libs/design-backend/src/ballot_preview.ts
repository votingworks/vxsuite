import { find, ok, type Result } from '@votingworks/basics';
import {
  type GoogleCloudTranslator,
  translateBallotStrings,
} from '@votingworks/backend';
import {
  type BallotLayoutError,
  ballotTemplates,
  createPlaywrightRenderer,
  hmpbStringsCatalog,
  type NhStateBallotProps,
  type NhStateBallotVariant,
  renderBallotPreviewToPdf,
} from '@votingworks/hmpb';
import type {
  BallotMode,
  BallotStyleId,
  BallotType,
  Election,
  ElectionId,
} from '@votingworks/types';
import { createBallotPropsForTemplate } from './ballots.js';
import type { ElectionRecord } from './election_record.js';
import { getBallotPdfFileName } from './utils.js';

export interface BallotPreviewInput {
  electionId: ElectionId;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
  variant?: NhStateBallotVariant;
}

export type BallotPreviewResult = Result<
  { pdfData: Uint8Array; fileName: string },
  BallotLayoutError
>;

export async function renderBallotPreview({
  electionRecord,
  compact,
  translator,
  input,
}: {
  electionRecord: ElectionRecord;
  compact: boolean;
  translator: GoogleCloudTranslator;
  input: BallotPreviewInput;
}): Promise<BallotPreviewResult> {
  const {
    election,
    ballotLanguageConfigs,
    ballotTemplateId,
    candidateOrderings,
    systemSettings,
  } = electionRecord;
  const ballotStrings = await translateBallotStrings(
    translator,
    election,
    hmpbStringsCatalog,
    ballotLanguageConfigs,
    {
      shouldTransliterateCandidateNames:
        systemSettings.shouldTransliterateCandidateNames,
    }
  );
  const electionWithBallotStrings: Election = { ...election, ballotStrings };
  const allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    electionWithBallotStrings,
    compact
  );
  const ballotProps = find(
    allBallotProps,
    (props) =>
      props.precinctId === input.precinctId &&
      props.ballotStyle.id === input.ballotStyleId &&
      props.ballotType === input.ballotType &&
      props.ballotMode === input.ballotMode &&
      (ballotTemplateId === 'NhStateBallot'
        ? (props as NhStateBallotProps).variant === input.variant
        : true)
  );
  const renderer = await createPlaywrightRenderer();
  let ballotPdf: Result<Uint8Array, BallotLayoutError>;
  try {
    ballotPdf = await renderBallotPreviewToPdf(
      renderer,
      ballotTemplates[ballotTemplateId],
      candidateOrderings.get(ballotProps.ballotStyle),
      // NOTE: Changing this text means you should also change the font size
      // of the <Watermark> component in the ballot template.
      { ...ballotProps, watermark: 'PROOF' }
    );
  } finally {
    // eslint-disable-next-line no-console
    renderer.close().catch(console.error);
  }
  if (ballotPdf.isErr()) return ballotPdf;

  return ok({
    pdfData: ballotPdf.ok(),
    fileName: `PROOF-${getBallotPdfFileName(ballotProps)}`,
  });
}
