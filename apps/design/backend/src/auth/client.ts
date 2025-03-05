import {
  ManagementClient,
  AuthenticationClient,
  UsersByEmailManager,
  ConnectionsManager,
  OrganizationsManager,
  Database,
  UsersManager,
} from 'auth0';
import { assert, assertDefined } from '@votingworks/basics';
import crypto from 'node:crypto';
import {
  auth0ClientDomain,
  auth0ClientId,
  auth0Secret,
  sliOrgId,
  votingWorksOrgId,
} from '../globals';
import { Auth0User, Org, User } from '../types';

export type ConnectionType =
  | 'Username-Password-Authentication'
  | 'google-oauth2';

export interface Connection {
  id: string;
  name: ConnectionType;
}

export interface AuthClientInterface {
  allOrgs(): Promise<Org[]>;
  hasAccess(user: User, orgId: string): boolean;
  org(id: string): Promise<Org>;
  userFromRequest(req: Express.Request): Auth0User | undefined;

  // [TODO] `AuthClient` methods that are currently only used in the user
  // management scripts aren't included here yet. Flesh this out, along with
  // test mocks when we start to add support tooling to the app.
}

export class AuthClient implements AuthClientInterface {
  constructor(
    private readonly connections: ConnectionsManager,
    private readonly database: Database,
    private readonly organizations: OrganizationsManager,
    private readonly users: UsersManager,
    private readonly usersByEmail: UsersByEmailManager
  ) {}

  static init(): AuthClient {
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

    return new AuthClient(
      apiManagement.connections,
      apiAuth.database,
      apiManagement.organizations,
      apiManagement.users,
      apiManagement.usersByEmail
    );
  }

  async addOrgMember(params: {
    userEmail: string;
    orgId: string;
  }): Promise<User> {
    const { userEmail, orgId } = params;

    const deferredOrg = this.org(orgId);
    const userQueryResults = await this.usersByEmail.getByEmail({
      email: userEmail,
    });

    const user = userQueryResults.data[0];
    if (!user) {
      throw new Error('User not found');
    }

    await this.organizations.addMembers(
      { id: orgId },
      { members: [user.user_id] }
    );

    return {
      orgId,
      orgName: (await deferredOrg).displayName,
    };
  }

  async allConnections(): Promise<Connection[]> {
    const res = await this.connections.getAll({});

    return res.data.map((c) => ({
      id: c.id,
      name: c.name as ConnectionType,
    }));
  }

  async allOrgs(): Promise<Org[]> {
    const res = await this.organizations.getAll({
      sort: 'display_name:1',
    });

    return res.data.map<Org>((o) => ({
      displayName: o.display_name,
      id: o.id,
      name: o.name,
    }));
  }

  async connectionByName(
    name: ConnectionType
  ): Promise<{ name: ConnectionType; id: string } | undefined> {
    const res = await this.connections.getAll({ name });

    return res.data.map((c) => ({ id: c.id, name }))[0];
  }

  async createOrg(params: {
    displayName: string;
    enableGoogleAuth?: boolean;
    logoUrl?: string;
  }): Promise<Org> {
    const VX_PURPLE = '#8d24ce';
    const { displayName, enableGoogleAuth, logoUrl } = params;

    // Org `name` in Auth0 is more of a single-slug shortname (`display_name`
    // holds the user-visible org name).
    const name = displayName
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]+/g, '-');

    const connections: Array<{ connection_id: string }> = [];
    for (const c of await this.allConnections()) {
      if (c.name === 'Username-Password-Authentication') {
        connections.push({ connection_id: c.id });
        continue;
      }

      if (enableGoogleAuth && c.name === 'google-oauth2') {
        connections.push({ connection_id: c.id });
      }
    }

    assert(connections.length > 0, 'No Auth0 connection types available.');

    const org = await this.organizations.create({
      branding: {
        logo_url: logoUrl,
        colors: {
          page_background: '#ffffff',
          primary: VX_PURPLE,
        },
      },
      display_name: displayName,
      enabled_connections: connections,
      name,
    });

    return {
      displayName: org.data.display_name,
      id: org.data.id,
      name: org.data.name,
    };
  }

  async createUser(params: {
    connectionType?: ConnectionType;
    userEmail: string;
    orgId: string;
  }): Promise<User> {
    const {
      connectionType = 'Username-Password-Authentication',
      userEmail,
      orgId,
    } = params;

    // Make sure an org exists for this ID.
    const org = await this.org(orgId);

    const tempPassword = crypto.randomBytes(20).toString('base64');
    const user = (
      await this.users.create({
        connection: connectionType,
        email: userEmail,
        password: tempPassword,
      })
    ).data;

    await this.organizations.addMembers(
      { id: org.id },
      { members: [user.user_id] }
    );

    return {
      orgId,
      orgName: org.displayName,
    };
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
    orgId: string;
  }): Promise<void> {
    const {
      connectionType = 'Username-Password-Authentication',
      userEmail,
      orgId,
    } = params;

    await this.database.changePassword({
      connection: connectionType,
      email: userEmail,
      organization: orgId,
    });
  }

  hasAccess(user: User, orgId: string): boolean {
    if (user.orgId === votingWorksOrgId()) {
      return true;
    }

    return user.orgId === orgId;
  }

  async org(id: string): Promise<Org> {
    const res = await this.organizations.get({ id });

    return {
      displayName: res.data.display_name,
      id: res.data.id,
      name: res.data.name,
    };
  }

  userFromRequest(req: Express.Request): Auth0User | undefined {
    return req.oidc.user as Auth0User | undefined;
  }

  async userOrgs(userEmail: string): Promise<Org[]> {
    const userQueryResults = await this.usersByEmail.getByEmail({
      email: userEmail,
    });
    const user = userQueryResults.data[0];
    if (!user) {
      throw new Error('User not found');
    }

    const res = await this.users.getUserOrganizations({
      id: user.user_id,
    });

    return res.data.map<Org>((org) => ({
      displayName: org.display_name,
      id: org.id,
      name: org.name,
    }));
  }

  static dev(): AuthClient {
    // [TEMP] Just allows us to have a stub in place for dev without the need
    // for an Auth0 connection.
    return {
      allOrgs() {
        return Promise.resolve<Org[]>([
          {
            displayName: 'VotingWorks',
            id: votingWorksOrgId(),
            name: 'voting-works',
          },
          {
            displayName: 'SLI',
            id: sliOrgId(),
            name: 'sli',
          },
          {
            displayName: 'City of Testerton',
            id: 'testerton1',
            name: 'city-of-testerton',
          },
        ]);
      },

      hasAccess(user: User, orgId: string): boolean {
        if (user.orgId === votingWorksOrgId()) {
          return true;
        }

        return user.orgId === orgId;
      },

      async org(id: string): Promise<Org | undefined> {
        const orgs = await this.allOrgs();
        return orgs.find((o) => o.id === id);
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      userFromRequest(_: Express.Request): Auth0User | undefined {
        return {
          org_id: votingWorksOrgId(),
        } as const as Auth0User;
      },
    } as const as AuthClient;
  }
}
