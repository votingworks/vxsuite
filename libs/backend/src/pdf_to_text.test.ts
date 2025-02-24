import { expect, test, vi } from 'vitest';
import { pdfToText } from './pdf_to_text';
import { execFile } from './exec';

vi.mock(import('./exec.js'));

const execFileMock = vi.mocked(execFile);

test('pdfToText', async () => {
  execFileMock.mockResolvedValueOnce({ stdout: 'pdf contents', stderr: '' });
  expect(await pdfToText('test.pdf')).toEqual('pdf contents');
  expect(execFileMock).toHaveBeenCalledWith('pdftotext', [
    'test.pdf',
    '-raw',
    '-',
  ]);
});
