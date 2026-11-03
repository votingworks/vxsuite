import { ok, type Result, wrapException } from '@votingworks/basics';
import type {
  GoogleCloudTranslator,
  SpeechSynthesizer,
} from '@votingworks/backend';
import type { BallotTemplateId } from '@votingworks/hmpb';
import {
  ContestSchema,
  type Election,
  type ElectionId,
  getAllBallotLanguages,
  type HmpbBallotPaperSize,
  HmpbBallotPaperSizeSchema,
  type LanguageCode,
  PollingPlaceSchema,
  type PrecinctRegisteredVoterCountEntry,
  PrecinctRegisteredVoterCountEntrySchema,
  PrecinctSchema,
  type SystemSettings,
  SystemSettingsSchema,
  unsafeParse,
} from '@votingworks/types';
import { renderBallotPreview } from './ballot_preview.js';
import { defaultBallotTemplate } from './ballots.js';
import type { DesignElectionStore } from './design_election_store.js';
import type {
  DesignFeaturesProvider,
  TtsEditsStore,
} from './design_providers.js';
import type { ElectionDesignMethods } from './election_design_api.js';
import {
  type ConvertMsElection,
  createBlankElection,
  prepareLoadedElection,
} from './election_load.js';
import { getStateFeaturesConfig } from './features.js';
import { defaultSystemSettings } from './system_settings.js';
import { ttsStringDefaultsForElection } from './tts_strings.js';
import {
  ElectionInfoUpdateSchema,
  type ElectionUpload,
  type Jurisdiction,
} from './types.js';
import { regenerateElectionIds } from './utils.js';

function parseRegisteredVoterCounts(
  counts?: PrecinctRegisteredVoterCountEntry
): PrecinctRegisteredVoterCountEntry | undefined {
  return counts !== undefined
    ? unsafeParse(PrecinctRegisteredVoterCountEntrySchema, counts)
    : undefined;
}

export function buildElectionDesignMethods({
  store,
  features,
  translator,
  speechSynthesizer,
  ttsEdits,
}: {
  store: DesignElectionStore;
  features: DesignFeaturesProvider;
  translator: GoogleCloudTranslator;
  speechSynthesizer: SpeechSynthesizer;
  ttsEdits: TtsEditsStore;
}): ElectionDesignMethods {
  return {
    async getElectionInfo({ electionId }) {
      const {
        election,
        isMiCombinedBallotPrimary,
        ballotLanguageConfigs,
        jurisdictionId,
        externalSource,
      } = await store.getElection(electionId);
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
        languageCodes: getAllBallotLanguages(ballotLanguageConfigs),
        externalSource,
      };
    },

    updateElectionInfo(input) {
      return store.updateElectionInfo(
        unsafeParse(ElectionInfoUpdateSchema, input)
      );
    },

    async deleteElection({ electionId }) {
      await store.deleteElection(electionId);
    },

    listDistricts: ({ electionId }) => store.listDistricts(electionId),
    updateDistricts: (input) => store.updateDistricts(input),

    listPrecincts: ({ electionId }) => store.listPrecincts(electionId),

    async createPrecinct(input) {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      const registeredVoterCounts = parseRegisteredVoterCounts(
        input.registeredVoterCounts
      );
      const result = await store.createPrecinct(input.electionId, precinct);
      if (result.isErr()) return result;
      await store.setPrecinctRegisteredVoterCounts(
        precinct,
        registeredVoterCounts
      );
      return ok();
    },

    async updatePrecinct(input) {
      const precinct = unsafeParse(PrecinctSchema, input.updatedPrecinct);
      const registeredVoterCounts = parseRegisteredVoterCounts(
        input.registeredVoterCounts
      );
      const result = await store.updatePrecinct(input.electionId, precinct);
      if (result.isErr()) return result;
      await store.setPrecinctRegisteredVoterCounts(
        precinct,
        registeredVoterCounts
      );
      return ok();
    },

    async deletePrecinct({ electionId, precinctId }) {
      await store.deletePrecinct(electionId, precinctId);
    },

    getRegisteredVoterCounts: ({ electionId }) =>
      store.getRegisteredVoterCounts(electionId),

    listPollingPlaces: ({ electionId }) => store.listPollingPlaces(electionId),
    setPollingPlace: ({ electionId, place }) =>
      store.setPollingPlace(electionId, unsafeParse(PollingPlaceSchema, place)),
    async deletePollingPlace(input) {
      await store.deletePollingPlace(input);
    },

    listParties: ({ electionId }) => store.listParties(electionId),
    updateParties: (input) => store.updateParties(input),

    listContests: ({ electionId }) => store.listContests(electionId),
    createContest: ({ electionId, newContest }) =>
      store.createContest(electionId, unsafeParse(ContestSchema, newContest)),
    updateContest: ({ electionId, updatedContest }) =>
      store.updateContest(
        electionId,
        unsafeParse(ContestSchema, updatedContest)
      ),
    async reorderContests({ electionId, contestIds }) {
      await store.reorderContests(electionId, contestIds);
    },
    async deleteContest({ electionId, contestId }) {
      await store.deleteContest(electionId, contestId);
    },

    listBallotStyles: ({ electionId }) => store.listBallotStyles(electionId),
    getBallotLayoutSettings: ({ electionId }) =>
      store.getBallotLayoutSettings(electionId),
    getBallotTemplate: ({ electionId }) => store.getBallotTemplate(electionId),
    getBallotsFinalizedAt: ({ electionId }) =>
      store.getBallotsFinalizedAt(electionId),

    async getBallotPreviewPdf(input) {
      return renderBallotPreview({
        electionRecord: await store.getElection(input.electionId),
        compact: (await store.getBallotLayoutSettings(input.electionId))
          .compact,
        translator,
        input,
      });
    },

    getStateFeatures: ({ electionId }) => features.getStateFeatures(electionId),

    ttsEditsGet: (key) => ttsEdits.ttsEditsGet(key),
    ttsEditsSet: (input) => ttsEdits.ttsEditsSet(input, input.data),
    async ttsStringDefaults({ electionId }) {
      return ttsStringDefaultsForElection(
        (await store.getElection(electionId)).election
      );
    },
    async ttsSynthesizeFromText({ text, languageCode }) {
      const base64Data = await speechSynthesizer.synthesizeSpeech(
        text,
        languageCode as LanguageCode
      );
      return `data:audio/mp3;base64,${base64Data}`;
    },
  };
}

export const ttsMethodsThatHandleAuthThemselves = [
  'ttsSynthesizeFromText',
] as const satisfies Array<keyof ElectionDesignMethods>;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildElectionSetupMethods({
  store,
  features,
  convertMsElection,
}: {
  store: DesignElectionStore;
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

    async setBallotTemplate(input: {
      electionId: ElectionId;
      ballotTemplateId: BallotTemplateId;
    }): Promise<void> {
      await store.setBallotTemplate(input.electionId, input.ballotTemplateId);
    },
  } as const;
}

export async function cloneElection(
  store: DesignElectionStore,
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
