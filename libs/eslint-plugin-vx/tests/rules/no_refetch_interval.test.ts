import { join } from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from '../../src/rules/no_refetch_interval';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

ruleTester.run('no-refetch-interval', rule, {
  valid: [
    // The consolidated polling hook takes the interval positionally
    `usePollingQuery(queryKey, queryFn, 1000)`,
    // Options objects without the key are fine
    `useQuery(queryKey, queryFn, { staleTime: 0 })`,
    `useQuery(queryKey, queryFn, { 'staleTime': 0 })`,
    // Reading the option is fine; only setting it is a problem
    `const interval = options.refetchInterval;`,
    // Destructuring is reading, not setting
    `const { refetchInterval } = options;`,
    `function poll({ refetchInterval }) { return refetchInterval; }`,
    // A computed key that happens to be named refetchInterval refers to a
    // variable's value, not the literal option name
    `const config = { [refetchInterval]: 1000 };`,
  ],
  invalid: [
    {
      code: `useQuery(queryKey, queryFn, { refetchInterval: 1000 })`,
      errors: [{ messageId: 'noRefetchInterval' }],
    },
    {
      code: `useQuery(queryKey, queryFn, { refetchInterval })`,
      errors: [{ messageId: 'noRefetchInterval' }],
    },
    {
      code: `useQuery(queryKey, queryFn, { 'refetchInterval': 1000 })`,
      errors: [{ messageId: 'noRefetchInterval' }],
    },
    {
      code: `useQuery(queryKey, queryFn, { refetchInterval: (data) => (data ? 100 : false) })`,
      errors: [{ messageId: 'noRefetchInterval' }],
    },
    {
      code: `new QueryClient({ defaultOptions: { queries: { refetchInterval: 1000 } } })`,
      errors: [{ messageId: 'noRefetchInterval' }],
    },
  ],
});
