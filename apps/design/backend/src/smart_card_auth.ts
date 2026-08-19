import {
  DEV_JURISDICTION,
  DippedSmartCardAuth,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { Optional } from '@votingworks/basics';
import { BaseLogger } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AuthClient } from './auth.js';
import { votingWorksOrganizationId } from './globals.js';
import { SupportUser, User } from './types.js';

/**
 * The user that a system administrator smart card authenticates as. Offline
 * deployments have no Auth0 accounts to look up, so we synthesize a user
 * instead of storing one. A support user has access to every jurisdiction on
 * the machine, which is what we want for the machine's operator, and belonging
 * to the VotingWorks organization gives them the full set of user features.
 */
function systemAdministratorUser(): SupportUser {
  return {
    type: 'support_user',
    id: 'smart-card|system-administrator',
    name: 'System Administrator',
    organization: {
      id: votingWorksOrganizationId(),
      name: 'VotingWorks',
    },
  };
}

/**
 * Only system administrators can currently unlock an offline VxDesign machine.
 */
const ALLOWED_USER_ROLES = ['system_administrator'] as const;

function constructAuthMachineState(): DippedSmartCardAuthMachineState {
  return {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    jurisdiction: process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION,
    machineType: 'design',
  };
}

/**
 * Authenticates users with VxSuite smart cards, for offline deployments.
 * Unlike Auth0, which authenticates a browser session, smart cards
 * authenticate the machine as a whole, so the request is irrelevant here.
 */
export class SmartCardAuthClient implements AuthClient {
  constructor(private readonly auth: DippedSmartCardAuthApi) {}

  /* istanbul ignore next - trivial construction of production dependencies */
  static init(logger: BaseLogger): SmartCardAuthClient {
    return new SmartCardAuthClient(
      new DippedSmartCardAuth({
        card: isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.USE_MOCK_CARDS
        )
          ? new MockFileCard()
          : new JavaCard(),
        config: { allowedUserRoles: ALLOWED_USER_ROLES },
        logger,
      })
    );
  }

  getAuthStatus(): Promise<DippedSmartCardAuthTypes.AuthStatus> {
    return this.auth.getAuthStatus(constructAuthMachineState());
  }

  checkPin(input: { pin: string }): Promise<void> {
    return this.auth.checkPin(constructAuthMachineState(), input);
  }

  logOut(): void {
    this.auth.logOut(constructAuthMachineState());
  }

  async getUser(): Promise<Optional<User>> {
    const authStatus = await this.getAuthStatus();
    return authStatus.status === 'logged_in'
      ? systemAdministratorUser()
      : undefined;
  }
}
