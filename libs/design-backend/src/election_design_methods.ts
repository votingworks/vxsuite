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
import type {
  ElectionDesignMethods,
  SharedElectionDesignMethods,
} from './election_design_api.js';
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
import {
  validateContest,
  validateDistrictChanges,
  validatePartyChanges,
  validatePollingPlace,
  validatePrecinct,
} from './validation.js';

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
}): SharedElectionDesignMethods {
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

    listDistricts: ({ electionId }) => store.listDistricts(electionId),

    async updateDistricts(input) {
      const validation = validateDistrictChanges(
        await store.listDistricts(input.electionId),
        {
          deletedIds: input.deletedDistrictIds,
          updated: input.updatedDistricts,
          added: input.newDistricts,
        }
      );
      if (validation.isErr()) return validation;
      return store.updateDistricts(input);
    },

    listPrecincts: ({ electionId }) => store.listPrecincts(electionId),

    async createPrecinct(input) {
      const precinct = unsafeParse(PrecinctSchema, input.newPrecinct);
      const registeredVoterCounts = parseRegisteredVoterCounts(
        input.registeredVoterCounts
      );
      const validation = validatePrecinct(
        await store.listPrecincts(input.electionId),
        precinct
      );
      if (validation.isErr()) return validation;
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
      const validation = validatePrecinct(
        await store.listPrecincts(input.electionId),
        precinct
      );
      if (validation.isErr()) return validation;
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
    async setPollingPlace({ electionId, place }) {
      const parsedPlace = unsafeParse(PollingPlaceSchema, place);
      const validation = validatePollingPlace(
        await store.listPollingPlaces(electionId),
        await store.listPrecincts(electionId),
        parsedPlace
      );
      if (validation.isErr()) return validation;
      return store.setPollingPlace(electionId, parsedPlace);
    },
    async deletePollingPlace(input) {
      await store.deletePollingPlace(input);
    },

    listParties: ({ electionId }) => store.listParties(electionId),
    async updateParties(input) {
      const validation = validatePartyChanges(
        await store.listParties(input.electionId),
        {
          deletedIds: input.deletedPartyIds,
          updated: input.updatedParties,
          added: input.newParties,
        }
      );
      if (validation.isErr()) return validation;
      return store.updateParties(input);
    },

    listContests: ({ electionId }) => store.listContests(electionId),
    async createContest({ electionId, newContest }) {
      const contest = unsafeParse(ContestSchema, newContest);
      const validation = validateContest(
        await store.listContests(electionId),
        contest
      );
      if (validation.isErr()) return validation;
      return store.createContest(electionId, contest);
    },
    async updateContest({ electionId, updatedContest }) {
      const contest = unsafeParse(ContestSchema, updatedContest);
      const validation = validateContest(
        await store.listContests(electionId),
        contest
      );
      if (validation.isErr()) return validation;
      return store.updateContest(electionId, contest);
    },
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
