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
} from './globals';
import { Org, User } from './types';

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
  org_id: string;
  org_name: string;
  picture?: string;
  sid: string;
  sub: string;
  updated_at: Date;
}

export interface Auth0ClientInterface {
  allOrgs(): Promise<Org[]>;
  userFromRequest(req: Express.Request): Promise<User | undefined>;

  // [TODO] `Auth0Client` methods that are currently only used in the user
  // management scripts aren't included here yet. Flesh this out, along with
  // test mocks when we start to add support tooling to the app.
}

export class Auth0Client implements Auth0ClientInterface {
  constructor(
    private readonly connections: ConnectionsManager,
    private readonly database: Database,
    private readonly organizations: OrganizationsManager,
    private readonly users: UsersManager,
    private readonly usersByEmail: UsersByEmailManager
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

    return new Auth0Client(
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
      name: user.name,
      auth0Id: user.user_id,
      orgId,
      orgName: (await deferredOrg).name,
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
      id: o.id,
      name: o.display_name,
    }));
  }

  async connectionByName(
    name: ConnectionType
  ): Promise<{ name: ConnectionType; id: string } | undefined> {
    const res = await this.connections.getAll({ name });

    return res.data.map((c) => ({ id: c.id, name }))[0];
  }

  async createOrg(params: {
    name: string;
    enableGoogleAuth?: boolean;
    logoUrl?: string;
  }): Promise<Org> {
    const VX_PURPLE = '#8d24ce';
    const { name: displayName, enableGoogleAuth, logoUrl } = params;

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
      name: org.data.display_name,
      id: org.data.id,
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
      name: user.name,
      auth0Id: user.user_id,
      orgId,
      orgName: org.name,
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

  async org(id: string): Promise<Org> {
    const res = await this.organizations.get({ id });

    return {
      id: res.data.id,
      name: res.data.display_name,
    };
  }

  async userFromRequest(req: Express.Request): Promise<User | undefined> {
    const auth0User = req.oidc.user as unknown as Auth0User | undefined;
    if (!auth0User) return;
    const org = await this.org(auth0User.org_id);
    return {
      name: auth0User.name,
      auth0Id: auth0User.sub,
      orgId: org.id,
      orgName: org.name,
    };
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

    return res.data.map((org) => ({
      id: org.id,
      name: org.display_name,
    }));
  }

  static dev(): Auth0Client {
    // [TEMP] Just allows us to have a stub in place for dev without the need
    // for an Auth0 connection.
    return {
      allOrgs() {
        return Promise.resolve<Org[]>([
          {
            id: votingWorksOrgId(),
            name: 'VotingWorks',
          },
          {
            id: sliOrgId(),
            name: 'SLI',
          },
          {
            id: 'testerton1',
            name: 'City of Testerton',
          },
        ]);
      },

      async org(id: string): Promise<Org | undefined> {
        const orgs = await this.allOrgs();
        return orgs.find((o) => o.id === id);
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      userFromRequest(_: Express.Request) {
        return Promise.resolve({
          orgId: votingWorksOrgId(),
          orgName: 'VotingWorks',
        });
      },
    } as const as Auth0Client;
  }
}
