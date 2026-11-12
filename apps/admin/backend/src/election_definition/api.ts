import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  ok,
  type Result,
} from '@votingworks/basics';
import {
  type DistrictsUpdate,
  type DuplicateDistrictError,
  type ElectionDefinitionMethods,
  type ElectionInfo,
  type ElectionInfoUpdate,
  ElectionInfoUpdateSchema,
  type ElectionInput,
  generateId,
  type StateCode,
  type StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import * as grout from '@votingworks/grout';
import { LogEventId, type Logger } from '@votingworks/logging';
import {
  type District,
  type ElectionId,
  LanguageCode,
  unsafeParse,
} from '@votingworks/types';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { constructAuthMachineState } from '../util/auth.js';
import type { Workspace } from '../util/workspace.js';
import { getMachineState, isElectionDefinitionEnabled } from './state.js';

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
}: {
  workspace: Workspace;
  logger: Logger;
}) {
  const { store } = workspace;

  function loadInProgressElectionInfo(input: ElectionInput): ElectionInfo {
    const electionInfo = store.electionDefinition.getInProgressElection();
    assert(
      electionInfo?.electionId === input.electionId,
      'Election definition not found'
    );
    return electionInfo;
  }

  const methods = {
    getCurrentInProgressElection(): ElectionInfo | null {
      return store.electionDefinition.getInProgressElection() ?? null;
    },

    async createInProgressElection(): Promise<ElectionId> {
      const electionId = generateId();
      const { stateCode } = assertDefined(getMachineState());
      assert(
        store.getCurrentElectionId() === undefined,
        'Cannot create an election definition while an election is configured.'
      );
      assert(
        store.electionDefinition.getInProgressElection() === undefined,
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
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
}) {
  return grout.createApi(
    createElectionDefinitionApiMethods({ workspace, logger }),
    { before: [() => requireElectionDefinitionAccess({ auth, workspace })] }
  );
}

/**
 * A type to be used by the frontend to create an election definition API client
 */
export type ElectionDefinitionApi = ReturnType<
  typeof buildElectionDefinitionApi
>;
