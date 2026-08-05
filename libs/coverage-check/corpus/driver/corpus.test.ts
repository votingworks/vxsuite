// Executes exactly the paths each fixture's header documents. The resulting
// coverage-final.json is the corpus's entity data — real istanbul output from
// the production pipeline (vitest 4 + vite 8/oxc + @vitest/coverage-istanbul).

import { expect, test } from 'vitest';
import {
  positiveOnly,
  proseMention,
  staleFlag,
  unflaggedDebt,
  unknownLabel,
} from '../fixtures/statement_form';
import { Config, Partial } from '../fixtures/declaration_form';
import '../fixtures/file_exclude';
import { appendIfVerbose, orDefault } from '../fixtures/else_form';
import { requirePositive, sumNonNegative } from '../fixtures/terminating_then';
import {
  andGuard,
  nullishInline,
  nullishOwnLine,
  ternaryInline,
} from '../fixtures/ternary_logical';
import { StatusPanel } from '../fixtures/jsx_container';
import { renderButton } from '../fixtures/styled_interpolation';
import { transformEmpty } from '../fixtures/fluent_chain';
import { describeMode } from '../fixtures/switch_cases';
import { greet, makeConfig, pluralize } from '../fixtures/expression_args';
import {
  genericNotExcused,
  handle,
  handleBlock,
  notExcused,
} from '../fixtures/never_param';
import { identity, throwIllegalValue } from '../fixtures/never_helpers';
import { PersonSchema } from '../fixtures/cdf_zlazy';
import { beforeReturn, elseMisuse } from '../fixtures/orphans';

test('statement_form', () => {
  expect(positiveOnly(3)).toEqual(6);
  expect(unflaggedDebt(2)).toEqual(1);
  expect(staleFlag(1)).toEqual(2);
  expect(unknownLabel(1)).toEqual(1);
  expect(proseMention(1)).toEqual(1);
});

test('declaration_form', () => {
  expect(new Partial().used()).toEqual(7);
  expect(new Config().name).toEqual('config');
});

test('else_form', () => {
  expect(appendIfVerbose(true, 'hi')).toEqual('log:hi');
  expect(orDefault(true)).toEqual(2);
});

test('terminating_then', () => {
  expect(sumNonNegative([-1, -2])).toEqual(0);
  expect(() => requirePositive(-1)).toThrow('not positive');
});

test('ternary_logical', () => {
  expect(ternaryInline(true)).toEqual('yes');
  expect(nullishInline('x')).toEqual('x');
  expect(nullishOwnLine('x')).toEqual('x');
  expect(andGuard(undefined)).toEqual(0);
});

test('jsx_container', () => {
  expect(StatusPanel({}).tag).toEqual('div');
});

test('styled_interpolation', () => {
  expect(renderButton({ compact: false })).toContain('8px');
});

test('fluent_chain', () => {
  expect(transformEmpty([])).toEqual([]);
});

test('switch_cases', () => {
  expect(describeMode('read')).toEqual('reader');
  expect(describeMode('admin')).toEqual('administrator');
});

test('expression_args', () => {
  expect(greet('hi', '?')).toEqual('hi?');
  expect(makeConfig({ retries: 2 })).toEqual({ retries: 2 });
  expect(pluralize(1)).toEqual('1 item');
});

test('never_param', () => {
  expect(handle('alpha')).toEqual(1);
  expect(handle('beta')).toEqual(2);
  expect(handleBlock('alpha')).toEqual(10);
  expect(handleBlock('beta')).toEqual(20);
  expect(notExcused('a')).toEqual('a');
  expect(genericNotExcused(1)).toEqual(1);
  expect(() => throwIllegalValue('boom' as never)).toThrow('Illegal value');
  expect(identity('x')).toEqual('x');
});

test('cdf_zlazy', () => {
  expect(typeof PersonSchema.read).toEqual('function');
});

test('orphans', () => {
  expect(beforeReturn()).toEqual(42);
  expect(elseMisuse(true)).toEqual(1);
  expect(elseMisuse(false)).toEqual(2);
});
