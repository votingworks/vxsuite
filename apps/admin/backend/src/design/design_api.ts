import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  buildElectionDefinitionMethods,
  generateId,
  type ElectionListing,
  getStateFeaturesConfig,
  type StateCode,
  StateCodeSchema,
  StateCodes,
  type StateFeaturesConfig,
  type Store as DesignStore,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  type ElectionId,
  type SystemSettings,
  unsafeParse,
} from '@votingworks/types';
import { err, type Result } from '@votingworks/basics';
import { readElectionPackageFromFile } from '@votingworks/backend';
import { LogEventId, type Logger } from '@votingworks/logging';
import { readFile } from 'node:fs/promises';
import type { Workspace } from '../util/workspace.js';
import { constructAuthMachineState } from '../util/auth.js';
import { getLocalJurisdiction, LOCAL_JURISDICTION_ID } from './design_store.js';

class DesignAuthError extends grout.UserError {}

function withoutAudio(features: StateFeaturesConfig): StateFeaturesConfig {
  return { ...features, AUDIO_ENABLED: false };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildDesignApi({
  auth,
  workspace,
  designStore,
  logger,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  designStore: DesignStore;
  logger: Logger;
}) {
  async function requireSystemAdministrator(): Promise<void> {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace.store)
    );
    if (
      authStatus.status !== 'logged_in' ||
      authStatus.user.role !== 'system_administrator'
    ) {
      throw new DesignAuthError('auth:forbidden');
    }
  }

  const electionDefinitionMethods = buildElectionDefinitionMethods({
    store: designStore,
  });

  const methods = {
    ...electionDefinitionMethods,

    async getStateFeatures(input: {
      electionId: ElectionId;
    }): Promise<StateFeaturesConfig> {
      return withoutAudio(
        await electionDefinitionMethods.getStateFeatures(input)
      );
    },

    async getLocalJurisdictionId(): Promise<string> {
      return LOCAL_JURISDICTION_ID;
    },

    listStateCodes(): readonly StateCode[] {
      return StateCodes;
    },

    async getDesignStateCode(): Promise<StateCode> {
      return (await getLocalJurisdiction(designStore)).stateCode;
    },

    async setDesignStateCode(input: { stateCode: StateCode }): Promise<void> {
      await designStore.updateJurisdictionStateCode(
        LOCAL_JURISDICTION_ID,
        unsafeParse(StateCodeSchema, input.stateCode)
      );
    },

    async getLocalStateFeatures(): Promise<StateFeaturesConfig> {
      return withoutAudio(
        getStateFeaturesConfig(await getLocalJurisdiction(designStore))
      );
    },

    async loadElectionPackage(input: {
      electionFilePath: string;
    }): Promise<Result<ElectionId, Error>> {
      let electionFileContents: string;
      let systemSettings: SystemSettings | undefined;
      if (input.electionFilePath.endsWith('.json')) {
        electionFileContents = await readFile(input.electionFilePath, 'utf8');
      } else {
        const electionPackageResult = await readElectionPackageFromFile(
          input.electionFilePath
        );
        if (electionPackageResult.isErr()) {
          return err(
            new Error(
              `Invalid election package: ${electionPackageResult.err().type}`
            )
          );
        }
        const { electionPackage } = electionPackageResult.ok();
        electionFileContents = electionPackage.electionDefinition.electionData;
        ({ systemSettings } = electionPackage);
      }
      const loadResult = await electionDefinitionMethods.loadElection({
        upload: { format: 'vxf', electionFileContents },
        newId: generateId(),
        jurisdictionId: LOCAL_JURISDICTION_ID,
      });
      if (loadResult.isOk() && systemSettings) {
        await designStore.updateSystemSettings(loadResult.ok(), systemSettings);
      }
      return loadResult;
    },

    listElections(): Promise<ElectionListing[]> {
      return designStore.listElections({
        jurisdictionIds: [LOCAL_JURISDICTION_ID],
      });
    },
  } as const;

  return grout.createApi(methods, {
    before: [requireSystemAdministrator],
    after: [
      async ({ methodName, input }, result) => {
        if (/^(list|get)/.test(methodName)) return;
        await logger.logAsCurrentRole(LogEventId.ApiCall, {
          message: `Election design: ${methodName}`,
          methodName,
          input: JSON.stringify(input),
          disposition: result.isOk() ? 'success' : 'failure',
        });
      },
    ],
  });
}

export type DesignApi = ReturnType<typeof buildDesignApi>;
