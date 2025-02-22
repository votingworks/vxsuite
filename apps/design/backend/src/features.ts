// Stand-in for a fully-featured feature flag backend implementation

import { sliOrgId, votingWorksOrgId } from './globals';

export function isVxOrSliOrg(orgId: string): boolean {
  return orgId === votingWorksOrgId() || orgId === sliOrgId();
}
