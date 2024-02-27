import { Buffer } from 'buffer';
import { z } from 'zod';
import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Optional,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  LogDispositionStandardTypes,
  LogEventId,
  BaseLogger,
} from '@votingworks/logging';
import {
  BallotStyleId,
  CardlessVoterUser,
  InsertedSmartCardAuth as InsertedSmartCardAuthTypes,
  PrecinctId,
  safeParseJson,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import {
  arePollWorkerCardDetails,
  Card,
  CardDetails,
  CardStatus,
  CheckPinResponse,
} from './card';
import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthConfig,
  InsertedSmartCardAuthMachineState,
} from './inserted_smart_card_auth_api';
import { computeCardLockoutEndTime } from './lockout';
import { computeSessionEndTime } from './sessions';

type CheckPinResponseExtended = CheckPinResponse | { response: 'error' };

type AuthAction =
  | { type: 'check_card_reader'; cardStatus: CardStatus }
  | { type: 'check_pin'; checkPinResponse: CheckPinResponseExtended }
  | { type: 'log_out' }
  | {
      type: 'update_session_expiry';
      sessionExpiresAt: Date;
    };

/**
 * Given a previous auth status and a new auth status following an auth status transition, infers
 * and logs the relevant auth event, if any
 */
async function logAuthEvent(
  previousAuthStatus: InsertedSmartCardAuthTypes.AuthStatus,
  newAuthStatus: InsertedSmartCardAuthTypes.AuthStatus,
  logger: BaseLogger
) {
  switch (previousAuthStatus.status) {
    case 'logged_out': {
      if (
        previousAuthStatus.reason === 'no_card' &&
        newAuthStatus.status === 'logged_out' &&
        newAuthStatus.reason !== 'no_card'
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
      } else if (newAuthStatus.status === 'logged_in') {
        await logger.log(LogEventId.AuthLogin, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User logged in.',
        });
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
          previousAuthStatus.wrongPinEnteredAt !==
            newAuthStatus.wrongPinEnteredAt
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
      } else if (newAuthStatus.status === 'logged_in') {
        await logger.log(LogEventId.AuthPinEntry, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User entered correct PIN.',
        });
        await logger.log(LogEventId.AuthLogin, newAuthStatus.user.role, {
          disposition: LogDispositionStandardTypes.Success,
          message: 'User logged in.',
        });
      }
      // PIN check errors are logged in checkPin, where we have access to the full error message
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
 * The implementation of the inserted smart card auth API
 */
export class InsertedSmartCardAuth implements InsertedSmartCardAuthApi {
  private authStatus: InsertedSmartCardAuthTypes.AuthStatus;
  private readonly card: Card;
  private cardlessVoterUser?: CardlessVoterUser;
  private readonly config: InsertedSmartCardAuthConfig;
  private readonly logger: BaseLogger;

  constructor(input: {
    card: Card;
    config: InsertedSmartCardAuthConfig;
    logger: BaseLogger;
  }) {
    this.authStatus = InsertedSmartCardAuthTypes.DEFAULT_AUTH_STATUS;
    this.card = input.card;
    this.cardlessVoterUser = undefined;
    this.config = input.config;
    this.logger = input.logger;
  }

  async getAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<InsertedSmartCardAuthTypes.AuthStatus> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);

    // Cardless voter session has been started, but poll worker hasn't removed their card yet
    if (
      this.authStatus.status === 'logged_in' &&
      this.authStatus.user.role === 'poll_worker' &&
      this.cardlessVoterUser
    ) {
      return {
        ...this.authStatus,
        cardlessVoterUser: this.cardlessVoterUser,
      };
    }

    // Cardless voter session has been started, and poll worker has removed their card
    if (
      this.authStatus.status === 'logged_out' &&
      this.authStatus.reason === 'no_card' &&
      this.cardlessVoterUser
    ) {
      return {
        status: 'logged_in',
        user: this.cardlessVoterUser,
        sessionExpiresAt: computeSessionEndTime(machineState),
      };
    }

    return this.authStatus;
  }

  async checkPin(
    machineState: InsertedSmartCardAuthMachineState,
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

  async logOut(machineState: InsertedSmartCardAuthMachineState): Promise<void> {
    await this.updateAuthStatus(machineState, { type: 'log_out' });
  }

  async updateSessionExpiry(
    machineState: InsertedSmartCardAuthMachineState,
    input: { sessionExpiresAt: Date }
  ): Promise<void> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    await this.updateAuthStatus(machineState, {
      type: 'update_session_expiry',
      sessionExpiresAt: input.sessionExpiresAt,
    });
  }

  async startCardlessVoterSession(
    machineState: InsertedSmartCardAuthMachineState,
    input: { ballotStyleId: BallotStyleId; precinctId: PrecinctId }
  ): Promise<void> {
    assert(this.config.allowCardlessVoterSessions);
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (
      this.authStatus.status !== 'logged_in' ||
      this.authStatus.user.role !== 'poll_worker'
    ) {
      return;
    }

    this.cardlessVoterUser = { ...input, role: 'cardless_voter' };

    await this.logger.log(LogEventId.AuthLogin, 'cardless_voter', {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session started.',
    });
  }

  async updateCardlessVoterBallotStyle(input: {
    ballotStyleId: BallotStyleId;
  }): Promise<void> {
    assert(this.config.allowCardlessVoterSessions);
    assert(this.cardlessVoterUser);

    const previousBallotStyleId = this.cardlessVoterUser.ballotStyleId;
    if (previousBallotStyleId === input.ballotStyleId) {
      return;
    }

    this.cardlessVoterUser = { ...this.cardlessVoterUser, ...input };

    await this.logger.log(
      LogEventId.AuthVoterSessionUpdated,
      'cardless_voter',
      {
        disposition: LogDispositionStandardTypes.Success,
        message: `Cardless voter ballot style updated from ${previousBallotStyleId} to ${input.ballotStyleId}.`,
      }
    );
  }

  async endCardlessVoterSession(): Promise<void> {
    assert(this.config.allowCardlessVoterSessions);

    this.cardlessVoterUser = undefined;

    await this.logger.log(LogEventId.AuthLogout, 'cardless_voter', {
      disposition: LogDispositionStandardTypes.Success,
      message: 'Cardless voter session ended.',
    });
  }

  async readCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { schema: z.ZodSchema<T> }
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>> {
    let result: Result<Optional<T>, SyntaxError | z.ZodError | Error>;
    try {
      const data = (await this.card.readData()).toString('utf-8') || undefined;
      result = data ? safeParseJson(data, input.schema) : ok(undefined);
    } catch (error) {
      return wrapException(error);
    }
    return result;
  }

  async readCardDataAsString(): Promise<Result<Optional<string>, Error>> {
    let data: Optional<string>;
    try {
      data = (await this.card.readData()).toString('utf-8') || undefined;
    } catch (error) {
      return wrapException(error);
    }
    return ok(data);
  }

  async writeCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { data: T; schema: z.ZodSchema<T> }
  ): Promise<Result<void, Error>> {
    try {
      await this.card.writeData(
        Buffer.from(JSON.stringify(input.data), 'utf-8')
      );
    } catch (error) {
      return wrapException(error);
    }

    // Verify that the write was in fact successful by reading the data
    const readResult = await this.readCardData(machineState, {
      schema: input.schema,
    });
    if (readResult.isErr()) {
      return err(new Error('Verification of write by reading data failed'));
    }

    return ok();
  }

  async clearCardData(): Promise<Result<void, Error>> {
    try {
      await this.card.clearData();
    } catch (error) {
      return wrapException(error);
    }
    return ok();
  }

  private async checkCardReaderAndUpdateAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<void> {
    const cardStatus = await this.card.getCardStatus();
    await this.updateAuthStatus(machineState, {
      type: 'check_card_reader',
      cardStatus,
    });
  }

  private async updateAuthStatus(
    machineState: InsertedSmartCardAuthMachineState,
    action: AuthAction
  ): Promise<void> {
    const previousAuthStatus = this.authStatus;
    this.authStatus = this.determineNewAuthStatus(machineState, action);
    await logAuthEvent(previousAuthStatus, this.authStatus, this.logger);
  }

  private determineNewAuthStatus(
    machineState: InsertedSmartCardAuthMachineState,
    action: AuthAction
  ): InsertedSmartCardAuthTypes.AuthStatus {
    const currentAuthStatus: InsertedSmartCardAuthTypes.AuthStatus =
      this.authStatus.status === 'logged_in' &&
      new Date() >= this.authStatus.sessionExpiresAt
        ? { status: 'logged_out', reason: 'no_card' }
        : this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        switch (action.cardStatus.status) {
          case 'no_card_reader':
            return { status: 'logged_out', reason: 'no_card_reader' };
          // TODO: Consider an alternative screen on the frontend for unknown errors
          case 'no_card':
          case 'unknown_error': {
            return { status: 'logged_out', reason: 'no_card' };
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
              assert(cardDetails !== undefined);
              const { user } = cardDetails;
              if (currentAuthStatus.status === 'logged_out') {
                const skipPinEntry = isFeatureFlagEnabled(
                  BooleanEnvironmentVariableName.SKIP_PIN_ENTRY
                );
                const sessionExpiresAt = computeSessionEndTime(machineState);
                const lockedOutUntil = computeCardLockoutEndTime(
                  machineState,
                  cardDetails.numIncorrectPinAttempts
                );
                switch (user.role) {
                  case 'system_administrator': {
                    return skipPinEntry
                      ? { status: 'logged_in', user, sessionExpiresAt }
                      : { status: 'checking_pin', user, lockedOutUntil };
                  }
                  case 'election_manager': {
                    return skipPinEntry
                      ? { status: 'logged_in', user, sessionExpiresAt }
                      : { status: 'checking_pin', user, lockedOutUntil };
                  }
                  case 'poll_worker': {
                    if (skipPinEntry) {
                      return { status: 'logged_in', user, sessionExpiresAt };
                    }
                    return machineState.arePollWorkerCardPinsEnabled
                      ? { status: 'checking_pin', user, lockedOutUntil }
                      : { status: 'logged_in', user, sessionExpiresAt };
                  }
                  /* istanbul ignore next: Compile-time check for completeness */
                  default: {
                    throwIllegalValue(user, 'role');
                  }
                }
              }
              return currentAuthStatus;
            }
            return {
              status: 'logged_out',
              reason: validationResult.err(),
              cardJurisdiction: cardDetails?.user.jurisdiction,
              cardUserRole: cardDetails?.user.role,
              machineJurisdiction: machineState.jurisdiction,
            };
          }
          /* istanbul ignore next: Compile-time check for completeness */
          default: {
            return throwIllegalValue(action.cardStatus, 'status');
          }
        }
      }

      case 'check_pin': {
        if (currentAuthStatus.status !== 'checking_pin') {
          return currentAuthStatus;
        }
        switch (action.checkPinResponse.response) {
          case 'correct': {
            const sessionExpiresAt = computeSessionEndTime(machineState);
            if (currentAuthStatus.user.role === 'system_administrator') {
              return {
                status: 'logged_in',
                user: currentAuthStatus.user,
                sessionExpiresAt,
              };
            }
            if (currentAuthStatus.user.role === 'election_manager') {
              return {
                status: 'logged_in',
                user: currentAuthStatus.user,
                sessionExpiresAt,
              };
            }
            return {
              status: 'logged_in',
              user: currentAuthStatus.user,
              sessionExpiresAt,
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
            return { ...currentAuthStatus, error: true };
          }
          /* istanbul ignore next: Compile-time check for completeness */
          default: {
            return throwIllegalValue(action.checkPinResponse, 'response');
          }
        }
      }

      case 'log_out': {
        return { status: 'logged_out', reason: 'no_card' };
      }

      case 'update_session_expiry': {
        if (currentAuthStatus.status !== 'logged_in') {
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
    machineState: InsertedSmartCardAuthMachineState,
    cardDetails?: CardDetails
  ): Result<void, InsertedSmartCardAuthTypes.LoggedOut['reason']> {
    if (!cardDetails) {
      return err('invalid_user_on_card');
    }

    const { user } = cardDetails;

    if (
      machineState.jurisdiction &&
      user.jurisdiction !== machineState.jurisdiction
    ) {
      return err('wrong_jurisdiction');
    }

    if (user.role === 'election_manager') {
      if (!machineState.electionHash) {
        return ok();
      }
      if (
        user.electionHash !== machineState.electionHash &&
        !this.config
          .allowElectionManagersToAccessMachinesConfiguredForOtherElections
      ) {
        return err('wrong_election');
      }
    }

    if (user.role === 'poll_worker') {
      if (!machineState.electionHash) {
        return err('machine_not_configured');
      }
      if (user.electionHash !== machineState.electionHash) {
        return err('wrong_election');
      }
      // If a poll worker card doesn't have a PIN but poll worker card PINs are enabled, treat the
      // card as unprogrammed. And vice versa. If a poll worker card does have a PIN but poll
      // worker card PINs are not enabled, also treat the card as unprogrammed.
      assert(arePollWorkerCardDetails(cardDetails));
      if (
        cardDetails.hasPin !==
        Boolean(machineState.arePollWorkerCardPinsEnabled)
      ) {
        return err('invalid_user_on_card');
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
