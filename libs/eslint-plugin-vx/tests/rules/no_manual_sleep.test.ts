import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import rule from '../../src/rules/no_manual_sleep';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('no-manual-sleep', rule, {
  valid: [
    // Using the sleep utility directly
    `sleep(100)`,
    // setTimeout used for something other than a sleep pattern
    `setTimeout(() => doSomething(), 100)`,
    // Promise with non-setTimeout body
    `new Promise((resolve) => resolve(42))`,
    // Promise with setTimeout but extra logic in the block
    `new Promise((resolve) => { doSomething(); setTimeout(resolve, 100) })`,
    // setTimeout with extra arguments
    `new Promise((resolve) => setTimeout(resolve, 100, 'extra'))`,
    // Promise with more than one param (resolve, reject)
    `new Promise((resolve, reject) => setTimeout(resolve, 100))`,
    // Not a Promise constructor
    `new MyPromise((resolve) => setTimeout(resolve, 100))`,
    // setTimeout with no duration
    `new Promise((resolve) => setTimeout(resolve))`,
  ],
  invalid: [
    {
      code: `new Promise((resolve) => setTimeout(resolve, 100))`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `sleep(100)`,
            },
          ],
        },
      ],
    },
    {
      code: `new Promise((r) => setTimeout(r, 100))`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `sleep(100)`,
            },
          ],
        },
      ],
    },
    {
      code: `new Promise((resolve) => { setTimeout(resolve, 100) })`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `sleep(100)`,
            },
          ],
        },
      ],
    },
    {
      code: `new Promise(function(resolve) { setTimeout(resolve, 100) })`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `sleep(100)`,
            },
          ],
        },
      ],
    },
    {
      code: `await new Promise((resolve) => setTimeout(resolve, ms))`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `await sleep(ms)`,
            },
          ],
        },
      ],
    },
    {
      code: `new Promise((resolve) => setTimeout(resolve, DELAY_MS))`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `sleep(DELAY_MS)`,
            },
          ],
        },
      ],
    },
    {
      code: `await new Promise<void>((resolve) => { setTimeout(resolve, 100) })`,
      errors: [
        {
          messageId: 'manualSleep',
          suggestions: [
            {
              messageId: 'useSleep',
              output: `await sleep(100)`,
            },
          ],
        },
      ],
    },
  ],
});
