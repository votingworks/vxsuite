import { expect, test } from 'vite-plus/test';
import { normalizeWriteInName } from './adjudication';

test('normalizeWriteInName', () => {
  expect(normalizeWriteInName('Name')).toEqual('name');
  expect(normalizeWriteInName('  Name  ')).toEqual('name');
  expect(normalizeWriteInName('  Na     me  ')).toEqual('na me');
});
