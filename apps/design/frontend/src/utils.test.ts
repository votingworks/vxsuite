import { downloadFile } from './utils';

test('downloadFile cleans up temporary anchor tag', () => {
  downloadFile('http://localhost:1234/file.zip');
  expect(document.getElementsByTagName('a')).toHaveLength(0);
});
