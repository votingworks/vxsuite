import { InsertedSmartCardAuthMachineState } from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { Store } from '../store';

export function constructAuthMachineState(
  store: Store
): InsertedSmartCardAuthMachineState {
  const electionDefinition = store.getElectionDefinition();
  const jurisdiction = store.getJurisdiction();
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}
