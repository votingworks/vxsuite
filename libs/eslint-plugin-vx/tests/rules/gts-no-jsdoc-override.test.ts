import { ESLintUtils } from '@typescript-eslint/experimental-utils';
import * as ts from 'typescript';
import { join } from 'path';
import rule from '../../src/rules/gts-no-jsdoc-override';

const ruleTester = new ESLintUtils.RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: '@typescript-eslint/parser',
});

const tsSupportsOverride = 'OverrideKeyword' in ts.SyntaxKind;

ruleTester.run('gts-no-jsdoc-override', rule, {
  valid: [
    tsSupportsOverride
      ? `
      class Foo extends Bar {
        override doSomething() {}
      }
    `
      : `
      class Foo extends bar {
        doSomething() {}
      }
    `,
    `
      // ignore line comments @override
    `,
  ],
  invalid: [
    {
      code: '/** @override */',
      errors: [{ messageId: 'noJSDocOverride', line: 1 }],
    },
  ],
});
