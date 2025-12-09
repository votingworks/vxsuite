import {
  votingWorksJurisdictionId,
  sliJurisdictionId,
  vxDemosJurisdictionId,
} from '../src/globals';
import { Jurisdiction, User } from '../src/types';

export const vxOrg: Jurisdiction = {
  id: votingWorksJurisdictionId(),
  name: 'VotingWorks',
};
export const vxUser: User = {
  name: 'vx.user@example.com',
  id: 'auth0|vx-user-id',
  jurisdictions: [vxOrg],
};

export const nonVxOrg: Jurisdiction = {
  id: 'other-org-id',
  name: 'Other Org',
};
export const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  id: 'auth0|non-vx-user-id',
  jurisdictions: [nonVxOrg],
};

export const anotherNonVxOrg: Jurisdiction = {
  id: 'another-org-id',
  name: 'Another Org',
};
export const anotherNonVxUser: User = {
  ...nonVxUser,
  id: 'auth0|another-non-vx-user-id',
  jurisdictions: [anotherNonVxOrg],
};

export const sliOrg: Jurisdiction = {
  id: sliJurisdictionId(),
  name: 'SLI',
};
export const sliUser: User = {
  name: 'sli.user@example.com',
  id: 'auth0|sli-user-id',
  jurisdictions: [sliOrg],
};

export const vxDemosOrg: Jurisdiction = {
  id: vxDemosJurisdictionId(),
  name: 'VX Demos',
};
export const vxDemosUser: User = {
  name: 'vx.demos.user@example.com',
  id: 'auth0|vx-demos-user-id',
  jurisdictions: [vxDemosOrg],
};

export const orgs: Jurisdiction[] = [
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
