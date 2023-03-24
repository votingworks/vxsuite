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
  Logger,
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

type CheckPinResponseExtended = CheckPinResponse | { response: 'error' };

type AuthAction =
  | { type: 'check_card_reader'; cardStatus: CardStatus }
  | { type: 'check_pin'; checkPinResponse: CheckPinResponseExtended };

/**
 * Given a previous auth status and a new auth status following an auth status transition, infers
 * and logs the relevant auth event, if any
 */
async function logAuthEvent(
  previousAuthStatus: InsertedSmartCardAuthTypes.AuthStatus,
  newAuthStatus: InsertedSmartCardAuthTypes.AuthStatus,
  logger: Logger
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
 * An implementation of the inserted smart card auth API.
 *
 * See the libs/auth README for notes on error handling.
 */
export class InsertedSmartCardAuth implements InsertedSmartCardAuthApi {
  private authStatus: InsertedSmartCardAuthTypes.AuthStatus;
  private readonly card: Card;
  private cardlessVoterUser?: CardlessVoterUser;
  private readonly config: InsertedSmartCardAuthConfig;
  private readonly logger: Logger;

  constructor(input: {
    card: Card;
    config: InsertedSmartCardAuthConfig;
    logger: Logger;
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
    const currentAuthStatus = this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        switch (action.cardStatus.status) {
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
                const lockedOutUntil = computeCardLockoutEndTime(
                  machineState,
                  cardDetails.numIncorrectPinAttempts
                )?.getTime();
                switch (user.role) {
                  case 'system_administrator': {
                    return skipPinEntry
                      ? { status: 'logged_in', user }
                      : { status: 'checking_pin', user, lockedOutUntil };
                  }
                  case 'election_manager': {
                    return skipPinEntry
                      ? { status: 'logged_in', user }
                      : { status: 'checking_pin', user, lockedOutUntil };
                  }
                  case 'poll_worker': {
                    if (skipPinEntry) {
                      return { status: 'logged_in', user };
                    }
                    return machineState.arePollWorkerCardPinsEnabled
                      ? { status: 'checking_pin', user, lockedOutUntil }
                      : { status: 'logged_in', user };
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
              cardUserRole: cardDetails?.user.role,
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
            if (currentAuthStatus.user.role === 'system_administrator') {
              return { status: 'logged_in', user: currentAuthStatus.user };
            }
            if (currentAuthStatus.user.role === 'election_manager') {
              return { status: 'logged_in', user: currentAuthStatus.user };
            }
            return { status: 'logged_in', user: currentAuthStatus.user };
          }
          case 'incorrect': {
            return {
              ...currentAuthStatus,
              error: undefined,
              lockedOutUntil: computeCardLockoutEndTime(
                machineState,
                action.checkPinResponse.numIncorrectPinAttempts
              )?.getTime(),
              wrongPinEnteredAt: new Date().getTime(),
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

    const { jurisdiction, user } = cardDetails;

    if (
      machineState.jurisdiction &&
      jurisdiction !== machineState.jurisdiction
    ) {
      return err('invalid_user_on_card');
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
        return err('election_manager_wrong_election');
      }
    }

    if (user.role === 'poll_worker') {
      if (!machineState.electionHash) {
        return err('machine_not_configured');
      }
      if (user.electionHash !== machineState.electionHash) {
        return err('poll_worker_wrong_election');
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
        new Date().getTime() < this.authStatus.lockedOutUntil
    );
  }
}
