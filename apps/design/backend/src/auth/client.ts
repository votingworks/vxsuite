/* istanbul ignore file - TODO @preserve */

import { ManagementClient, AuthenticationClient } from 'auth0';
import { assertDefined } from '@votingworks/basics';
import crypto from 'node:crypto';
import {
  auth0ClientDomain,
  auth0ClientId,
  auth0Secret,
  sliOrgId,
  votingWorksOrgId,
} from '../globals';
import { Auth0User, Org, User } from '../types';

type ConnectionType = 'Username-Password-Authentication' | 'google-oauth2';

export class AuthClient {
  constructor(
    private readonly management: ManagementClient,
    private readonly authn: AuthenticationClient
  ) {}

  static init(): AuthClient {
    const clientId = assertDefined(auth0ClientId());
    const clientSecret = assertDefined(auth0Secret());
    const domain = assertDefined(auth0ClientDomain());

    return new AuthClient(
      new ManagementClient({ clientId, clientSecret, domain }),
      new AuthenticationClient({ clientId, clientSecret, domain })
    );
  }

  async addOrgMember(params: {
    userEmail: string;
    orgId: string;
  }): Promise<User> {
    const { userEmail, orgId } = params;

    const deferredOrg = this.org(orgId);
    const userQueryResults = await this.management.usersByEmail.getByEmail({
      email: userEmail,
    });
    const user = userQueryResults.data[0];
    if (!user) {
      throw new Error('User not found');
    }

    await this.management.organizations.addMembers(
      { id: orgId },
      { members: [user.user_id] }
    );

    return {
      orgId,
      orgName: (await deferredOrg).displayName,
    };
  }

  async allConnections(): Promise<Array<{ name: ConnectionType; id: string }>> {
    const res = await this.management.connections.getAll({});

    return res.data.map((c) => ({
      id: c.id,
      name: c.name as ConnectionType,
    }));
  }

  async allOrgs(): Promise<Org[]> {
    const res = await this.management.organizations.getAll({
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
    const res = await this.management.connections.getAll({ name });

    return res.data.map((c) => ({ id: c.id, name }))[0];
  }

  async createOrg(params: {
    colorBgHex?: string;
    colorPrimaryHex?: string;
    displayName: string;
    enableGoogleAuth?: boolean;
    logoUrl?: string;
  }): Promise<Org> {
    const VX_PURPLE = '#8d24ce';
    const {
      colorBgHex = '#ffffff',
      colorPrimaryHex = VX_PURPLE,
      displayName,
      enableGoogleAuth,
      logoUrl,
    } = params;
    const name = displayName
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]+/g, '-');

    const connections = (await this.allConnections()).filter((c) => {
      if (c.name === 'Username-Password-Authentication') {
        return true;
      }

      if (enableGoogleAuth && c.name === 'google-oauth2') {
        return true;
      }

      return false;
    });

    const res = await this.management.organizations.create({
      name,
      display_name: displayName,
      enabled_connections: connections.map((c) => ({ connection_id: c.id })),
      branding: {
        logo_url: logoUrl,
        colors: {
          page_background: colorBgHex,
          primary: colorPrimaryHex,
        },
      },
    });

    const org = res.data;
    return {
      displayName: org.display_name,
      id: org.id,
      name: org.name,
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

    const tempPassword = crypto.randomBytes(20).toString('base64');

    const org = await this.org(orgId);

    const user = (
      await this.management.users.create({
        connection: connectionType,
        email: userEmail,
        password: tempPassword,
      })
    ).data;

    await this.management.organizations.addMembers(
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

    await this.authn.database.changePassword({
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
    const res = await this.management.organizations.get({ id });

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
    const userQueryResults = await this.management.usersByEmail.getByEmail({
      email: userEmail,
    });
    const user = userQueryResults.data[0];
    if (!user) {
      throw new Error('User not found');
    }

    const res = await this.management.users.getUserOrganizations({
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
