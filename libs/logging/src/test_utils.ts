import { Logger } from './logger';
import { LogSource } from './log_source';

export function fakeLogger(logSource: LogSource = LogSource.System): Logger {
  const logger = new Logger(logSource);
  jest.spyOn(logger, 'log').mockResolvedValue();
  return logger;
}
