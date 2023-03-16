import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  DippedSmartCardAuth as DippedSmartCardAuthTypes,
  UserWithCard,
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

type CheckPinResponseExtended = CheckPinResponse | { response: 'error' };

type AuthAction =
  | { type: 'check_card_reader'; cardStatus: CardStatus }
  | { type: 'check_pin'; checkPinResponse: CheckPinResponseExtended }
  | { type: 'log_out' };

function cardStatusToProgrammableCard(
  cardStatus: CardStatus
): DippedSmartCardAuthTypes.ProgrammableCard {
  switch (cardStatus.status) {
    case 'card_error':
    case 'no_card':
    case 'unknown_error': {
      return { status: cardStatus.status };
    }
    case 'ready': {
      return { status: 'ready', programmedUser: cardStatus.user };
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(cardStatus, 'status');
    }
  }
}

/**
 * Given a previous auth status and a new auth status following an auth status transition, infers
 * and logs the relevant auth event, if any
 */
async function logAuthEventIfNecessary(
  previousAuthStatus: DippedSmartCardAuthTypes.AuthStatus,
  newAuthStatus: DippedSmartCardAuthTypes.AuthStatus,
  logger: Logger
) {
  switch (previousAuthStatus.status) {
    case 'logged_out': {
      if (
        previousAuthStatus.reason === 'machine_locked' &&
        newAuthStatus.status === 'logged_out' &&
        newAuthStatus.reason !== 'machine_locked'
      ) {
        await logger.log(
          LogEventId.AuthLogin,
          newAuthStatus.cardUserRole ?? 'unknown',
          {
            disposition: LogDispositionStandardTypes.Failure,
            message: 'User failed login.',
            reason: newAuthStatus.reason,
          }
        );
      }
      return;
    }

    case 'checking_pin': {
      if (newAuthStatus.status === 'logged_out') {
        await logger.log(
          LogEventId.AuthPinEntry,
          previousAuthStatus.user.role,
          {
            disposition: LogDispositionStandardTypes.Failure,
            message: 'User canceled PIN entry.',
          }
        );
      } else if (newAuthStatus.status === 'checking_pin') {
        if (
          newAuthStatus.wrongPinEnteredAt &&
          newAuthStatus.wrongPinEnteredAt !==
            previousAuthStatus.wrongPinEnteredAt
        ) {
          await logger.log(
            LogEventId.AuthPinEntry,
            previousAuthStatus.user.role,
            {
              disposition: LogDispositionStandardTypes.Failure,
              message: 'User entered incorrect PIN.',
            }
          );
        }
      } else if (newAuthStatus.status === 'remove_card') {
        await logger.log(LogEventId.AuthPinEntry, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User entered correct PIN.',
        });
      }
      // PIN check errors are logged in checkPin, where we have access to the full error message
      return;
    }

    case 'remove_card': {
      if (newAuthStatus.status === 'logged_in') {
        await logger.log(LogEventId.AuthLogin, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User logged in.',
        });
      }
      return;
    }

    case 'logged_in': {
      if (newAuthStatus.status === 'logged_out') {
        await logger.log(LogEventId.AuthLogout, previousAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User logged out.',
        });
      }
      return;
    }

    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(previousAuthStatus, 'status');
  }
}

/**
 * An implementation of the dipped smart card auth API.
 *
 * See the libs/auth README for notes on error handling.
 */
export class DippedSmartCardAuth implements DippedSmartCardAuthApi {
  private authStatus: DippedSmartCardAuthTypes.AuthStatus;
  private readonly card: Card;
  private readonly config: DippedSmartCardAuthConfig;
  private readonly logger: Logger;

  constructor(input: {
    card: Card;
    config: DippedSmartCardAuthConfig;
    logger: Logger;
  }) {
    this.authStatus = DippedSmartCardAuthTypes.DEFAULT_AUTH_STATUS;
    this.card = input.card;
    this.config = input.config;
    this.logger = input.logger;
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
    let checkPinResponse: CheckPinResponseExtended;
    try {
      checkPinResponse = await this.card.checkPin(input.pin);
    } catch (error) {
      const userRole =
        'user' in this.authStatus ? this.authStatus.user.role : 'unknown';
      await this.logger.log(LogEventId.AuthPinEntry, userRole, {
        disposition: LogDispositionStandardTypes.Failure,
        message: `Error checking PIN: ${extractErrorMessage(error)}`,
      });
      checkPinResponse = { response: 'error' };
    }
    await this.updateAuthStatus(machineState, {
      type: 'check_pin',
      checkPinResponse,
    });
  }

  async logOut(machineState: DippedSmartCardAuthMachineState): Promise<void> {
    await this.updateAuthStatus(machineState, { type: 'log_out' });
  }

  async programCard(
    machineState: DippedSmartCardAuthMachineState,
    input:
      | { userRole: 'system_administrator' }
      | { userRole: 'election_manager'; electionData: string }
      | { userRole: 'poll_worker' }
  ): Promise<Result<{ pin?: string }, Error>> {
    await this.logger.log(
      LogEventId.SmartCardProgramInit,
      'system_administrator',
      {
        message: 'Programming smart card...',
        programmedUserRole: input.userRole,
      }
    );
    let pin: string | undefined;
    try {
      pin = await this.programCardBase(machineState, input);
    } catch (error) {
      await this.logger.log(
        LogEventId.SmartCardProgramComplete,
        'system_administrator',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: `Error programming smart card: ${extractErrorMessage(
            error
          )}`,
          programmedUserRole: input.userRole,
        }
      );
      return err(new Error('Error programming card'));
    }
    await this.logger.log(
      LogEventId.SmartCardProgramComplete,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'Successfully programmed smart card.',
        programmedUserRole: input.userRole,
      }
    );
    return ok({ pin });
  }

  async unprogramCard(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<Result<void, Error>> {
    const programmedUserRole =
      ('programmableCard' in this.authStatus &&
        'programmedUser' in this.authStatus.programmableCard &&
        /* istanbul ignore next */
        this.authStatus.programmableCard.programmedUser?.role) ||
      'unprogrammed';
    await this.logger.log(
      LogEventId.SmartCardUnprogramInit,
      'system_administrator',
      {
        message: 'Unprogramming smart card...',
        programmedUserRole,
      }
    );
    try {
      await this.unprogramCardBase(machineState);
    } catch (error) {
      await this.logger.log(
        LogEventId.SmartCardUnprogramComplete,
        'system_administrator',
        {
          disposition: LogDispositionStandardTypes.Failure,
          message: `Error unprogramming smart card: ${extractErrorMessage(
            error
          )}`,
          programmedUserRole,
        }
      );
      return err(new Error('Error unprogramming card'));
    }
    await this.logger.log(
      LogEventId.SmartCardUnprogramComplete,
      'system_administrator',
      {
        disposition: LogDispositionStandardTypes.Success,
        message: 'Successfully unprogrammed smart card.',
        previousProgrammedUserRole: programmedUserRole,
      }
    );
    return ok();
  }

  private async programCardBase(
    machineState: DippedSmartCardAuthMachineState,
    input:
      | { userRole: 'system_administrator' }
      | { userRole: 'election_manager'; electionData: string }
      | { userRole: 'poll_worker' }
  ): Promise<string | undefined> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (this.authStatus.status !== 'logged_in') {
      throw new Error('User is not logged in');
    }
    if (this.authStatus.user.role !== 'system_administrator') {
      throw new Error('User is not a system administrator');
    }

    const { electionHash } = machineState;
    const pin = generatePin();
    switch (input.userRole) {
      case 'system_administrator': {
        await this.card.program({
          user: { role: 'system_administrator' },
          pin,
        });
        return pin;
      }
      case 'election_manager': {
        assert(electionHash !== undefined);
        await this.card.program({
          user: { role: 'election_manager', electionHash },
          pin,
          electionData: input.electionData,
        });
        return pin;
      }
      case 'poll_worker': {
        assert(electionHash !== undefined);
        await this.card.program({
          user: { role: 'poll_worker', electionHash },
        });
        return undefined;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(input, 'userRole');
      }
    }
  }

  private async unprogramCardBase(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<void> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (this.authStatus.status !== 'logged_in') {
      throw new Error('User is not logged in');
    }
    if (this.authStatus.user.role !== 'system_administrator') {
      throw new Error('User is not a system administrator');
    }

    await this.card.unprogram();
  }

  private async checkCardReaderAndUpdateAuthStatus(
    machineState: DippedSmartCardAuthMachineState
  ): Promise<void> {
    const cardStatus = await this.card.getCardStatus();
    await this.updateAuthStatus(machineState, {
      type: 'check_card_reader',
      cardStatus,
    });
  }

  private async updateAuthStatus(
    machineState: DippedSmartCardAuthMachineState,
    action: AuthAction
  ): Promise<void> {
    const previousAuthStatus = this.authStatus;
    this.authStatus = this.determineNewAuthStatus(machineState, action);
    await logAuthEventIfNecessary(
      previousAuthStatus,
      this.authStatus,
      this.logger
    );
  }

  private determineNewAuthStatus(
    machineState: DippedSmartCardAuthMachineState,
    action: AuthAction
  ): DippedSmartCardAuthTypes.AuthStatus {
    const currentAuthStatus = this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        switch (currentAuthStatus.status) {
          case 'logged_out': {
            switch (action.cardStatus.status) {
              // TODO: Consider an alternative screen on the frontend for unknown errors
              case 'no_card':
              case 'unknown_error': {
                return { status: 'logged_out', reason: 'machine_locked' };
              }
              case 'card_error': {
                return { status: 'logged_out', reason: 'card_error' };
              }
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
              default: {
                return throwIllegalValue(action.cardStatus, 'status');
              }
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
                  programmableCard: cardStatusToProgrammableCard(
                    action.cardStatus
                  ),
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
                programmableCard: cardStatusToProgrammableCard(
                  action.cardStatus
                ),
              };
            }
            return currentAuthStatus;
          }

          /* istanbul ignore next: Compile-time check for completeness */
          default: {
            return throwIllegalValue(currentAuthStatus, 'status');
          }
        }
      }

      case 'check_pin': {
        if (currentAuthStatus.status !== 'checking_pin') {
          return currentAuthStatus;
        }
        switch (action.checkPinResponse.response) {
          case 'correct': {
            return { status: 'remove_card', user: currentAuthStatus.user };
          }
          case 'incorrect': {
            return {
              ...currentAuthStatus,
              error: undefined,
              wrongPinEnteredAt: new Date(),
            };
          }
          case 'error': {
            return { ...currentAuthStatus, error: true };
          }
          /* istanbul ignore next: Compile-time check for completeness */
          default: {
            return throwIllegalValue(action.checkPinResponse, 'response');
          }
        }
      }

      case 'log_out': {
        return { status: 'logged_out', reason: 'machine_locked' };
      }

      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(action, 'type');
      }
    }
  }

  private validateCardUser(
    machineState: DippedSmartCardAuthMachineState,
    user?: UserWithCard
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
