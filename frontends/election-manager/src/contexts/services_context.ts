import { Logger, LogSource } from '@votingworks/logging';
import { createContext } from 'react';
import {
  ElectionManagerStoreBackend,
  ElectionManagerStoreMemoryBackend,
} from '../lib/backends';

/**
 * Provides access to various services.
 */
export interface ServicesContextInterface {
  readonly backend: ElectionManagerStoreBackend;
  readonly logger: Logger;
}

/**
 * Concrete implementation of the backend context.
 */
export const ServicesContext = createContext<ServicesContextInterface>({
  backend: new ElectionManagerStoreMemoryBackend(),
  logger: new Logger(LogSource.VxAdminFrontend),
});
