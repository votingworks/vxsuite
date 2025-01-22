import { describe, test } from 'vitest';
import { RuleTester } from '@typescript-eslint/utils/ts-eslint';

RuleTester.describe = describe;
RuleTester.it = test;
RuleTester.itOnly = test.only;
