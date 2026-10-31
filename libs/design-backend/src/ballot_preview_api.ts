import { find, ok, type Result } from '@votingworks/basics';
import { translateBallotStrings } from '@votingworks/backend';
import type { GoogleCloudTranslator } from '@votingworks/backend';
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
import type { Store } from './store.js';
import { getBallotPdfFileName } from './utils.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildBallotPreviewMethods({
  store,
  translator,
}: {
  store: Store;
  translator: GoogleCloudTranslator;
}) {
  return {
    async getBallotPreviewPdf(input: {
      electionId: ElectionId;
      precinctId: string;
      ballotStyleId: BallotStyleId;
      ballotType: BallotType;
      ballotMode: BallotMode;
      variant?: NhStateBallotVariant;
    }): Promise<
      Result<{ pdfData: Uint8Array; fileName: string }, BallotLayoutError>
    > {
      const {
        election,
        ballotLanguageConfigs,
        ballotTemplateId,
        candidateOrderings,
      } = await store.getElection(input.electionId);
      const { compact } = await store.getBallotLayoutSettings(input.electionId);
      const systemSettings = await store.getSystemSettings(input.electionId);
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
      const electionWithBallotStrings: Election = {
        ...election,
        ballotStrings,
      };
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
    },
  } as const;
}
