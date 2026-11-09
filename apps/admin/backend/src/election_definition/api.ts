import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  extractErrorMessage,
  ok,
  type Result,
} from '@votingworks/basics';
import {
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
import { type ElectionId, LanguageCode, unsafeParse } from '@votingworks/types';
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

/**
 * Creates the API methods for defining an election on VxAdmin. They must be
 * guarded by {@link createElectionDefinitionAccessMiddleware}.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createElectionDefinitionApiMethods({
  workspace,
  logger,
}: {
  workspace: Workspace;
  logger: Logger;
}) {
  const { store } = workspace;

  function loadInProgressElectionInfo(input: ElectionInput): ElectionInfo {
    const electionInfo = store.getInProgressElection();
    assert(
      electionInfo?.electionId === input.electionId,
      'Election definition not found'
    );
    return electionInfo;
  }

  const methods = {
    getCurrentInProgressElection(): ElectionInfo | null {
      return store.getInProgressElection() ?? null;
    },

    async createInProgressElection(): Promise<ElectionId> {
      const electionId = generateId();
      try {
        const { stateCode } = assertDefined(getMachineState());
        assert(
          store.getCurrentElectionId() === undefined,
          'Cannot create an election definition while an election is configured.'
        );
        assert(
          store.getInProgressElection() === undefined,
          'An election definition already exists.'
        );
        store.createInProgressElection(
          blankElectionInfo(electionId, stateCode)
        );
      } catch (error) {
        await logger.logAsCurrentRole(LogEventId.ElectionDefinitionCreated, {
          message: `Error creating election definition: ${extractErrorMessage(error)}`,
          disposition: 'failure',
        });
        throw error;
      }
      await logger.logAsCurrentRole(LogEventId.ElectionDefinitionCreated, {
        message: `Created election definition ${electionId}.`,
        disposition: 'success',
      });
      return electionId;
    },

    async deleteElection(input: ElectionInput): Promise<void> {
      try {
        loadInProgressElectionInfo(input);
        store.deleteInProgressElection();
      } catch (error) {
        await logger.logAsCurrentRole(LogEventId.ElectionDefinitionDiscarded, {
          message: `Error discarding election definition ${input.electionId}: ${extractErrorMessage(error)}`,
          disposition: 'failure',
        });
        throw error;
      }
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
      try {
        const electionInfoUpdate = unsafeParse(ElectionInfoUpdateSchema, input);
        assert(
          !electionInfoUpdate.isMiCombinedBallotPrimary,
          'Combined ballot primaries are not supported.'
        );
        loadInProgressElectionInfo(electionInfoUpdate);
        store.updateInProgressElectionInfo(electionInfoUpdate);
      } catch (error) {
        await logger.logAsCurrentRole(
          LogEventId.ElectionDefinitionInfoUpdated,
          {
            message: `Error updating election info for election definition ${input.electionId}: ${extractErrorMessage(error)}`,
            disposition: 'failure',
          }
        );
        throw error;
      }
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
  } as const;

  return methods satisfies ElectionDefinitionMethods;
}

/**
 * Requires election definition to be enabled and a system administrator to be
 * logged in for calls to the given election definition methods.
 */
export function createElectionDefinitionAccessMiddleware({
  auth,
  workspace,
  methods,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  methods: object;
}): grout.BeforeMiddleware<grout.AnyContext> {
  return async function requireElectionDefinitionAccessForMethod({
    methodName,
  }) {
    if (methodName in methods) {
      await requireElectionDefinitionAccess({ auth, workspace });
    }
  };
}
