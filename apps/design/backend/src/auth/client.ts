/* istanbul ignore file - TODO @preserve */

import { ManagementClient, AuthenticationClient } from 'auth0';
import { assertDefined } from '@votingworks/basics';
import {
  auth0ClientDomain,
  auth0ClientId,
  auth0Secret,
  sliOrgId,
  votingWorksOrgId,
} from '../globals';
import { Auth0User, Org, User } from '../types';

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

  hasAccess(user: User, orgId: string): boolean {
    if (user.orgId === votingWorksOrgId()) {
      return true;
    }

    return user.orgId === orgId;
  }

  async org(id: string): Promise<Org | undefined> {
    const res = await this.management.organizations.get({ id });
    if (res.status !== 200) {
      return undefined;
    }

    return {
      displayName: res.data.display_name,
      id: res.data.id,
      name: res.data.name,
    };
  }

  userFromRequest(req: Express.Request): Auth0User | undefined {
    return req.oidc.user as Auth0User | undefined;
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
          // org_id: votingWorksOrgId(),
          org_id: sliOrgId(),
        } as const as Auth0User;
      },
    } as const as AuthClient;
  }
}
