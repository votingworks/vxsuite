import { afterAll, describe, it } from 'vitest';
import { RuleTester } from '@typescript-eslint/rule-tester';

// `@typescript-eslint/parser` switches to "single-run" program management when
// `CI=true`, which causes our `RuleTester` runs to read fixture files from
// disk (e.g. `tests/fixtures/file.ts`) instead of parsing the in-memory test
// code. Force the long-running watch-program mode so test bodies are parsed
// regardless of how tests are invoked.
process.env['TSESTREE_SINGLE_RUN'] = 'false';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
