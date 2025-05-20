import { expect, test } from 'vitest';
import { normalizeWriteInName } from './adjudication';

test('normalizeWriteInName', () => {
  expect(normalizeWriteInName('Name')).toEqual('name');
  expect(normalizeWriteInName('  Name  ')).toEqual('name');
  expect(normalizeWriteInName('  Na     me  ')).toEqual('na me');
});
