import fetch from 'node-fetch';
import { z } from 'zod';
import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import {
  BallotStyleId,
  Card,
  CardlessVoterUser,
  CardSummary,
  InsertedSmartCardAuth,
  Optional,
  PrecinctId,
  User,
} from '@votingworks/types';

import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthConfig,
  InsertedSmartCardAuthMachineState,
} from './inserted_smart_card_auth';
import { parseUserFromCardSummary } from './memory_card';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.fetch = fetch;

type AuthAction =
  | { type: 'check_card_reader'; cardSummary: CardSummary }
  | { type: 'check_pin'; pin: string };

/**
 * An implementation of the dipped smart card auth API, backed by a memory card
 *
 * Since this is just a stopgap until we implement InsertedSmartCardAuthWithJavaCard, I haven't
 * implemented the following:
 * - Locking to avoid concurrent card writes
 * - Logging
 * - Tests
 */
export class InsertedSmartCardAuthWithMemoryCard
  implements InsertedSmartCardAuthApi
{
  private authStatus: InsertedSmartCardAuth.AuthStatus;
  private readonly card: Card;
  private cardlessVoterUser?: CardlessVoterUser;
  private readonly config: InsertedSmartCardAuthConfig;

  constructor({
    card,
    config,
  }: {
    card: Card;
    config: InsertedSmartCardAuthConfig;
  }) {
    this.authStatus = InsertedSmartCardAuth.DEFAULT_AUTH_STATUS;
    this.card = card;
    this.cardlessVoterUser = undefined;
    this.config = config;
  }

  async getAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<InsertedSmartCardAuth.AuthStatus> {
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
    this.updateAuthStatus(machineState, { type: 'check_pin', pin: input.pin });
  }

  async startCardlessVoterSession(
    machineState: InsertedSmartCardAuthMachineState,
    input: { ballotStyleId: BallotStyleId; precinctId: PrecinctId }
  ): Promise<void> {
    assert(this.config.allowedUserRoles.includes('cardless_voter'));

    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    if (
      this.authStatus.status !== 'logged_in' ||
      this.authStatus.user.role !== 'poll_worker'
    ) {
      return;
    }

    this.cardlessVoterUser = { ...input, role: 'cardless_voter' };
  }

  async endCardlessVoterSession(): Promise<void> {
    assert(this.config.allowedUserRoles.includes('cardless_voter'));

    this.cardlessVoterUser = undefined;
    return Promise.resolve();
  }

  async readCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { schema: z.ZodSchema<T> }
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>> {
    let result: Result<Optional<T>, SyntaxError | z.ZodError | Error>;
    try {
      result = await this.card.readLongObject(input.schema);
    } catch (error) {
      return wrapException(error);
    }
    return result;
  }

  async readCardDataAsString(): Promise<Result<Optional<string>, Error>> {
    let data: Optional<string>;
    try {
      data = await this.card.readLongString();
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
      await this.card.writeLongObject(input.data);
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
      await this.card.writeLongUint8Array(Uint8Array.of());
    } catch (error) {
      return wrapException(error);
    }
    return ok();
  }

  private async checkCardReaderAndUpdateAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ) {
    const cardSummary = await this.card.readSummary();
    this.updateAuthStatus(machineState, {
      type: 'check_card_reader',
      cardSummary,
    });
  }

  private updateAuthStatus(
    machineState: InsertedSmartCardAuthMachineState,
    action: AuthAction
  ): void {
    this.authStatus = this.determineNewAuthStatus(machineState, action);
  }

  private determineNewAuthStatus(
    machineState: InsertedSmartCardAuthMachineState,
    action: AuthAction
  ): InsertedSmartCardAuth.AuthStatus {
    const currentAuthStatus = this.authStatus;

    switch (action.type) {
      case 'check_card_reader': {
        const newAuthStatus = ((): InsertedSmartCardAuth.AuthStatus => {
          switch (action.cardSummary.status) {
            case 'no_card':
              return { status: 'logged_out', reason: 'no_card' };

            case 'error':
              return { status: 'logged_out', reason: 'card_error' };

            case 'ready': {
              const user = parseUserFromCardSummary(action.cardSummary);
              const validationResult = this.validateCardUser(
                machineState,
                user
              );
              if (validationResult.isOk()) {
                assert(user);
                if (currentAuthStatus.status === 'logged_out') {
                  if (
                    user.role === 'system_administrator' ||
                    user.role === 'election_manager'
                  ) {
                    return { status: 'checking_passcode', user };
                  }
                  if (user.role === 'poll_worker') {
                    return { status: 'logged_in', user };
                  }
                  return { status: 'logged_in', user };
                }
                return currentAuthStatus;
              }
              return {
                status: 'logged_out',
                reason: validationResult.err(),
                cardUserRole: user?.role,
              };
            }

            /* istanbul ignore next: Compile-time check for completeness */
            default:
              throwIllegalValue(action.cardSummary, 'status');
          }
        })();

        return newAuthStatus;
      }

      case 'check_pin': {
        if (currentAuthStatus.status !== 'checking_passcode') {
          return currentAuthStatus;
        }
        if (action.pin === currentAuthStatus.user.passcode) {
          if (currentAuthStatus.user.role === 'system_administrator') {
            return { status: 'logged_in', user: currentAuthStatus.user };
          }
          return { status: 'logged_in', user: currentAuthStatus.user };
        }
        return { ...currentAuthStatus, wrongPasscodeEnteredAt: new Date() };
      }

      /* istanbul ignore next: Compile-time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  }

  private validateCardUser(
    machineState: InsertedSmartCardAuthMachineState,
    user?: User
  ): Result<void, InsertedSmartCardAuth.LoggedOut['reason']> {
    if (!user) {
      return err('invalid_user_on_card');
    }

    if (!this.config.allowedUserRoles.includes(user.role)) {
      return err('user_role_not_allowed');
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
    }

    return ok();
  }
}
