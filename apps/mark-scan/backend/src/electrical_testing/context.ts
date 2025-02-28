import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { BaseLogger } from '@votingworks/logging';

import { Workspace } from '../util/workspace';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  controller: AbortController;
  logger: BaseLogger;
  workspace: Workspace;
}
