import { runCli } from '../../../test/utils';

test('print help when no args given', async () => {
  expect(await runCli([])).toEqual({
    code: -1,
    stdout: expect.stringContaining('ballot-interpreter-vx COMMAND'),
    stderr: '',
  });
});

test('print general help via help command', async () => {
  expect(await runCli(['help'])).toEqual({
    code: 0,
    stdout: expect.stringContaining('ballot-interpreter-vx COMMAND'),
    stderr: '',
  });
});

test('print general help via global flag', async () => {
  expect(await runCli(['-h'])).toEqual({
    code: 0,
    stdout: expect.stringContaining('ballot-interpreter-vx COMMAND'),
    stderr: '',
  });
});

test('help command help', async () => {
  expect(await runCli(['help', '-h'])).toEqual({
    code: 0,
    stdout: expect.stringContaining('ballot-interpreter-vx help COMMAND'),
    stderr: '',
  });
});

test('interpret command help', async () => {
  expect(await runCli(['help', 'interpret'])).toEqual({
    code: 0,
    stdout: expect.stringContaining(
      'ballot-interpreter-vx interpret -e JSON IMG1 [IMG2 …]'
    ),
    stderr: '',
  });
});

test('layout command help', async () => {
  expect(await runCli(['help', 'layout'])).toEqual({
    code: 0,
    stdout: expect.stringContaining(
      'ballot-interpreter-vx layout IMG1 [IMG2 …]'
    ),
    stderr: '',
  });
});

test('unknown command via global', async () => {
  expect(await runCli(['nope'])).toEqual({
    code: -1,
    stdout: '',
    stderr: 'error: Unknown command: nope\n',
  });
});

test('unknown command via help', async () => {
  expect(await runCli(['help', 'nope'])).toEqual({
    code: 1,
    stdout: '',
    stderr: 'error: Unknown command: nope\n',
  });
});
