import {
  votingWorksJurisdictionId,
  sliJurisdictionId,
  vxDemosJurisdictionId,
} from '../src/globals';
import { Jurisdiction, User } from '../src/types';

export const vxJurisdiction: Jurisdiction = {
  id: votingWorksJurisdictionId(),
  name: 'VotingWorks',
};
export const vxUser: User = {
  name: 'vx.user@example.com',
  id: 'auth0|vx-user-id',
  jurisdictions: [vxJurisdiction],
};

export const nonVxJurisdiction: Jurisdiction = {
  id: 'other-jurisdiction-id',
  name: 'Other Jurisdiction',
};
export const nonVxUser: User = {
  name: 'non.vx.user@example.com',
  id: 'auth0|non-vx-user-id',
  jurisdictions: [nonVxJurisdiction],
};

export const anotherNonVxJurisdiction: Jurisdiction = {
  id: 'another-jurisdiction-id',
  name: 'Another Jurisdiction',
};
export const anotherNonVxUser: User = {
  ...nonVxUser,
  id: 'auth0|another-non-vx-user-id',
  jurisdictions: [anotherNonVxJurisdiction],
};

export const sliJurisdiction: Jurisdiction = {
  id: sliJurisdictionId(),
  name: 'SLI',
};
export const sliUser: User = {
  name: 'sli.user@example.com',
  id: 'auth0|sli-user-id',
  jurisdictions: [sliJurisdiction],
};

export const vxDemosJurisdiction: Jurisdiction = {
  id: vxDemosJurisdictionId(),
  name: 'VX Demos',
};
export const vxDemosUser: User = {
  name: 'vx.demos.user@example.com',
  id: 'auth0|vx-demos-user-id',
  jurisdictions: [vxDemosJurisdiction],
};

export const jurisdictions: Jurisdiction[] = [
  vxJurisdiction,
  nonVxJurisdiction,
  anotherNonVxJurisdiction,
  sliJurisdiction,
  vxDemosJurisdiction,
];

export const users: User[] = [
  vxUser,
  nonVxUser,
  anotherNonVxUser,
  sliUser,
  vxDemosUser,
];
