import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../../src/rules/no_shell_child_process.ts';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(import.meta.dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('no-shell-child-process', rule, {
  valid: [
    `import { spawn } from 'node:child_process'; spawn('ls', ['-l']);`,
    `import { execFile } from 'child_process'; execFile('ls', ['-l'], { cwd: '/' });`,
    `import { spawn } from 'node:child_process'; spawn('ls', [], { shell: false });`,
    `import * as cp from 'node:child_process'; cp.execFile('ls', []);`,
    `import cp from 'node:child_process'; cp.spawnSync('ls', []);`,
    `import * as cp from 'node:child_process'; cp[method]('ls');`,
    `import { spawn } from 'node:child_process'; spawn('ls', [], { ...options });`,
    `import { spawn } from 'node:child_process'; spawn('ls', [], options);`,
    `import { exec } from './exec'; exec('ls', ['-l']);`,
    `import { exec } from '@votingworks/usb-drive'; exec('ls', []);`,
    `function exec(cmd: string) {} exec('ls');`,
    `db.exec('SELECT 1');`,
    `other.spawn('ls', [], { shell: true });`,
    `class A extends B { constructor() { super({ shell: true }); } }`,
    `import 'node:child_process';`,
    `import { spawn } from 'node:child_process'; spawn('ls', [], { [key]: true, 1: true });`,
  ],
  invalid: [
    {
      code: `import { exec } from 'node:child_process';`,
      errors: [{ messageId: 'shellFunction', data: { name: 'exec' } }],
    },
    {
      code: `import { execSync as run } from 'child_process'; run('ls');`,
      errors: [{ messageId: 'shellFunction', data: { name: 'execSync' } }],
    },
    {
      code: `import { 'exec' as run } from 'node:child_process';`,
      errors: [{ messageId: 'shellFunction', data: { name: 'exec' } }],
    },
    {
      code: `import * as cp from 'node:child_process'; promisify(cp.exec);`,
      errors: [{ messageId: 'shellFunction', data: { name: 'exec' } }],
    },
    {
      code: `import cp from 'node:child_process'; cp['execSync']('ls');`,
      errors: [{ messageId: 'shellFunction', data: { name: 'execSync' } }],
    },
    {
      code: `import { spawn } from 'node:child_process'; spawn('ls', [], { shell: true });`,
      errors: [{ messageId: 'shellOption' }],
    },
    {
      code: `import { execFile } from 'node:child_process'; execFile('ls', [], { shell: '/bin/bash' });`,
      errors: [{ messageId: 'shellOption' }],
    },
    {
      code: `import { spawnSync } from 'node:child_process'; spawnSync('ls', { shell: useShell });`,
      errors: [{ messageId: 'shellOption' }],
    },
    {
      code: `import { spawn } from 'node:child_process'; spawn('ls', [], { ['shell']: true });`,
      errors: [{ messageId: 'shellOption' }],
    },
    {
      code: `import * as cp from 'node:child_process'; cp.fork('a.js', [], { 'shell': true });`,
      errors: [{ messageId: 'shellOption' }],
    },
  ],
});
