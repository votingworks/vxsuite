import fetch from 'node-fetch';
import {
  AnyCardDataSchema,
  Card,
  CardSummary,
  CardSummaryReady,
  DippedSmartCardAuth,
  ElectionDefinition,
  ElectionManagerCardData,
  Optional,
  PollWorkerCardData,
  safeParseJson,
  SystemAdministratorCardData,
  User,
} from '@votingworks/types';
import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
  wrapException,
} from '@votingworks/basics';
import { generatePin } from '@votingworks/utils';

import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthConfig,
} from './dipped_smart_card_auth';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.fetch = fetch;

const CARD_POLLING_INTERVAL_MS = 100;

type AuthAction =
  | { type: 'read_card'; cardSummary: CardSummary }
  | { type: 'check_pin'; pin: string }
  | { type: 'log_out' };

function parseUserFromCardSummary(
  cardSummary: CardSummaryReady
): Optional<User> {
  if (!cardSummary.shortValue) {
    return undefined;
  }

  const cardData = safeParseJson(
    cardSummary.shortValue,
    AnyCardDataSchema
  ).ok();
  if (!cardData) {
    return undefined;
  }

  switch (cardData.t) {
    case 'system_administrator':
      return {
        role: 'system_administrator',
        passcode: cardData.p,
      };
    case 'election_manager':
      return {
        role: 'election_manager',
        electionHash: cardData.h,
        passcode: cardData.p,
      };
    case 'poll_worker':
      return {
        role: 'poll_worker',
        electionHash: cardData.h,
      };
    case 'voter':
      return {
        role: 'voter',
        ballotPrintedAt: cardData.bp,
        ballotStyleId: cardData.bs,
        createdAt: cardData.c,
        markMachineId: cardData.m,
        precinctId: cardData.pr,
        updatedAt: cardData.u,
        voidedAt: cardData.uz,
      };
    /* istanbul ignore next: Compile-time check for completeness */
    default:
      throwIllegalValue(cardData, 't');
  }
}

/**
 * An implementation of the dipped smart card auth API, backed by a memory card
 *
 * Since this is just a stopgap until we implement DippedSmartCardAuthWithJavaCard, I haven't
 * implemented the following:
 * - Locking to avoid concurrent card writes
 * - Logging
 * - Tests
 */
export class DippedSmartCardAuthWithMemoryCard
  implements DippedSmartCardAuthApi
{
  private authStatus: DippedSmartCardAuth.AuthStatus;
  private readonly card: Card;
  private config: DippedSmartCardAuthConfig;

  constructor({
    card,
    config,
  }: {
    card: Card;
    config: Omit<DippedSmartCardAuthConfig, 'electionDefinition'>;
  }) {
    this.authStatus = DippedSmartCardAuth.DefaultAuthStatus;
    this.card = card;
    this.config = config;

    setInterval(
      async () => {
        try {
          const newCardSummary = await this.card.readSummary();
          this.updateAuthStatus({
            type: 'read_card',
            cardSummary: newCardSummary,
          });
        } catch {
          // Swallow errors so that they don't crash the auth instance and containing backend
        }
      },
      CARD_POLLING_INTERVAL_MS,
      true
    );
  }

  getAuthStatus(): DippedSmartCardAuth.AuthStatus {
    return this.authStatus;
  }

  checkPin({ pin }: { pin: string }): void {
    this.updateAuthStatus({ type: 'check_pin', pin });
  }

  logOut(): void {
    this.updateAuthStatus({ type: 'log_out' });
  }

  async programCard({
    userRole,
  }: {
    userRole: 'system_administrator' | 'election_manager' | 'poll_worker';
  }): Promise<Result<{ pin?: string }, Error>> {
    const { electionDefinition } = this.config;
    const electionHash = electionDefinition?.electionHash;
    const electionData = electionDefinition?.electionData;
    const pin = generatePin();
    try {
      switch (userRole) {
        case 'system_administrator': {
          const cardData: SystemAdministratorCardData = {
            t: 'system_administrator',
            p: pin,
          };
          await this.card.overrideWriteProtection();
          await this.card.writeShortValue(JSON.stringify(cardData));
          break;
        }
        case 'election_manager': {
          assert(electionHash !== undefined);
          assert(electionData !== undefined);
          const cardData: ElectionManagerCardData = {
            t: 'election_manager',
            h: electionHash,
            p: pin,
          };
          await this.card.overrideWriteProtection();
          await this.card.writeShortAndLongValues({
            shortValue: JSON.stringify(cardData),
            longValue: electionData,
          });
          break;
        }
        case 'poll_worker': {
          assert(electionHash !== undefined);
          const cardData: PollWorkerCardData = {
            t: 'poll_worker',
            h: electionHash,
          };
          await this.card.overrideWriteProtection();
          await this.card.writeShortValue(JSON.stringify(cardData));
          break;
        }
        /* istanbul ignore next: Compile-time check for completeness */
        default:
          throwIllegalValue(userRole);
      }
      return ok({ pin });
    } catch (error) {
      return wrapException(error);
    }
  }

  async unprogramCard(): Promise<Result<void, Error>> {
    try {
      await this.card.overrideWriteProtection();
      await this.card.writeShortAndLongValues({
        shortValue: '',
        longValue: '',
      });
      return ok();
    } catch (error) {
      return wrapException(error);
    }
  }

  setElectionDefinition(electionDefinition: ElectionDefinition): void {
    this.config.electionDefinition = electionDefinition;
  }

  clearElectionDefinition(): void {
    delete this.config.electionDefinition;
  }

  private updateAuthStatus(action: AuthAction): void {
    this.authStatus = this.determineNewAuthStatus(action);
  }

  private determineNewAuthStatus(
    action: AuthAction
  ): DippedSmartCardAuth.AuthStatus {
    const currentAuthStatus = this.authStatus;
    switch (action.type) {
      case 'read_card': {
        const newAuthStatus = ((): DippedSmartCardAuth.AuthStatus => {
          switch (currentAuthStatus.status) {
            case 'logged_out': {
              switch (action.cardSummary.status) {
                case 'no_card':
                  return { status: 'logged_out', reason: 'machine_locked' };

                case 'error':
                  return { status: 'logged_out', reason: 'card_error' };

                case 'ready': {
                  const user = parseUserFromCardSummary(action.cardSummary);
                  const validationResult = this.validateCardUser(user);
                  if (validationResult.isOk()) {
                    assert(
                      user &&
                        (user.role === 'system_administrator' ||
                          user.role === 'election_manager')
                    );
                    return { status: 'checking_passcode', user };
                  }
                  return {
                    status: 'logged_out',
                    reason: validationResult.err(),
                    cardUserRole: user?.role,
                  };
                }

                /* istanbul ignore next: Compile-time check for completeness */
                default:
                  return throwIllegalValue(action.cardSummary, 'status');
              }
            }

            case 'checking_passcode': {
              if (action.cardSummary.status === 'no_card') {
                return { status: 'logged_out', reason: 'machine_locked' };
              }
              return currentAuthStatus;
            }

            case 'remove_card': {
              if (action.cardSummary.status === 'no_card') {
                const { user } = currentAuthStatus;
                if (user.role === 'system_administrator') {
                  return {
                    status: 'logged_in',
                    user,
                    programmableCard: action.cardSummary,
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
                    action.cardSummary.status === 'ready'
                      ? {
                          status: 'ready',
                          programmedUser: parseUserFromCardSummary(
                            action.cardSummary
                          ),
                        }
                      : action.cardSummary,
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
        assert(currentAuthStatus.status === 'checking_passcode');
        return action.pin === currentAuthStatus.user.passcode
          ? { status: 'remove_card', user: currentAuthStatus.user }
          : { ...currentAuthStatus, wrongPasscodeEnteredAt: new Date() };
      }

      case 'log_out':
        return { status: 'logged_out', reason: 'machine_locked' };

      /* istanbul ignore next: Compile-time check for completeness */
      default:
        throwIllegalValue(action, 'type');
    }
  }

  private validateCardUser(
    user?: User
  ): Result<void, DippedSmartCardAuth.LoggedOut['reason']> {
    if (!user) {
      return err('invalid_user_on_card');
    }

    if (!['system_administrator', 'election_manager'].includes(user.role)) {
      return err('user_role_not_allowed');
    }

    if (user.role === 'election_manager') {
      if (!this.config.electionDefinition) {
        return this.config.allowElectionManagersToAccessUnconfiguredMachines
          ? ok()
          : err('machine_not_configured');
      }
      if (user.electionHash !== this.config.electionDefinition.electionHash) {
        return err('election_manager_wrong_election');
      }
    }

    return ok();
  }
}
