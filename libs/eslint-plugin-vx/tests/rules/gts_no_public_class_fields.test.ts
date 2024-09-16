import { RuleTester } from '@typescript-eslint/utils/ts-eslint';
import { join } from 'node:path';
import rule from '../../src/rules/gts_no_public_class_fields';

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    tsconfigRootDir: join(__dirname, '../fixtures'),
    project: './tsconfig.json',
  },
  parser: require.resolve('@typescript-eslint/parser'),
});

ruleTester.run('gts-no-public-class-fields', rule, {
  valid: [
    `class Nothing {}`,
    `
      class Box<T> {
        private value?: T;

        getValue(): T {
          return this.value;
        }

        setValue(newValue: T): void {
          this.value = newValue;
        }
      }
    `,
    `
      class Box<T> {
        protected value?: T;

        getValue(): T {
          return this.value;
        }

        setValue(newValue: T): void {
          this.value = newValue;
        }
      }
    `,
    `
      class Box<T> {
        constructor(private value?: T) {}

        getValue(): T {
          return this.value;
        }

        setValue(newValue: T): void {
          this.value = newValue;
        }
      }
    `,
    `
      class Box<T> {
        constructor(protected value?: T) {}

        getValue(): T {
          return this.value;
        }

        setValue(newValue: T): void {
          this.value = newValue;
        }
      }
    `,
    `
    class One {
      get value() {
        return 1;
      }

      getValue() {
        return 1;
      }

      static readonly ONE = 1;
    }
  `,
  ],
  invalid: [
    {
      code: `class Box<T> { value?: T }`,
      errors: [{ messageId: 'noPublicClassFields', line: 1 }],
    },
    {
      code: `class Box<T> { constructor(public value?: T) {} }`,
      errors: [{ messageId: 'noPublicClassFields', line: 1 }],
    },
  ],
});
