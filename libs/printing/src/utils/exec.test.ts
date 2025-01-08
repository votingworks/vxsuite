import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { err, iter, ok, sleep } from '@votingworks/basics';
import { exec } from './exec';

const argsWorkerPath = join(__dirname, '../../test/args_worker.js');
const echoWorkerPath = join(__dirname, '../../test/echo_worker.js');

test('command with no args', async () => {
  const execPromise = exec('date');
  expect(await execPromise).toEqual(
    ok({
      stdout: expect.stringMatching(/\d+/),
      stderr: '',
    })
  );
});

test('command with args', async () => {
  const execPromise = exec('node', [argsWorkerPath, 'foo', 'bar']);
  expect(await execPromise).toEqual(
    ok({ stdout: '["foo","bar"]', stderr: '' })
  );
});

test('failed command printing stderr', async () => {
  const execPromise = exec('sh', ['-c', 'echo "hello" >&2; exit 1']);
  expect(await execPromise).toEqual(
    err(
      expect.objectContaining({
        stderr: 'hello\n',
        code: 1,
      })
    )
  );
});

test.each([
  {
    name: 'command with string stdin',
    stdin: 'foobarbaz to print',
  },
  {
    name: 'command with buffer stdin',
    stdin: Buffer.from('foobarbaz to print'),
  },
  {
    name: 'command with stream stdin',
    stdin: Readable.from(
      (async function* gen() {
        yield 'foo';
        yield 'bar';
        await sleep(1);
        yield 'baz';
        yield ' to print';
      })()
    ),
  },
  {
    name: 'command with async iterable stdin',
    stdin: (async function* gen() {
      yield 'foo';
      yield 'bar';
      await sleep(1);
      yield 'baz';
      yield ' to print';
    })(),
  },
  {
    name: 'command with iterable stdin',
    stdin: iter(['foo', 'bar', 'baz']).chain([' to print']),
  },
])('$name', async ({ stdin }) => {
  const execPromise = exec('node', [echoWorkerPath], stdin);
  expect(await execPromise).toEqual(
    ok({
      stdout: 'foobarbaz to print',
      stderr: '',
    })
  );
});
