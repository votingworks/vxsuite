import { range } from '@votingworks/basics';
import { downloadFile, nextId } from './utils';

test('nextId', () => {
  expect(nextId('prefix-')).toEqual('prefix-1');
  expect(nextId('prefix-', ['prefix-1'])).toEqual('prefix-2');
  expect(nextId('prefix-', ['prefix-1', 'prefix-2'])).toEqual('prefix-3');
  expect(nextId('prefix-', ['prefix-1', 'prefix-3'])).toEqual('prefix-2');
  expect(
    nextId(
      'prefix-',
      range(1, 100).map((n) => `prefix-${n}`)
    )
  ).toEqual('prefix-100');
  expect(
    nextId('prefix-', ['custom', 'prefix-2', 'id123', 'prefix-1'])
  ).toEqual('prefix-3');
});

test('downloadFile cleans up temporary anchor tag', () => {
  downloadFile('http://localhost:1234/file.zip');
  expect(document.getElementsByTagName('a')).toHaveLength(0);
});
