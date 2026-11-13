import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import type { ExportDataResult } from '@votingworks/backend';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  type DistrictsUpdate,
  type DuplicateDistrictError,
  type DuplicatePrecinctError,
  type ElectionDefinitionMethods,
  type ElectionInfo,
  type ElectionInfoUpdate,
  ElectionInfoUpdateSchema,
  type ElectionInput,
  generateId,
  type PollingPlaceDelete,
  type PollingPlaceSet,
  type PrecinctCreate,
  type PrecinctDelete,
  type PrecinctUpdate,
  type SetPollingPlaceError,
  type StateCode,
  type StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import * as grout from '@votingworks/grout';
import { LogEventId, type Logger } from '@votingworks/logging';
import {
  type District,
  type ElectionId,
  type ElectionRegisteredVoterCounts,
  LanguageCode,
  type NonEnglishLanguageCode,
  type PollingPlace,
  pollingPlaceGenerateFromPrecinct,
  type Precinct,
  unsafeParse,
} from '@votingworks/types';
import type { UsbDrive } from '@votingworks/usb-drive';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { constructAuthMachineState } from '../util/auth.js';
import type { Workspace } from '../util/workspace.js';
import { getMachineState, isElectionDefinitionEnabled } from './state.js';
import {
  exportTranslations,
  importTranslations,
  type TranslationsImportError,
} from './translations.js';

function blankElectionInfo(
  electionId: ElectionId,
  stateCode: StateCode
): ElectionInfoUpdate {
  return {
    electionId,
    type: 'general',
    date: DateWithoutTime.today(),
    title: '',
    state: stateCode,
    jurisdictionName: '',
    seal: '',
    languageCodes: [LanguageCode.ENGLISH],
  };
}

function describePrecinctError(error: DuplicatePrecinctError): string {
  switch (error) {
    case 'duplicate-precinct-name':
      return 'another precinct has the same name';
    case 'duplicate-split-name':
      return 'two of its splits have the same name';
    case 'duplicate-split-districts':
      return 'two of its splits have the same districts';
    default:
      throwIllegalValue(error);
  }
}

function describePollingPlaceError(error: SetPollingPlaceError): string {
  switch (error) {
    case 'duplicate-name':
      return 'another polling place of the same type has the same name';
    case 'invalid-precinct':
      return 'one of its precincts is not in the election';
    default:
      throwIllegalValue(error);
  }
}

async function requireElectionDefinitionAccess({
  auth,
  workspace,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
}): Promise<void> {
  if (!isElectionDefinitionEnabled()) {
    throw new grout.UserError('election-definition:disabled');
  }
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace.store)
  );
  if (!isSystemAdministratorAuth(authStatus)) {
    throw new grout.UserError('auth:forbidden');
  }
}

function createElectionDefinitionApiMethods({
  workspace,
  logger,
  usbDrive,
}: {
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
}) {
  const { store } = workspace;

  function loadInProgressElectionInfo(input: ElectionInput): ElectionInfo {
    const electionInfo = store.electionDefinition.getElectionInfo();
    assert(
      electionInfo?.electionId === input.electionId,
      'Election definition not found'
    );
    return electionInfo;
  }

  const methods = {
    getCurrentInProgressElection(): ElectionInfo | null {
      return store.electionDefinition.getElectionInfo() ?? null;
    },

    async createInProgressElection(): Promise<ElectionId> {
      const electionId = generateId();
      const { stateCode } = assertDefined(getMachineState());
      assert(
        store.getCurrentElectionId() === undefined,
        'Cannot create an election definition while an election is configured.'
      );
      assert(
        store.electionDefinition.getElectionInfo() === undefined,
        'An election definition already exists.'
      );
      store.electionDefinition.createInProgressElection(
        blankElectionInfo(electionId, stateCode)
      );
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionCreated, {
        message: `Created election definition ${electionId}.`,
        disposition: 'success',
      });
      return electionId;
    },

    async deleteElection(input: ElectionInput): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deleteInProgressElection();
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionDiscarded, {
        message: `Discarded election definition ${input.electionId}.`,
        disposition: 'success',
      });
    },

    getElectionInfo(input: ElectionInput): ElectionInfo {
      return loadInProgressElectionInfo(input);
    },

    async updateElectionInfo(
      input: ElectionInfoUpdate
    ): Promise<Result<void, never>> {
      const electionInfoUpdate = unsafeParse(ElectionInfoUpdateSchema, input);
      assert(
        !electionInfoUpdate.isMiCombinedBallotPrimary,
        'Combined ballot primaries are not supported.'
      );
      loadInProgressElectionInfo(electionInfoUpdate);
      store.electionDefinition.updateInProgressElectionInfo(electionInfoUpdate);
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionInfoUpdated, {
        message: `Updated election info for election definition ${input.electionId}.`,
        disposition: 'success',
      });
      return ok();
    },

    getStateFeatures(input: ElectionInput): StateFeaturesConfig {
      loadInProgressElectionInfo(input);
      return assertDefined(getMachineState()).features;
    },

    listDistricts(input: ElectionInput): District[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listDistricts(input.electionId);
    },

    async updateDistricts(
      input: DistrictsUpdate
    ): Promise<Result<void, DuplicateDistrictError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updateDistricts(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionDistrictsUpdated,
          {
            message: `Error updating districts for election definition ${input.electionId}: district ${result.err().districtId} has a duplicate name.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionDistrictsUpdated,
        {
          message: `Updated districts for election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    listPrecincts(input: ElectionInput): Precinct[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listPrecincts(input.electionId);
    },

    async createPrecinct(
      input: PrecinctCreate
    ): Promise<Result<void, DuplicatePrecinctError>> {
      loadInProgressElectionInfo(input);
      const { features } = assertDefined(getMachineState());
      const result = store.electionDefinition.createPrecinct(
        input,
        features.EDIT_POLLING_PLACES
          ? pollingPlaceGenerateFromPrecinct({
              id: generateId(),
              precinct: input.newPrecinct,
              type: 'election_day',
            })
          : undefined
      );
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPrecinctCreated,
          {
            message: `Error creating precinct ${input.newPrecinct.id} in election definition ${input.electionId}: ${describePrecinctError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctCreated,
        {
          message: `Created precinct ${input.newPrecinct.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async updatePrecinct(
      input: PrecinctUpdate
    ): Promise<Result<void, DuplicatePrecinctError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.updatePrecinct(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPrecinctUpdated,
          {
            message: `Error updating precinct ${input.updatedPrecinct.id} in election definition ${input.electionId}: ${describePrecinctError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctUpdated,
        {
          message: `Updated precinct ${input.updatedPrecinct.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async deletePrecinct(input: PrecinctDelete): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deletePrecinct(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPrecinctDeleted,
        {
          message: `Deleted precinct ${input.precinctId} from election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    getRegisteredVoterCounts(
      input: ElectionInput
    ): ElectionRegisteredVoterCounts {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.getRegisteredVoterCounts(
        input.electionId
      );
    },

    listPollingPlaces(input: ElectionInput): PollingPlace[] {
      loadInProgressElectionInfo(input);
      return store.electionDefinition.listPollingPlaces(input.electionId);
    },

    async setPollingPlace(
      input: PollingPlaceSet
    ): Promise<Result<void, SetPollingPlaceError>> {
      loadInProgressElectionInfo(input);
      const result = store.electionDefinition.setPollingPlace(input);
      if (result.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionPollingPlaceSaved,
          {
            message: `Error saving polling place ${input.place.id} in election definition ${input.electionId}: ${describePollingPlaceError(result.err())}.`,
            disposition: 'failure',
          }
        );
        return result;
      }
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPollingPlaceSaved,
        {
          message: `Saved polling place ${input.place.id} in election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
      return result;
    },

    async deletePollingPlace(input: PollingPlaceDelete): Promise<void> {
      loadInProgressElectionInfo(input);
      store.electionDefinition.deletePollingPlace(input);
      await logger.logAsCurrentRole(
        LogEventId.ElectionDefinitionPollingPlaceDeleted,
        {
          message: `Deleted polling place ${input.id} from election definition ${input.electionId}.`,
          disposition: 'success',
        }
      );
    },

    async saveTranslationsFile(
      input: ElectionInput & { languageCode: NonEnglishLanguageCode }
    ): Promise<ExportDataResult> {
      loadInProgressElectionInfo(input);
      const result = await exportTranslations(
        store.electionDefinition,
        input.electionId,
        usbDrive,
        input.languageCode
      );
      await logger.logAsCurrentRole(
        LogEventId.TranslationsFileSaved,
        result.isOk()
          ? {
              message: `Saved ${input.languageCode} translations file for election definition ${input.electionId}.`,
              disposition: 'success',
            }
          : {
              message: `Error saving ${input.languageCode} translations file for election definition ${input.electionId}: ${result.err().type}`,
              disposition: 'failure',
            }
      );
      return result;
    },

    async loadTranslationsFile(
      input: ElectionInput & {
        languageCode: NonEnglishLanguageCode;
        filePath: string;
      }
    ): Promise<Result<void, TranslationsImportError>> {
      loadInProgressElectionInfo(input);
      const result = await importTranslations(
        store.electionDefinition,
        input.electionId,
        input.filePath,
        input.languageCode
      );
      await logger.logAsCurrentRole(
        LogEventId.TranslationsFileLoaded,
        result.isOk()
          ? {
              disposition: 'success',
              message: `Loaded ${input.languageCode} translations file for election definition ${input.electionId}.`,
            }
          : {
              disposition: 'failure',
              message: `Error loading ${input.languageCode} translations file for election definition ${input.electionId}: ${result.err().type}`,
            }
      );
      return result;
    },
  } as const;

  return methods satisfies ElectionDefinitionMethods;
}

/**
 * Builds the API for defining an election on VxAdmin, available only to system
 * administrators when election definition is enabled.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildElectionDefinitionApi({
  auth,
  workspace,
  logger,
  usbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
}) {
  return grout.createApi(
    createElectionDefinitionApiMethods({ workspace, logger, usbDrive }),
    { before: [() => requireElectionDefinitionAccess({ auth, workspace })] }
  );
}

/**
 * A type to be used by the frontend to create an election definition API client
 */
export type ElectionDefinitionApi = ReturnType<
  typeof buildElectionDefinitionApi
>;
