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
  Card,
  CardSummary,
  InsertedSmartCardAuth,
  Optional,
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
    this.config = config;
  }

  async getAuthStatus(
    machineState: InsertedSmartCardAuthMachineState
  ): Promise<InsertedSmartCardAuth.AuthStatus> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    return this.authStatus;
  }

  async checkPin(
    machineState: InsertedSmartCardAuthMachineState,
    input: { pin: string }
  ): Promise<void> {
    await this.checkCardReaderAndUpdateAuthStatus(machineState);
    this.updateAuthStatus(machineState, { type: 'check_pin', pin: input.pin });
  }

  readCardData<T>(
    machineState: InsertedSmartCardAuthMachineState,
    input: { schema: z.ZodSchema<T> }
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError | Error>> {
    return this.card.readLongObject(input.schema);
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
        assert(currentAuthStatus.status === 'checking_passcode');
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
      if (!machineState.electionDefinition) {
        return ok();
      }
      if (
        user.electionHash !== machineState.electionDefinition.electionHash &&
        !this.config
          .allowElectionManagersToAccessMachinesConfiguredForOtherElections
      ) {
        return err('election_manager_wrong_election');
      }
    }

    if (user.role === 'poll_worker') {
      if (!machineState.electionDefinition) {
        return err('machine_not_configured');
      }
      if (user.electionHash !== machineState.electionDefinition.electionHash) {
        return err('poll_worker_wrong_election');
      }
    }

    return ok();
  }
}
