/* istanbul ignore file - TODO @preserve */

import { KnownOrgId, Auth0User, User } from '../types';

export function userFromRequest(req: Express.Request): Auth0User | undefined {
  return req.oidc.user as Auth0User | undefined;
}

export function hasAccess(user: User, orgId: string): boolean {
  if (user.orgId === KnownOrgId.VOTING_WORKS) {
    return true;
  }

  return user.orgId === orgId;
}
