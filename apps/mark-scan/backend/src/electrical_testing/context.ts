import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { TaskController } from '@votingworks/backend';
import { BaseLogger } from '@votingworks/logging';
import { Workspace } from '../util/workspace';

export interface ServerContext {
  auth: InsertedSmartCardAuthApi;
  cardTask: TaskController<string>;
  paperHandlerTask: TaskController<string>;
  logger: BaseLogger;
  workspace: Workspace;
}
