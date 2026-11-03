import type { GoogleCloudTranslator } from '@votingworks/backend';
import {
  type BallotPreviewInput,
  type BallotPreviewResult,
  renderBallotPreview,
} from '@votingworks/design-backend';
import type { ElectionStore } from './election_store.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildBallotPreviewMethods({
  store,
  translator,
}: {
  store: ElectionStore;
  translator: GoogleCloudTranslator;
}) {
  return {
    async getBallotPreviewPdf(
      input: BallotPreviewInput
    ): Promise<BallotPreviewResult> {
      const electionRecord = await store.getElection(input.electionId);
      const { compact } = await store.getBallotLayoutSettings(input.electionId);
      return renderBallotPreview({
        electionRecord,
        compact,
        translator,
        input,
      });
    },
  } as const;
}
