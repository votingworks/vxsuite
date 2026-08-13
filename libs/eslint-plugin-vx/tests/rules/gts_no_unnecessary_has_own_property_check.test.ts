import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_unnecessary_has_own_property_check';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('gts-unnecessary-has-own-property-check', rule, {
  valid: [
    { code: 'for (const k of Object.keys({})) {}' },
    {
      code: `
        const o = {}
        for (const k in o) {
          if (o.hasOwnProperty(k))
            o[k] = 1
        }
      `,
    },
    {
      code: `
        const o = {}
        for (const k in o) {
          if (!o.hasOwnProperty(k))
            continue
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        const o = {}
        for (const k of Object.keys(o)) {
          if (o.hasOwnProperty(k)) 
            o[k] = 1
        }
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o))
          if (o.hasOwnProperty(k))
            o[k] = 1
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o)) {
          if (!o.hasOwnProperty(k))
            continue
        }
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o))
          if (!o.hasOwnProperty(k))
            continue
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o)) {
          if (Object.prototype.hasOwnProperty.call(o, k))
            o[k] = 1
        }
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o))
          if (Object.prototype.hasOwnProperty.call(o, k))
            o[k] = 1
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o)) {
          if (!Object.prototype.hasOwnProperty.call(o, k))
            continue
        }
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
    {
      code: `
        const o = {}
        for (const k of Object.keys(o))
          if (!Object.prototype.hasOwnProperty.call(o, k))
            continue
      `,
      errors: [{ messageId: 'noUnnecessaryHasOwnPropertyCheck', line: 4 }],
    },
  ],
});
