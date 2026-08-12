import { expect, test, vi } from 'vitest';
import { deferred } from '@votingworks/basics';
import { createSyslogWriter, SYSLOG_TAG } from './syslog.js';

function mockExec() {
  return vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
}

test('writes a log line to the system log', async () => {
  const exec = mockExec();
  const writer = createSyslogWriter({ exec });

  writer.write('{"eventId":"backup-create-init"}');
  await writer.flush();

  expect(exec).toHaveBeenCalledWith('logger', [
    '--tag',
    SYSLOG_TAG,
    '--priority',
    'user.info',
    '--',
    '{"eventId":"backup-create-init"}',
  ]);
});

test('a log line that looks like an option is still logged as a message', async () => {
  const exec = mockExec();
  const writer = createSyslogWriter({ exec });

  writer.write('--help');
  await writer.flush();

  // The `--` is what keeps this from being read as an option to `logger`.
  const [, args] = exec.mock.calls[0]!;
  expect(args[args.length - 2]).toEqual('--');
  expect(args[args.length - 1]).toEqual('--help');
});

test('writes lines in the order they were made', async () => {
  const first = deferred<{ stdout: string; stderr: string }>();
  const written: string[] = [];
  const exec = vi.fn(async (_file: string, args: string[]) => {
    // Hold the first write open, so an implementation that issued writes in
    // parallel would let the second one finish first.
    if (args[args.length - 1] === 'first') {
      await first.promise;
    }
    written.push(args[args.length - 1]!);
    return { stdout: '', stderr: '' };
  });
  const writer = createSyslogWriter({ exec });

  writer.write('first');
  writer.write('second');
  first.resolve({ stdout: '', stderr: '' });
  await writer.flush();

  expect(written).toEqual(['first', 'second']);
});

test('collects failures instead of throwing, so a backup still finishes', async () => {
  const error = new Error('no /dev/log');
  const writer = createSyslogWriter({
    exec: vi.fn().mockRejectedValue(error),
  });

  writer.write('a line');
  writer.write('another line');

  await expect(writer.flush()).resolves.toEqual([error, error]);
});

test('flushing with nothing written reports no failures', async () => {
  const writer = createSyslogWriter({ exec: mockExec() });
  await expect(writer.flush()).resolves.toEqual([]);
});
