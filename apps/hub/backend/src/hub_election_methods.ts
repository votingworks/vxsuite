import { ok, type Result, wrapException } from '@votingworks/basics';
import {
  type ConvertMsElection,
  createBlankElection,
  defaultBallotTemplate,
  defaultSystemSettings,
  type DesignFeaturesProvider,
  type ElectionUpload,
  getStateFeaturesConfig,
  type Jurisdiction,
  prepareLoadedElection,
  regenerateElectionIds,
} from '@votingworks/design-backend';
import type { BallotTemplateId } from '@votingworks/hmpb';
import {
  type Election,
  type ElectionId,
  type HmpbBallotPaperSize,
  HmpbBallotPaperSizeSchema,
  type SystemSettings,
  SystemSettingsSchema,
  unsafeParse,
} from '@votingworks/types';
import type { ElectionStore } from './design_store/election_store.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildHubElectionMethods({
  store,
  features,
  convertMsElection,
}: {
  store: ElectionStore;
  features: DesignFeaturesProvider;
  convertMsElection?: ConvertMsElection;
}) {
  return {
    async loadElection(input: {
      upload: ElectionUpload;
      newId: ElectionId;
      jurisdictionId: string;
    }): Promise<Result<ElectionId, Error>> {
      const jurisdiction = await features.getJurisdiction(input.jurisdictionId);
      const stateFeatures = getStateFeaturesConfig(jurisdiction);
      try {
        const { election, isMiCombinedBallotPrimary } = prepareLoadedElection({
          upload: input.upload,
          newId: input.newId,
          stateFeatures,
          convertMsElection,
        });
        await store.createElection({
          jurisdictionId: jurisdiction.id,
          stateFeatures,
          election,
          isMiCombinedBallotPrimary,
          ballotTemplateId: defaultBallotTemplate(jurisdiction),
          externalSource:
            input.upload.format === 'ms-sems' ? 'ms-sems' : undefined,
          systemSettings: defaultSystemSettings(jurisdiction),
        });
        return ok(election.id);
      } catch (error) {
        return wrapException(error);
      }
    },

    async createElection(input: {
      id: ElectionId;
      jurisdictionId: string;
    }): Promise<Result<ElectionId, Error>> {
      const jurisdiction = await features.getJurisdiction(input.jurisdictionId);
      const election = createBlankElection(input.id, jurisdiction);
      await store.createElection({
        jurisdictionId: jurisdiction.id,
        stateFeatures: getStateFeaturesConfig(jurisdiction),
        election,
        isMiCombinedBallotPrimary: false,
        ballotTemplateId: defaultBallotTemplate(jurisdiction),
        systemSettings: defaultSystemSettings(jurisdiction),
      });
      return ok(election.id);
    },

    async updateBallotLayoutSettings(input: {
      electionId: ElectionId;
      paperSize: HmpbBallotPaperSize;
      compact: boolean;
    }): Promise<void> {
      await store.updateBallotLayoutSettings(
        input.electionId,
        unsafeParse(HmpbBallotPaperSizeSchema, input.paperSize),
        input.compact
      );
    },

    async getSystemSettings(input: {
      electionId: ElectionId;
    }): Promise<SystemSettings> {
      return store.getSystemSettings(input.electionId);
    },

    async updateSystemSettings(input: {
      electionId: ElectionId;
      systemSettings: SystemSettings;
    }): Promise<void> {
      await store.updateSystemSettings(
        input.electionId,
        unsafeParse(SystemSettingsSchema, input.systemSettings)
      );
    },

    async getBallotsFinalizedAt(input: {
      electionId: ElectionId;
    }): Promise<Date | null> {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    async isElectionEditable(input: {
      electionId: ElectionId;
    }): Promise<boolean> {
      return !(await store.getBallotsFinalizedAt(input.electionId));
    },

    async deleteElection(input: { electionId: ElectionId }): Promise<void> {
      await store.deleteElection(input.electionId);
    },

    async setBallotTemplate(input: {
      electionId: ElectionId;
      ballotTemplateId: BallotTemplateId;
    }): Promise<void> {
      await store.setBallotTemplate(input.electionId, input.ballotTemplateId);
    },
  } as const;
}

export async function cloneElection(
  store: ElectionStore,
  {
    sourceElectionId,
    destElectionId,
    destJurisdiction,
  }: {
    sourceElectionId: ElectionId;
    destElectionId: ElectionId;
    destJurisdiction: Jurisdiction;
  }
): Promise<void> {
  const {
    election: sourceElection,
    isMiCombinedBallotPrimary,
    ballotTemplateId,
  } = await store.getElection(sourceElectionId);
  const stateFeatures = getStateFeaturesConfig(destJurisdiction);
  const { districts, precincts, parties, contests, pollingPlaces } =
    regenerateElectionIds(sourceElection, stateFeatures);
  const election: Election = {
    ...sourceElection,
    id: destElectionId,
    districts,
    precincts,
    parties,
    contests,
    pollingPlaces,
  };
  await store.createElection({
    jurisdictionId: destJurisdiction.id,
    stateFeatures,
    election,
    isMiCombinedBallotPrimary,
    ballotTemplateId,
    systemSettings: defaultSystemSettings(destJurisdiction),
  });
}
