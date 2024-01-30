import { Logger } from './logger';
import { LogSource } from './base_types/log_source';

export function fakeLogger(logSource: LogSource = LogSource.System): Logger {
  const logger = new Logger(logSource);
  logger.log = jest.fn().mockResolvedValue(undefined);
  return logger;
}
