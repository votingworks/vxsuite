import { votingWorksOrganizationId, sliOrganizationId } from '../src/globals';
import { Jurisdiction, Organization, User } from '../src/types';

export const vxOrganization: Organization = {
  id: votingWorksOrganizationId(),
  name: 'VotingWorks Organization',
};
export const nonVxOrganization: Organization = {
  id: 'other-org-id',
  name: 'Other Organization',
};
export const sliOrganization: Organization = {
  id: sliOrganizationId(),
  name: 'SLI Organization',
};

export const vxJurisdiction: Jurisdiction = {
  id: 'vx-jurisdiction-id',
  name: 'VotingWorks',
  stateCode: 'DEMO',
  organization: vxOrganization,
};
export const vxUser: User = {
  name: 'vx.user@example.com',
  id: 'auth0|vx-user-id',
  organization: vxOrganization,
  jurisdictions: [vxJurisdiction],
};

export const nonVxJurisdiction: Jurisdiction = {
  id: 'other-jurisdiction-id',
  name: 'Other Jurisdiction',
  stateCode: 'DEMO',
  organization: nonVxOrganization,
};
export const nhJurisdiction: Jurisdiction = {
  id: 'nh-jurisdiction-id',
  name: 'New Hampshire Jurisdiction',
  stateCode: 'NH',
  organization: nonVxOrganization,
};
export const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  id: 'auth0|non-vx-user-id',
  organization: nonVxOrganization,
  jurisdictions: [nonVxJurisdiction, nhJurisdiction],
};

export const anotherNonVxJurisdiction: Jurisdiction = {
  id: 'another-jurisdiction-id',
  name: 'Another Jurisdiction',
  stateCode: 'DEMO',
  organization: nonVxOrganization,
};
export const msJurisdiction: Jurisdiction = {
  id: 'ms-jurisdiction-id',
  name: 'Mississippi Jurisdiction',
  stateCode: 'MS',
  organization: nonVxOrganization,
};
export const anotherNonVxUser: User = {
  ...nonVxUser,
  id: 'auth0|another-non-vx-user-id',
  jurisdictions: [anotherNonVxJurisdiction, msJurisdiction],
};

export const sliJurisdiction: Jurisdiction = {
  id: 'sli-jurisdiction-id',
  name: 'SLI',
  stateCode: 'DEMO',
  organization: sliOrganization,
};
export const sliUser: User = {
  name: 'sli.user@example.com',
  id: 'auth0|sli-user-id',
  organization: sliOrganization,
  jurisdictions: [sliJurisdiction],
};

export const organizations: Organization[] = [
  vxOrganization,
  nonVxOrganization,
  sliOrganization,
];

export const jurisdictions: Jurisdiction[] = [
  vxJurisdiction,
  nonVxJurisdiction,
  anotherNonVxJurisdiction,
  sliJurisdiction,
  nhJurisdiction,
  msJurisdiction,
];

export const users: User[] = [vxUser, nonVxUser, anotherNonVxUser, sliUser];
