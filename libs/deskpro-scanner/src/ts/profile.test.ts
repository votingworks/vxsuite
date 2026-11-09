import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { VX_PROFILE_PATH } from './profile.js';

type Value = string | Value[];

function parseTuple(text: string): Value[] {
  let index = 0;
  function value(): Value {
    if (text[index] === '(') {
      index += 1;
      const items: Value[] = [];
      while (text[index] !== ')') {
        items.push(value());
        if (text[index] === ',') index += 1;
      }
      index += 1;
      return items;
    }
    const end =
      text[index] === '"'
        ? text.indexOf('"', index + 1) + 1
        : text.slice(index).search(/[,)]/) + index;
    const atom = text.slice(index, end);
    index = end;
    return atom;
  }
  return value() as Value[];
}

test('the shipped profile reports errors to the host', () => {
  const [schema, profile] = parseTuple(
    `(${readFileSync(VX_PROFILE_PATH, 'utf8').trim()})`
  ) as [string, Value[]];
  expect(schema).toEqual('210');
  expect(profile[0]).toEqual('"vx-gray200"');
  const interfacing = profile[11] as Value[];
  expect(interfacing[2]).toEqual('0');
});
