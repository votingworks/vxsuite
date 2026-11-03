import {
  DateWithoutTime,
  ok,
  type Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  type BallotStyle,
  type Contest,
  ContestSchema,
  type District,
  type Election,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  HmpbBallotPaperSize,
  HmpbBallotPaperSizeSchema,
  isCombinedBallotPrimary,
  type Party,
  type PollingPlace,
  PollingPlaceSchema,
  type Precinct,
  type PrecinctId,
  type PrecinctRegisteredVoterCountEntry,
  PrecinctRegisteredVoterCountEntrySchema,
  PrecinctSchema,
  safeParseElectionAnyVersion,
  type SystemSettings,
  SystemSettingsSchema,
  getAllBallotLanguages,
  unsafeParse,
} from '@votingworks/types';
import type { BallotTemplateId } from '@votingworks/hmpb';
import {
  type ConvertMsElection,
  createBlankElection,
  defaultBallotTemplate,
  defaultSystemSettings,
  type DesignFeaturesProvider,
  type DuplicateContestError,
  type DuplicateDistrictError,
  type DuplicateElectionError,
  type DuplicatePartyError,
  type DuplicatePrecinctError,
  type ElectionInfo,
  type ElectionInfoUpdate,
  ElectionInfoUpdateSchema,
  type ElectionUpload,
  getStateFeaturesConfig,
  type Jurisdiction,
  prepareLoadedElection,
  regenerateElectionIds,
  type SetPollingPlaceError,
  type StateFeaturesConfig,
} from '@votingworks/design-backend';
import type { ElectionStore } from './election_store.js';

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
    stateFeatures: getStateFeaturesConfig(destJurisdiction),
    election,
    isMiCombinedBallotPrimary,
    ballotTemplateId,
    systemSettings: defaultSystemSettings(destJurisdiction),
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildElectionDefinitionMethods({
  store,
  features,
  convertMsElection,
}: {
  store: ElectionStore;
  features: DesignFeaturesProvider;
  convertMsElection?: ConvertMsElection;
}) {
  const methods = {
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
          stateFeatures: getStateFeaturesConfig(jurisdiction),
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

    async getElectionInfo(input: {
      electionId: ElectionId;
    }): Promise<ElectionInfo> {
      const {
        election,
        isMiCombinedBallotPrimary,
        ballotLanguageConfigs,
        jurisdictionId,
        externalSource,
      } = await store.getElection(input.electionId);
      return {
        jurisdictionId,
        electionId: election.id,
        title: election.title,
        date: election.date,
        type: election.type,
        isMiCombinedBallotPrimary,
        state: election.state,
        jurisdictionName: election.jurisdiction.name,
        seal: election.seal,
        signatureImage: election.signature?.image,
        signatureCaption: election.signature?.caption,
        // Not optimal: store.getElection converts from LanguageCode[] to BallotLanguageConfig.
        // This line converts from BallotLanguageConfig to LanguageCode[]
        languageCodes: getAllBallotLanguages(ballotLanguageConfigs),
        externalSource,
      };
    },

    async updateElectionInfo(
      input: ElectionInfoUpdate
    ): Promise<Result<void, DuplicateElectionError>> {
      const electionInfoUpdate = unsafeParse(ElectionInfoUpdateSchema, input);
      return store.updateElectionInfo(electionInfoUpdate);
    },

    async listDistricts(input: {
      electionId: ElectionId;
    }): Promise<readonly District[]> {
      return store.listDistricts(input.electionId);
    },

    async updateDistricts(input: {
      electionId: ElectionId;
      deletedDistrictIds?: string[];
      newDistricts?: District[];
      updatedDistricts?: District[];
    }): Promise<Result<void, DuplicateDistrictError>> {
      return store.updateDistricts(input);
    },

    async listPrecincts(input: {
      electionId: ElectionId;
    }): Promise<readonly Precinct[]> {
      return store.listPrecincts(input.electionId);
    },

    async createPrecinct(input: {
      electionId: ElectionId;
      newPrecinct: Precinct;
      registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
    }): Promise<Result<void, DuplicatePrecinctError>> {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      const registeredVoterCounts =
        input.registeredVoterCounts !== undefined
          ? unsafeParse(
              PrecinctRegisteredVoterCountEntrySchema,
              input.registeredVoterCounts
            )
          : undefined;
      const result = await store.createPrecinct(input.electionId, precinct);
      if (result.isErr()) {
        return result;
      }
      await store.setPrecinctRegisteredVoterCounts(
        precinct,
        registeredVoterCounts
      );
      return ok();
    },

    async updatePrecinct(input: {
      electionId: ElectionId;
      updatedPrecinct: Precinct;
      registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
    }): Promise<Result<void, DuplicatePrecinctError>> {
      const precinct = unsafeParse(PrecinctSchema, input.updatedPrecinct);
      const registeredVoterCounts =
        input.registeredVoterCounts !== undefined
          ? unsafeParse(
              PrecinctRegisteredVoterCountEntrySchema,
              input.registeredVoterCounts
            )
          : undefined;
      const result = await store.updatePrecinct(input.electionId, precinct);
      if (result.isErr()) {
        return result;
      }
      await store.setPrecinctRegisteredVoterCounts(
        precinct,
        registeredVoterCounts
      );
      return ok();
    },

    async getRegisteredVoterCounts(input: {
      electionId: ElectionId;
    }): Promise<ElectionRegisteredVoterCounts> {
      return store.getRegisteredVoterCounts(input.electionId);
    },

    async deletePrecinct(input: {
      electionId: ElectionId;
      precinctId: PrecinctId;
    }): Promise<void> {
      await store.deletePrecinct(input.electionId, input.precinctId);
    },

    async listBallotStyles(input: {
      electionId: ElectionId;
    }): Promise<readonly BallotStyle[]> {
      return store.listBallotStyles(input.electionId);
    },

    async listParties(input: {
      electionId: ElectionId;
    }): Promise<readonly Party[]> {
      return store.listParties(input.electionId);
    },

    async updateParties(input: {
      electionId: ElectionId;
      deletedPartyIds?: string[];
      newParties?: Party[];
      updatedParties?: Party[];
    }): Promise<Result<void, DuplicatePartyError>> {
      return store.updateParties(input);
    },

    async listContests(input: {
      electionId: ElectionId;
    }): Promise<readonly Contest[]> {
      return store.listContests(input.electionId);
    },

    async createContest(input: {
      electionId: ElectionId;
      newContest: Contest;
    }): Promise<Result<void, DuplicateContestError>> {
      const contest = unsafeParse(ContestSchema, input.newContest);
      return store.createContest(input.electionId, contest);
    },

    async updateContest(input: {
      electionId: ElectionId;
      updatedContest: Contest;
    }): Promise<Result<void, DuplicateContestError>> {
      const contest = unsafeParse(ContestSchema, input.updatedContest);
      return store.updateContest(input.electionId, contest);
    },

    async reorderContests(input: {
      electionId: ElectionId;
      contestIds: string[];
    }): Promise<void> {
      await store.reorderContests(input.electionId, input.contestIds);
    },

    async deleteContest(input: {
      electionId: ElectionId;
      contestId: string;
    }): Promise<void> {
      await store.deleteContest(input.electionId, input.contestId);
    },

    async getBallotLayoutSettings(input: {
      electionId: ElectionId;
    }): Promise<{ paperSize: HmpbBallotPaperSize; compact: boolean }> {
      return store.getBallotLayoutSettings(input.electionId);
    },

    async updateBallotLayoutSettings(input: {
      electionId: ElectionId;
      paperSize: HmpbBallotPaperSize;
      compact: boolean;
    }): Promise<void> {
      const paperSize = unsafeParse(HmpbBallotPaperSizeSchema, input.paperSize);
      await store.updateBallotLayoutSettings(
        input.electionId,
        paperSize,
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
      const systemSettings = unsafeParse(
        SystemSettingsSchema,
        input.systemSettings
      );
      return store.updateSystemSettings(input.electionId, systemSettings);
    },

    deleteElection(input: { electionId: ElectionId }): Promise<void> {
      return store.deleteElection(input.electionId);
    },

    getBallotsFinalizedAt(input: {
      electionId: ElectionId;
    }): Promise<Date | null> {
      return store.getBallotsFinalizedAt(input.electionId);
    },

    async getBallotTemplate(input: {
      electionId: ElectionId;
    }): Promise<BallotTemplateId> {
      return store.getBallotTemplate(input.electionId);
    },

    async setBallotTemplate(input: {
      electionId: ElectionId;
      ballotTemplateId: BallotTemplateId;
    }): Promise<void> {
      await store.setBallotTemplate(input.electionId, input.ballotTemplateId);
    },

    async getStateFeatures(input: {
      electionId: ElectionId;
    }): Promise<StateFeaturesConfig> {
      return features.getStateFeatures(input.electionId);
    },

    listPollingPlaces(input: { electionId: string }): Promise<PollingPlace[]> {
      return store.listPollingPlaces(input.electionId);
    },

    async setPollingPlace(input: {
      electionId: ElectionId;
      place: PollingPlace;
    }): Promise<Result<void, SetPollingPlaceError>> {
      return store.setPollingPlace(
        input.electionId,
        unsafeParse(PollingPlaceSchema, input.place)
      );
    },

    deletePollingPlace(input: {
      electionId: string;
      id: string;
    }): Promise<void> {
      return store.deletePollingPlace(input);
    },
  } as const;
  return methods;
}
