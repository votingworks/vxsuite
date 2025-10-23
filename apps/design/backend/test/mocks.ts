import { votingWorksOrgId, sliOrgId, vxDemosOrgId } from '../src/globals';
import { Org, User } from '../src/types';

export const vxOrg: Org = {
  id: votingWorksOrgId(),
  name: 'VotingWorks',
};
export const vxUser: User = {
  name: 'vx.user@example.com',
  auth0Id: 'auth0|vx-user-id',
  orgId: vxOrg.id,
};

export const nonVxOrg: Org = {
  id: 'other-org-id',
  name: 'Other Org',
};
export const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  auth0Id: 'auth0|non-vx-user-id',
  orgId: nonVxOrg.id,
};

export const anotherNonVxOrg: Org = {
  id: 'another-org-id',
  name: 'Another Org',
};
export const anotherNonVxUser: User = {
  ...nonVxUser,
  auth0Id: 'auth0|another-non-vx-user-id',
  orgId: anotherNonVxOrg.id,
};

export const sliOrg: Org = {
  id: sliOrgId(),
  name: 'SLI',
};
export const sliUser: User = {
  name: 'sli.user@example.com',
  auth0Id: 'auth0|sli-user-id',
  orgId: sliOrg.id,
};

export const vxDemosOrg: Org = {
  id: vxDemosOrgId(),
  name: 'VX Demos',
};
export const vxDemosUser: User = {
  name: 'vx.demos.user@example.com',
  auth0Id: 'auth0|vx-demos-user-id',
  orgId: vxDemosOrg.id,
};

export const orgs: Org[] = [
  vxOrg,
  nonVxOrg,
  anotherNonVxOrg,
  sliOrg,
  vxDemosOrg,
];
