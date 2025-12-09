import {
  ManagementClient,
  AuthenticationClient,
  Database,
  UsersManager,
} from 'auth0';
import { assertDefined } from '@votingworks/basics';
import crypto from 'node:crypto';
import { auth0ClientDomain, auth0ClientId, auth0Secret } from './globals';

export type ConnectionType =
  | 'Username-Password-Authentication'
  | 'google-oauth2';

export interface Connection {
  id: string;
  name: ConnectionType;
}

export interface Auth0User {
  email_verified: boolean;
  email: string;
  name: string;
  nickname?: string;
  picture?: string;
  sid: string;
  /**
   * The user's unique ID in Auth0.
   */
  sub: string;
  updated_at: Date;
}

export interface Auth0ClientInterface {
  userIdFromRequest(req: Express.Request): string | undefined;
}

export class Auth0Client implements Auth0ClientInterface {
  constructor(
    private readonly database: Database,
    private readonly users: UsersManager
  ) {}

  static init(): Auth0Client {
    const clientId = assertDefined(auth0ClientId());
    const clientSecret = assertDefined(auth0Secret());
    const domain = assertDefined(auth0ClientDomain());

    const apiManagement = new ManagementClient({
      clientId,
      clientSecret,
      domain,
    });

    const apiAuth = new AuthenticationClient({
      clientId,
      clientSecret,
      domain,
    });

    return new Auth0Client(apiAuth.database, apiManagement.users);
  }

  async createUser(params: {
    connectionType?: ConnectionType;
    userEmail: string;
  }): Promise<string> {
    const { connectionType = 'Username-Password-Authentication', userEmail } =
      params;

    const tempPassword = crypto.randomBytes(20).toString('base64');
    const user = (
      await this.users.create({
        connection: connectionType,
        email: userEmail,
        password: tempPassword,
      })
    ).data;

    return user.user_id;
  }

  /**
   * Triggers a password reset email disguised as a "Welcome" email.
   *
   * See the "Change Password (Link)" template at:
   * https://manage.auth0.com/dashboard/us/vxdesign/templates
   */
  async sendWelcomeEmail(params: {
    connectionType?: ConnectionType;
    userEmail: string;
  }): Promise<void> {
    const { connectionType = 'Username-Password-Authentication', userEmail } =
      params;

    await this.database.changePassword({
      connection: connectionType,
      email: userEmail,
    });
  }

  userIdFromRequest(req: Express.Request): string | undefined {
    const auth0User = req.oidc.user as unknown as Auth0User | undefined;
    if (!auth0User) return;
    return auth0User.sub;
  }

  static dev(): Auth0Client {
    // [TEMP] Just allows us to have a stub in place for dev without the need
    // for an Auth0 connection.
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      userIdFromRequest(_: Express.Request) {
        return 'auth0|devuser';
      },
    } as const as Auth0Client;
  }
}
