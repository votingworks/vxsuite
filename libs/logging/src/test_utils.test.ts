import { LogEventId } from './log_event_ids';
import { fakeLogger } from './test_utils';

test('fakeLogger returns a logger with a spy on logger.log', async () => {
  const logger = fakeLogger();
  await logger.log(LogEventId.MachineBootInit, 'system');
  expect(logger.log).toHaveBeenCalledWith(LogEventId.MachineBootInit, 'system');
});
