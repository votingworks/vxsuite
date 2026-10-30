import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  buildElectionDefinitionMethods,
  type ElectionListing,
  getStateFeaturesConfig,
  type StateCode,
  StateCodeSchema,
  type StateFeaturesConfig,
  type Store as DesignStore,
} from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import { unsafeParse } from '@votingworks/types';
import type { Workspace } from '../util/workspace.js';
import { constructAuthMachineState } from '../util/auth.js';
import { getLocalJurisdiction, LOCAL_JURISDICTION_ID } from './design_store.js';

class DesignAuthError extends grout.UserError {}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildDesignApi({
  auth,
  workspace,
  designStore,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  designStore: DesignStore;
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

  const methods = {
    ...buildElectionDefinitionMethods({ store: designStore }),

    async getLocalJurisdictionId(): Promise<string> {
      return LOCAL_JURISDICTION_ID;
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
      return getStateFeaturesConfig(await getLocalJurisdiction(designStore));
    },

    listElections(): Promise<ElectionListing[]> {
      return designStore.listElections({
        jurisdictionIds: [LOCAL_JURISDICTION_ID],
      });
    },
  } as const;

  return grout.createApi(methods, {
    before: [requireSystemAdministrator],
  });
}

export type DesignApi = ReturnType<typeof buildDesignApi>;
