import { votingWorksOrgId, sliOrgId, vxDemosOrgId } from '../src/globals';
import { Org, User } from '../src/types';

export const vxOrg: Org = {
  id: votingWorksOrgId(),
  name: 'VotingWorks',
};
export const vxUser: User = {
  name: 'vx.user@example.com',
  id: 'auth0|vx-user-id',
  organizations: [vxOrg],
};

export const nonVxOrg: Org = {
  id: 'other-org-id',
  name: 'Other Org',
};
export const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  id: 'auth0|non-vx-user-id',
  organizations: [nonVxOrg],
};

export const anotherNonVxOrg: Org = {
  id: 'another-org-id',
  name: 'Another Org',
};
export const anotherNonVxUser: User = {
  ...nonVxUser,
  id: 'auth0|another-non-vx-user-id',
  organizations: [anotherNonVxOrg],
};

export const sliOrg: Org = {
  id: sliOrgId(),
  name: 'SLI',
};
export const sliUser: User = {
  name: 'sli.user@example.com',
  id: 'auth0|sli-user-id',
  organizations: [sliOrg],
};

export const vxDemosOrg: Org = {
  id: vxDemosOrgId(),
  name: 'VX Demos',
};
export const vxDemosUser: User = {
  name: 'vx.demos.user@example.com',
  id: 'auth0|vx-demos-user-id',
  organizations: [vxDemosOrg],
};

export const orgs: Org[] = [
  vxOrg,
  nonVxOrg,
  anotherNonVxOrg,
  sliOrg,
  vxDemosOrg,
];

export const users: User[] = [
  vxUser,
  nonVxUser,
  anotherNonVxUser,
  sliUser,
  vxDemosUser,
];
