import { Optional } from '@votingworks/basics';
import { Auth0ClientInterface } from './auth0_client.js';
import { Store } from './store.js';
import { User } from './types.js';

/**
 * Resolves the VxDesign user making a request. Hosted deployments authenticate
 * users with Auth0; offline deployments have no internet access, so they
 * authenticate users with VxSuite smart cards instead.
 */
export interface AuthClient {
  getUser(request: Express.Request): Promise<Optional<User>>;
}

/**
 * Authenticates users with Auth0, for hosted deployments.
 */
export class Auth0AuthClient implements AuthClient {
  constructor(
    private readonly auth0: Auth0ClientInterface,
    private readonly store: Store
  ) {}

  async getUser(request: Express.Request): Promise<Optional<User>> {
    const userId = this.auth0.userIdFromRequest(request);
    if (!userId) return undefined;
    return await this.store.getUser(userId);
  }
}
