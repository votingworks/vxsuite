import { Logger, LogSource } from '@votingworks/logging';
import { createContext } from 'react';

/**
 * Provides access to various services.
 */
export interface ServicesContextInterface {
  readonly logger: Logger;
}

/**
 * Concrete implementation of the backend context.
 */
export const ServicesContext = createContext<ServicesContextInterface>({
  logger: new Logger(LogSource.VxAdminFrontend),
});
