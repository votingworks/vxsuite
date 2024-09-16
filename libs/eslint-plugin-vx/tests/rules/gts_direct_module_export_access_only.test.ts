import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_direct_module_export_access_only';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-direct-namespace-property-access-only', rule, {
  valid: [
    {
      code: `
        import * as mod from 'mod';
        mod.exp();
      `,
    },
    {
      code: `
        import * as mod from 'mod';
        console.log(mod['exp']);
      `,
    },
    {
      code: `
        import mod from 'mod';
        console.log(mod);
      `,
    },
    {
      code: `
        import * as mod from 'mod';
        console.log(mod?.exp);
      `,
    },
    {
      code: `
        import type * as mod from 'mod';
        let m: mod.exp;
      `,
    },
    {
      code: `
        import type * as mod from 'mod';
        let m: mod['exp'];
      `,
    },
    {
      code: `
        import type * as mod from 'mod';
        let m: typeof mod['exp'];
      `,
    },
    {
      code: `
        import * as React from 'react';
      `,
      filename: '../fixtures/react.tsx',
    },
  ],
  invalid: [
    {
      code: `
        import * as mod from 'mod';
        console.log(mod);
      `,
      errors: [{ line: 3, messageId: 'directAccessOnly' }],
    },
    {
      code: `
        import * as mod from 'mod';
        mod;
      `,
      errors: [{ line: 3, messageId: 'directAccessOnly' }],
    },
    {
      code: `
        import * as mod from 'mod';
        obj[mod];
      `,
      errors: [{ line: 3, messageId: 'directAccessOnly' }],
    },
  ],
});
