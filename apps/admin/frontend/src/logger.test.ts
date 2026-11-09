import { expect, test, vi } from 'vitest';
import { LogEventId } from '@votingworks/logging';
import { logger, reportUnexpectedError } from './logger.js';

test('reportUnexpectedError logs the error', () => {
  const log = vi.spyOn(logger, 'log');
  const error = new Error('bad image');

  reportUnexpectedError(error, { action: 'normalizeToSvg' });
  reportUnexpectedError('bad file', { action: 'normalizeToSvg' });

  expect(log).toHaveBeenNthCalledWith(1, LogEventId.UnknownError, 'system', {
    message: 'Unexpected error during normalizeToSvg: bad image',
    stack: error.stack,
    disposition: 'failure',
  });
  expect(log).toHaveBeenNthCalledWith(2, LogEventId.UnknownError, 'system', {
    message: 'Unexpected error during normalizeToSvg: bad file',
    stack: undefined,
    disposition: 'failure',
  });
});
