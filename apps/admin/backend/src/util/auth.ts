import type {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { throwIllegalValue } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, type UserRole } from '@votingworks/types';
import type { LoggingUserRole } from '@votingworks/logging';
import { getMachineJurisdiction } from '../machine_config.js';
import type { AppMode, BaseStore } from '../types.js';

function getAllowedUserRoles(appMode: AppMode): readonly UserRole[] {
  switch (appMode) {
    case 'host': {
      return ['vendor', 'system_administrator', 'election_manager'];
    }

    case 'client': {
      return [
        'vendor',
        'system_administrator',
        'election_manager',
        'poll_worker',
      ];
    }

    case 'restore': {
      return ['vendor', 'system_administrator'];
    }

    default: {
      throwIllegalValue(appMode);
    }
  }
}

/**
 * Construct the auth machine state from the store's election state. When the
 * store has no current election, returns defaults.
 */
export function constructAuthMachineState(
  store: BaseStore
): DippedSmartCardAuthMachineState {
  const electionId = store.getCurrentElectionId();

  const jurisdiction = getMachineJurisdiction();
  const allowedUserRoles = getAllowedUserRoles(store.getAppMode());

  if (!electionId) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      allowedUserRoles,
      jurisdiction,
      machineType: 'admin',
      isConfigured: false,
    };
  }

  const systemSettings =
    // @coverage-defer
    store.getSystemSettings(electionId) ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    allowedUserRoles,
    isConfigured: true,
    electionKey: store.getElectionKey(electionId),
    jurisdiction,
    machineType: 'admin',
  };
}

/**
 * Get the current logging user role.
 */
export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  store: BaseStore
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(constructAuthMachineState(store));
  if (authStatus.status === 'logged_in') {
    return authStatus.user.role;
  }
  return 'unknown';
}
