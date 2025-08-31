import { describe, expect, test, vi } from 'vitest';
import { iter } from '@votingworks/basics';
import { filterErrorLogs } from './export';

vi.useFakeTimers().setSystemTime(new Date('2020-07-24T00:00:00.000Z'));

describe('filterErrorLogs', () => {
  test('converts basic log as expected', async () => {
    const filteredErrorLogContent = filterErrorLogs(
      iter([
        // Log with NA disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"not an error","disposition":"na"}\n',
        // Log with success disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"not an error","disposition":"success"}\n',
        // Log with failure disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error","disposition":"failure"}\na',
        // Invalid log
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error"}\na',
        // Invalid log
        'this is an invalid log line\n',
      ]).async()
    );
    const results = await iter(filteredErrorLogContent).toArray();
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error","disposition":"failure"}\n'
    );
  });
});
