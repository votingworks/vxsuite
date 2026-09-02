// Executes exactly the paths each fixture's header documents. The resulting
// coverage-final.json is the fixtures' coverage report.

import { expect, test } from 'vitest';
import {
  positiveOnly,
  staleFlag,
  unflaggedDebt,
  unknownLabel,
  wrappedReason,
} from './src/statement_form';
import { Config, Partial } from './src/declaration_form';
import './src/file_exclude';
import './src/misplaced_file';
import {
  appendIfVerbose,
  orDefault,
  requirePositive,
  signOf,
  sumNonNegative,
} from './src/implicit_else';
import {
  andGuard,
  nullishInline,
  nullishOwnLine,
  ternaryInline,
} from './src/ternary_logical';
import { StatusPanel } from './src/jsx_container';
import { renderButton } from './src/styled_interpolation';
import { transformEmpty } from './src/method_chain';
import { describeMode, isEditable } from './src/switch_cases';
import { greet, makeConfig, pluralize } from './src/expression_args';
import { PersonSchema } from './src/cdf_zlazy';
import { beforeReturn, elseMisuse, noIf } from './src/orphans';
import {
  blockDefault,
  closure,
  defeated,
  guard,
  kinds,
  redundantDirective,
} from './src/unreachable_types';

test('statement_form', () => {
  expect(positiveOnly(3)).toEqual(6);
  expect(wrappedReason(1)).toEqual(1);
  expect(unflaggedDebt(2)).toEqual(1);
  expect(staleFlag(1)).toEqual(2);
  expect(unknownLabel(1)).toEqual(1);
});

test('declaration_form', () => {
  expect(new Partial().used()).toEqual(7);
  expect(new Config().name).toEqual('config');
});

test('implicit_else', () => {
  expect(appendIfVerbose(true, 'hi')).toEqual('log:hi');
  expect(orDefault(true)).toEqual(2);
  expect(sumNonNegative([-1, -2])).toEqual(0);
  expect(() => requirePositive(-1)).toThrow('not positive');
  expect(signOf(1)).toEqual(1);
  expect(signOf(-1)).toEqual(-1);
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

test('method_chain', () => {
  expect(transformEmpty([])).toEqual([]);
});

test('switch_cases', () => {
  expect(describeMode('read')).toEqual('reader');
  expect(describeMode('admin')).toEqual('administrator');
  expect(isEditable('write')).toEqual(false);
  expect(isEditable('admin')).toEqual(true);
});

test('expression_args', () => {
  expect(greet('hi', '?')).toEqual('hi?');
  expect(makeConfig({ retries: 2 })).toEqual({ retries: 2 });
  expect(pluralize(1)).toEqual('1 item');
});

test('cdf_zlazy', () => {
  expect(typeof PersonSchema.read).toEqual('function');
});

test('orphans', () => {
  expect(beforeReturn()).toEqual(42);
  expect(elseMisuse(true)).toEqual(1);
  expect(elseMisuse(false)).toEqual(2);
  expect(noIf()).toEqual(3);
});

test('unreachable_types', () => {
  expect(guard(1)).toEqual(1);
  expect(closure('a')).toEqual(1);
  expect(blockDefault('a')).toEqual(1);
  expect(kinds({ kind: 'a' })).toEqual(1);
  expect(redundantDirective('a')).toEqual(1);
  expect(() => defeated('zzz' as unknown as 'a')).toThrow('unexpected: zzz');
});
