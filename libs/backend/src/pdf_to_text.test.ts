import { mockOf } from '@votingworks/test-utils';
import { pdfToText } from './pdf_to_text';
import { execFile } from './exec';

jest.mock('./exec');

const execFileMock = mockOf(execFile);

test('pdfToText', async () => {
  execFileMock.mockResolvedValueOnce({ stdout: 'pdf contents', stderr: '' });
  expect(await pdfToText('test.pdf')).toEqual('pdf contents');
  expect(execFileMock).toHaveBeenCalledWith('pdftotext', [
    'test.pdf',
    '-raw',
    '-',
  ]);
});
