import { RuleTester } from '@typescript-eslint/rule-tester';
import { join } from 'node:path';
import rule from '../../src/rules/no_react_hook_mutation_dependency';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2018,
      tsconfigRootDir: join(__dirname, '../fixtures'),
      project: './tsconfig.json',
    },
  },
});

const validExample1 = `
useEffect(() => {
  console.log('noop');
});`;

const validExample2 = `
const num: number = 1;

useEffect(() => {
  console.log(num);
}, [num]);`;

const invalidCode = `
interface UseMutationResult {
  mutate: number;
};

function useMutation(): UseMutationResult {
  return {
    mutate: 5,
  };
}

const result = useMutation();

useEffect(() => {
  console.log(result.mutate)
}, [result]);
`;

ruleTester.run('no-react-hook-mutation-dependency', rule, {
  valid: [validExample1, validExample2],
  invalid: [
    {
      code: invalidCode,
      errors: [{ line: 16, messageId: 'badMutationDependency' }],
    },
  ],
});
