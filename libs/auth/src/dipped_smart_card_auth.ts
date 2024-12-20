import {
  assert,
  deepEqual,
  err,
  extractErrorMessage,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  BaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
} from '@votingworks/logging';
import { DippedSmartCardAuth as DippedSmartCardAuthTypes } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  generatePin,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  arePollWorkerCardDetails,
  areUniversalVendorCardDetails,
  Card,
  CardDetails,
  CardStatus,
  CheckPinResponse,
} from './card';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthConfig,
  DippedSmartCardAuthMachineState,
} from './dipped_smart_card_auth_api';
import { computeCardLockoutEndTime } from './lockout';
import { computeSessionEndTime } from './sessions';

type CheckPinResponseExtended =
  | CheckPinResponse
  | { response: 'error'; error: unknown };

type AuthAction =
  | { type: 'check_card_reader'; cardStatus: CardStatus }
  | { type: 'check_pin'; checkPinResponse: CheckPinResponseExtended }
  | { type: 'log_out' }
  | {
      type: 'update_session_expiry';
      sessionExpiresAt: Date;
    };

function cardStatusToProgrammableCard(
  machineState: DippedSmartCardAuthMachineState,
  cardStatus: CardStatus
): DippedSmartCardAuthTypes.ProgrammableCard {
  switch (cardStatus.status) {
    case 'no_card_reader':
    case 'no_card':
    case 'card_error':
    case 'unknown_error': {
      return { status: cardStatus.status };
    }
    case 'ready': {
      const { cardDetails } = cardStatus;
      const { user } = cardDetails;
      return {
        status: 'ready',
        programmedUser:
          // If one jurisdiction somehow attains a card from another jurisdiction, treat it as
          // unprogrammed
          (user?.jurisdiction !== machineState.jurisdiction &&
            !areUniversalVendorCardDetails(cardDetails)) ||
          // If a poll worker card doesn't have a PIN but poll worker card PINs are enabled, treat
          // the card as unprogrammed. And vice versa. If a poll worker card does have a PIN but
          // poll worker card PINs are not enabled, also treat the card as unprogrammed.
          (cardDetails &&
            arePollWorkerCardDetails(cardDetails) &&
            cardDetails.hasPin !==
              Boolean(machineState.arePollWorkerCardPinsEnabled))
            ? undefined
            : user,
      };
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
  logger: BaseLogger
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
          if (newAuthStatus.lockedOutUntil) {
            await logger.log(
              LogEventId.AuthPinEntryLockout,
              newAuthStatus.user.role,
              {
                disposition: LogDispositionStandardTypes.Failure,
                message: `User entered incorrect PIN. Maximum attempts exceeded, locked out until: ${newAuthStatus.lockedOutUntil.toString()}`,
                lockedOutUntil: newAuthStatus.lockedOutUntil.toString(),
              }
            );
          } else {
            await logger.log(LogEventId.AuthPinEntry, newAuthStatus.user.role, {
              disposition: LogDispositionStandardTypes.Failure,
              message: 'User entered incorrect PIN.',
            });
          }
        } else if (
          newAuthStatus.error &&
          newAuthStatus.error.erroredAt !== previousAuthStatus.error?.erroredAt
        ) {
          await logger.log(LogEventId.AuthPinEntry, newAuthStatus.user.role, {
            disposition: LogDispositionStandardTypes.Failure,
            message: `Error checking PIN: ${extractErrorMessage(
              newAuthStatus.error.error
            )}`,
          });
        }
      } else if (newAuthStatus.status === 'remove_card') {
        await logger.log(LogEventId.AuthPinEntry, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User entered correct PIN.',
        });
      }
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
        if (newAuthStatus.reason === 'machine_locked_by_session_expiry') {
          await logger.log(
            LogEventId.AuthLogout,
            previousAuthStatus.user.role,
            {
              disposition: LogDispositionStandardTypes.Success,
              message: 'User logged out automatically due to session expiry.',
              reason: newAuthStatus.reason,
            }
          );
        } else {
          await logger.log(
            LogEventId.AuthLogout,
            previousAuthStatus.user.role,
            {
              disposition: LogDispositionStandardTypes.Success,
              message: 'User logged out.',
              reason: newAuthStatus.reason,
            }
          );
        }
      }
      return;
    }

    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(previousAuthStatus, 'status');
  }
}

/**
 * The implementation of the dipped smart card auth API
 */
export class DippedSmartCardAuth implements DippedSmartCardAuthApi {
  private authStatus: DippedSmartCardAuthTypes.AuthStatus;
  private readonly card: Card;
  private readonly config: DippedSmartCardAuthConfig;
  private readonly logger: BaseLogger;

  constructor(input: {
    card: Card;
    config: DippedSmartCardAuthConfig;
    logger: BaseLogger;
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
    if (this.isLockedOut()) {
      return;
    }

    let checkPinResponse: CheckPinResponseExtended;
    try {
      checkPinResponse = await this.card.checkPin(input.pin);
    } catch (error) {
      checkPinResponse = { response: 'error', error };
    }
    await this.updateAuthStatus(machineState, {
      type: 'check_pin',
      checkPinResponse,
    });
  }

  async logOut(machineState: DippedSmartCardAuthMachineState): Promise<void> {
    await this.updateAuthStatus(machineState, { type: 'log_out' });
  }

  async updateSessionExpiry(
    machineState: DippedSmartCardAuthMachineState,
    input: { sessionExpiresAt: Date }
  ): Promise<void> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    await this.updateAuthStatus(machineState, {
      type: 'update_session_expiry',
      sessionExpiresAt: input.sessionExpiresAt,
    });
  }

  async programCard(
    machineState: DippedSmartCardAuthMachineState,
    input:
      | { userRole: 'system_administrator' }
      | { userRole: 'election_manager' }
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
      | { userRole: 'election_manager' }
      | { userRole: 'poll_worker' }
  ): Promise<string | undefined> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (this.authStatus.status !== 'logged_in') {
      throw new Error('User is not logged in');
    }
    if (this.authStatus.user.role !== 'system_administrator') {
      throw new Error('User is not a system administrator');
    }

    const { arePollWorkerCardPinsEnabled, electionKey, jurisdiction } =
      machineState;
    assert(jurisdiction !== undefined);
    const pin = generatePin();
    switch (input.userRole) {
      case 'system_administrator': {
        await this.card.program({
          user: { role: 'system_administrator', jurisdiction },
          pin,
        });
        return pin;
      }
      case 'election_manager': {
        assert(electionKey !== undefined);
        await this.card.program({
          user: { role: 'election_manager', jurisdiction, electionKey },
          pin,
        });
        return pin;
      }
      case 'poll_worker': {
        assert(electionKey !== undefined);
        if (arePollWorkerCardPinsEnabled) {
          await this.card.program({
            user: { role: 'poll_worker', jurisdiction, electionKey },
            pin,
          });
          return pin;
        }
        await this.card.program({
          user: { role: 'poll_worker', jurisdiction, electionKey },
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
    const currentAuthStatus: DippedSmartCardAuthTypes.AuthStatus =
      this.authStatus.status === 'logged_in' &&
      new Date() >= this.authStatus.sessionExpiresAt
        ? { status: 'logged_out', reason: 'machine_locked_by_session_expiry' }
        : this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        switch (currentAuthStatus.status) {
          case 'logged_out': {
            switch (action.cardStatus.status) {
              case 'no_card_reader': {
                return { status: 'logged_out', reason: 'no_card_reader' };
              }
              // TODO: Consider an alternative screen on the frontend for unknown errors
              case 'no_card':
              case 'unknown_error': {
                return {
                  status: 'logged_out',
                  reason:
                    currentAuthStatus.reason ===
                    'machine_locked_by_session_expiry'
                      ? 'machine_locked_by_session_expiry'
                      : 'machine_locked',
                };
              }
              case 'card_error': {
                return { status: 'logged_out', reason: 'card_error' };
              }
              case 'ready': {
                const { cardDetails } = action.cardStatus;
                const validationResult = this.validateCard(
                  machineState,
                  cardDetails
                );
                if (validationResult.isOk()) {
                  assert(cardDetails.user !== undefined);
                  const { user } = cardDetails;
                  assert(
                    user.role === 'vendor' ||
                      user.role === 'system_administrator' ||
                      user.role === 'election_manager'
                  );
                  const skipPinEntry = isFeatureFlagEnabled(
                    BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
                  );
                  return skipPinEntry
                    ? {
                        status: 'remove_card',
                        user,
                        sessionExpiresAt: computeSessionEndTime(machineState),
                      }
                    : {
                        status: 'checking_pin',
                        user,
                        lockedOutUntil: computeCardLockoutEndTime(
                          machineState,
                          cardDetails.numIncorrectPinAttempts
                        ),
                      };
                }
                return {
                  status: 'logged_out',
                  reason: validationResult.err(),
                  cardJurisdiction: cardDetails.user?.jurisdiction,
                  cardUserRole: cardDetails.user?.role,
                  machineJurisdiction: machineState.jurisdiction,
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
              const { user, sessionExpiresAt } = currentAuthStatus;
              switch (user.role) {
                case 'vendor': {
                  return { status: 'logged_in', user, sessionExpiresAt };
                }
                case 'system_administrator': {
                  return {
                    status: 'logged_in',
                    user,
                    sessionExpiresAt,
                    programmableCard: cardStatusToProgrammableCard(
                      machineState,
                      action.cardStatus
                    ),
                  };
                }
                case 'election_manager': {
                  return { status: 'logged_in', user, sessionExpiresAt };
                }
                /* istanbul ignore next: Compile-time check for completeness */
                default: {
                  throwIllegalValue(user, 'role');
                }
              }
            }
            return currentAuthStatus;
          }

          case 'logged_in': {
            const { user } = currentAuthStatus;
            if (user.role === 'system_administrator') {
              return {
                ...currentAuthStatus,
                programmableCard: cardStatusToProgrammableCard(
                  machineState,
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
            return {
              status: 'remove_card',
              user: currentAuthStatus.user,
              sessionExpiresAt: computeSessionEndTime(machineState),
            };
          }
          case 'incorrect': {
            return {
              ...currentAuthStatus,
              error: undefined,
              lockedOutUntil: computeCardLockoutEndTime(
                machineState,
                action.checkPinResponse.numIncorrectPinAttempts
              ),
              wrongPinEnteredAt: new Date(),
            };
          }
          case 'error': {
            return {
              ...currentAuthStatus,
              error: {
                error: action.checkPinResponse.error,
                erroredAt: new Date(),
              },
            };
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

      case 'update_session_expiry': {
        if (
          currentAuthStatus.status !== 'remove_card' &&
          currentAuthStatus.status !== 'logged_in'
        ) {
          return currentAuthStatus;
        }
        return {
          ...currentAuthStatus,
          sessionExpiresAt: action.sessionExpiresAt,
        };
      }

      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(action, 'type');
      }
    }
  }

  private validateCard(
    machineState: DippedSmartCardAuthMachineState,
    cardDetails: CardDetails
  ): Result<void, DippedSmartCardAuthTypes.LoggedOut['reason']> {
    if (!cardDetails.user) {
      return err(cardDetails.reason);
    }

    const { user } = cardDetails;

    if (
      machineState.jurisdiction &&
      user.jurisdiction !== machineState.jurisdiction &&
      !areUniversalVendorCardDetails(cardDetails)
    ) {
      return err('wrong_jurisdiction');
    }

    if (
      !['vendor', 'system_administrator', 'election_manager'].includes(
        user.role
      )
    ) {
      return err('user_role_not_allowed');
    }

    if (user.role === 'election_manager') {
      if (!machineState.electionKey) {
        return this.config.allowElectionManagersToAccessUnconfiguredMachines
          ? ok()
          : err('machine_not_configured');
      }
      if (!deepEqual(user.electionKey, machineState.electionKey)) {
        return err('wrong_election');
      }
    }

    return ok();
  }

  private isLockedOut(): boolean {
    return Boolean(
      this.authStatus.status === 'checking_pin' &&
        this.authStatus.lockedOutUntil &&
        new Date() < this.authStatus.lockedOutUntil
    );
  }
}
