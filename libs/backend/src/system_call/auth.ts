import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

/** A type for a closure that returns the current auth status */
export type GetAuthStatus = () => Promise<
  DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
> | null;
