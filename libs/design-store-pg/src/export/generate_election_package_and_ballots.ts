import type {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import {
  type DesignFeaturesProvider,
  type EmitProgressFunction,
  type FileStorageClient,
  type GenerateElectionPackageAndBallotsPayload,
  type Jurisdiction,
  renderElectionPackageAndBallots,
  type TtsEditsStore,
} from '@votingworks/design-backend';
import type { ScratchDir } from '@votingworks/hmpb';
import type { ElectionId } from '@votingworks/types';
import type { BackgroundTaskStore } from '../background_task_store.js';
import type { ElectionStore } from '../election_store.js';

export interface ElectionPackageExportedEvent {
  electionId: ElectionId;
  electionPackageUrl: string;
  jurisdiction: Jurisdiction;
}

export interface ElectionPackageExportContext {
  fileStorageClient: FileStorageClient;
  speechSynthesizer: GoogleCloudSpeechSynthesizer;
  translator: GoogleCloudTranslator;
  elections: ElectionStore;
  tasks: BackgroundTaskStore;
  features: DesignFeaturesProvider;
  ttsEdits?: TtsEditsStore;
  rendererPoolSize?: number;
  onElectionPackageExported?: (
    event: ElectionPackageExportedEvent
  ) => Promise<void>;
}

export async function generateElectionPackageAndBallots(
  ctx: ElectionPackageExportContext,
  payload: GenerateElectionPackageAndBallotsPayload,
  emitProgress: EmitProgressFunction,
  scratchDir: ScratchDir
): Promise<void> {
  const { electionId } = payload;
  const electionRecord = await ctx.elections.getElection(electionId);
  const { compact } = await ctx.elections.getBallotLayoutSettings(electionId);
  const registeredVoterCounts =
    await ctx.elections.getRegisteredVoterCounts(electionId);
  const jurisdiction = await ctx.features.getJurisdiction(
    electionRecord.jurisdictionId
  );
  const ttsEdits = payload.shouldExportAudio
    ? await ctx.ttsEdits?.ttsEditsAll({
        jurisdictionId: electionRecord.jurisdictionId,
      })
    : undefined;

  const result = await renderElectionPackageAndBallots(
    ctx,
    {
      electionRecord,
      compact,
      registeredVoterCounts,
      jurisdiction,
      ttsEdits,
    },
    payload,
    emitProgress,
    scratchDir
  );

  await ctx.tasks.setElectionPackageExportInformation({
    electionId,
    ...result,
  });

  await ctx.onElectionPackageExported?.({
    electionId,
    electionPackageUrl: result.electionPackageUrl,
    jurisdiction,
  });
}
