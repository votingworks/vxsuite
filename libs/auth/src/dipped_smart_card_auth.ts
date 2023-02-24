import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  User,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { Card, CardStatus, CheckPinResponse } from './card';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthConfig,
  DippedSmartCardAuthMachineState,
} from './dipped_smart_card_auth_api';

type AuthAction =
  | { type: 'check_card_reader'; cardStatus: CardStatus }
  | { type: 'check_pin'; checkPinResponse: CheckPinResponse }
  | { type: 'log_out' };

/**
 * An implementation of the dipped smart card auth API
 *
 * TODO:
 * - Locking to avoid concurrent card writes
 * - Logging
 * - Tests
 *
 * See the libs/auth README for notes on error handling
 */
export class DippedSmartCardAuth implements DippedSmartCardAuthApi {
  private authStatus: DippedSmartCardAuthTypes.AuthStatus;
  private readonly card: Card;
  private readonly config: DippedSmartCardAuthConfig;

  constructor({
    card,
    config,
  }: {
    card: Card;
    config: DippedSmartCardAuthConfig;
  }) {
    this.authStatus = DippedSmartCardAuthTypes.DEFAULT_AUTH_STATUS;
    this.card = card;
    this.config = config;
  }

  async getAuthStatus(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<DippedSmartCardAuthTypes.AuthStatus> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    return this.authStatus;
  }

  async checkPin(
    machineState: DippedSmartCardAuthMachineState,
    input: { pin: string }
  ): Promise<void> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    const checkPinResponse = await this.card.checkPin(input.pin);
    this.updateAuthStatus(machineState, {
      type: 'check_pin',
      checkPinResponse,
    });
  }

  async logOut(machineState: DippedSmartCardAuthMachineState): Promise<void> {
    this.updateAuthStatus(machineState, { type: 'log_out' });
    return Promise.resolve();
  }

  async programCard(
    machineState: DippedSmartCardAuthMachineState,
    input:
      | { userRole: 'system_administrator' }
      | { userRole: 'election_manager'; electionData: string }
      | { userRole: 'poll_worker' }
  ): Promise<Result<{ pin?: string }, Error>> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (this.authStatus.status !== 'logged_in') {
      return err(new Error('User is not logged in'));
    }
    if (this.authStatus.user.role !== 'system_administrator') {
      return err(new Error('User is not a system administrator'));
    }

    const { electionHash } = machineState;
    const pin = generatePin();
    try {
      switch (input.userRole) {
        case 'system_administrator': {
          await this.card.program({
            user: { role: 'system_administrator' },
            pin,
          });
          break;
        }
        case 'election_manager': {
          assert(electionHash !== undefined);
          await this.card.program({
            user: { role: 'election_manager', electionHash },
            pin,
            electionData: input.electionData,
          });
          break;
        }
        case 'poll_worker': {
          assert(electionHash !== undefined);
          await this.card.program({
            user: { role: 'poll_worker', electionHash },
            pin,
          });
          break;
        }
        /* istanbul ignore next: Compile-time check for completeness */
        default:
          throwIllegalValue(input, 'userRole');
      }
    } catch (error) {
      return wrapException(error);
    }
    return ok({ pin });
  }

  async unprogramCard(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<Result<void, Error>> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (this.authStatus.status !== 'logged_in') {
      return err(new Error('User is not logged in'));
    }
    if (this.authStatus.user.role !== 'system_administrator') {
      return err(new Error('User is not a system administrator'));
    }

    try {
      await this.card.unprogram();
    } catch (error) {
      return wrapException(error);
    }
    return ok();
  }

  private async checkCardReaderAndUpdateAuthStatus(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<void> {
    const cardStatus = await this.card.getCardStatus();
    this.updateAuthStatus(machineState, {
      type: 'check_card_reader',
      cardStatus,
    });
  }

  private updateAuthStatus(
    machineState: DippedSmartCardAuthMachineState,
    action: AuthAction
  ): void {
    this.authStatus = this.determineNewAuthStatus(machineState, action);
  }

  private determineNewAuthStatus(
    machineState: DippedSmartCardAuthMachineState,
    action: AuthAction
  ): DippedSmartCardAuthTypes.AuthStatus {
    const currentAuthStatus = this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        const newAuthStatus = ((): DippedSmartCardAuthTypes.AuthStatus => {
          switch (currentAuthStatus.status) {
            case 'logged_out': {
              switch (action.cardStatus.status) {
                case 'no_card':
                  return { status: 'logged_out', reason: 'machine_locked' };

                case 'error':
                  return { status: 'logged_out', reason: 'card_error' };

                case 'ready': {
                  const { user } = action.cardStatus;
                  const validationResult = this.validateCardUser(
                    machineState,
                    user
                  );
                  if (validationResult.isOk()) {
                    assert(
                      user &&
                        (user.role === 'system_administrator' ||
                          user.role === 'election_manager')
                    );
                    return isFeatureFlagEnabled(
                      BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
                    )
                      ? { status: 'remove_card', user }
                      : { status: 'checking_pin', user };
                  }
                  return {
                    status: 'logged_out',
                    reason: validationResult.err(),
                    cardUserRole: user?.role,
                  };
                }

                /* istanbul ignore next: Compile-time check for completeness */
                default:
                  return throwIllegalValue(action.cardStatus, 'status');
              }
            }

            case 'checking_pin': {
              if (action.cardStatus.status === 'no_card') {
                return { status: 'logged_out', reason: 'machine_locked' };
              }
              return currentAuthStatus;
            }

            case 'remove_card': {
              if (action.cardStatus.status === 'no_card') {
                const { user } = currentAuthStatus;
                if (user.role === 'system_administrator') {
                  return {
                    status: 'logged_in',
                    user,
                    programmableCard: action.cardStatus,
                  };
                }
                return { status: 'logged_in', user };
              }
              return currentAuthStatus;
            }

            case 'logged_in': {
              const { user } = currentAuthStatus;
              if (user.role === 'system_administrator') {
                return {
                  ...currentAuthStatus,
                  programmableCard:
                    action.cardStatus.status === 'ready'
                      ? {
                          status: 'ready',
                          programmedUser: action.cardStatus.user,
                        }
                      : action.cardStatus,
                };
              }
              return currentAuthStatus;
            }

            /* istanbul ignore next: Compile-time check for completeness */
            default:
              throwIllegalValue(currentAuthStatus, 'status');
          }
        })();

        return newAuthStatus;
      }

      case 'check_pin': {
        if (
          currentAuthStatus.status !== 'checking_pin' ||
          action.checkPinResponse.response === 'error'
        ) {
          return currentAuthStatus;
        }
        return action.checkPinResponse.response === 'correct'
          ? { status: 'remove_card', user: currentAuthStatus.user }
          : { ...currentAuthStatus, wrongPinEnteredAt: new Date() };
      }

      case 'log_out':
        return { status: 'logged_out', reason: 'machine_locked' };

      /* istanbul ignore next: Compile-time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  }

  private validateCardUser(
    machineState: DippedSmartCardAuthMachineState,
    user?: User
  ): Result<void, DippedSmartCardAuthTypes.LoggedOut['reason']> {
    if (!user) {
      return err('invalid_user_on_card');
    }

    if (!['system_administrator', 'election_manager'].includes(user.role)) {
      return err('user_role_not_allowed');
    }

    if (user.role === 'election_manager') {
      if (!machineState.electionHash) {
        return this.config.allowElectionManagersToAccessUnconfiguredMachines
          ? ok()
          : err('machine_not_configured');
      }
      if (user.electionHash !== machineState.electionHash) {
        return err('election_manager_wrong_election');
      }
    }

    return ok();
  }
}
