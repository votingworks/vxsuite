import { expect, test } from 'vitest';
import { parseSnippet } from '../test/helpers.js';
import type { Span } from './typescript.js';
import { bindDirectives, parseDirective } from './directives.js';

function bindingsOf(text: string, name?: string) {
  const source = parseSnippet(text, name);
  function sliceSpan(span: Span): string {
    return source.text.slice(span.start, span.end);
  }
  return bindDirectives(source).map((bound) => {
    if ('error' in bound) return bound.error;
    const { target } = bound;
    switch (target.type) {
      case 'range':
        return sliceSpan(target.span);
      case 'else-arm':
        return `else-arm:${sliceSpan(target.ifSpan).split('\n')[0]}`;
      default:
        return target;
    }
  });
}

test('a comment-only JSX expression container binds the next sibling', () => {
  const text = [
    'declare function h(...args: unknown[]): unknown;',
    'export function App(): unknown {',
    '  return (',
    '    <div>',
    '      {/* @coverage-exclude */}',
    '      <button>Go</button>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
  expect(bindingsOf(text, 'src/a.tsx')).toEqual(['<button>Go</button>']);
  // A comment inside an opening tag precedes no code of its own.
  const inOpeningTag = [
    'declare function h(...args: unknown[]): unknown;',
    'export function App(): unknown {',
    '  return (',
    '    <div /* @coverage-exclude */>',
    '      <button>Go</button>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
  expect(bindingsOf(inOpeningTag, 'src/a.tsx')).toEqual(['orphan']);
});

test('a comment that starts like a directive but breaks the grammar is a parse error', () => {
  for (const text of [
    '@coverage-excluded',
    '@coverage-exclude soon',
    '@coverage-exclude - reason',
    '@coverage-skip',
    '@coverage-exlcude: typo',
    '@coverage-exclude-line',
    '@coverage-defer-file-else',
    '@coverage-',
    '@Coverage-exclude',
    '@COVERAGE-EXCLUDE: shouting',
    '@coverage-exclude:',
    '@coverage-exclude:   ',
  ]) {
    expect(parseDirective(text), text).toEqual('parse-error');
  }
});

test('JSDoc-style block comments parse like plain ones', () => {
  expect(parseDirective('* @coverage-exclude: reason ')).toEqual({
    action: 'exclude',
    scope: 'next',
    reason: 'reason',
  });
  expect(parseDirective('*\n * @coverage-defer: two\n * lines\n ')).toEqual({
    action: 'defer',
    scope: 'next',
    reason: 'two\nlines',
  });
  expect(parseDirective('* @coverage-exlcude')).toEqual('parse-error');
  expect(
    bindingsOf(
      ['/** @coverage-exclude */', 'export const a = 1;', ''].join('\n')
    )
  ).toEqual(['export const a = 1;']);
});

test('comments that are not directive-shaped are not directives', () => {
  for (const text of [
    'coverage-exclude',
    'prose mentioning @coverage-exclude later',
    'TODO',
  ]) {
    expect(parseDirective(text), text).toBeUndefined();
  }
});
