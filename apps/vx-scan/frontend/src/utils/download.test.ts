import { Buffer } from 'buffer';
import { fakeKiosk } from '@votingworks/test-utils';
import fetchMock from 'fetch-mock';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import {
  download,
  DownloadErrorKind,
  readContentDispositionFilename,
} from './download';

test('readContentDispositionFilename', () => {
  expect(readContentDispositionFilename('')).toBeUndefined();
  expect(readContentDispositionFilename('attachment')).toBeUndefined();
  expect(readContentDispositionFilename('inline')).toBeUndefined();
  expect(
    readContentDispositionFilename('attachment: filename=file.txt')
  ).toEqual('file.txt');
  expect(
    readContentDispositionFilename(
      'attachment: filename="file with spaces.txt"'
    )
  ).toEqual('file with spaces.txt');
});

test('download without kiosk-browser', async () => {
  delete window.kiosk;

  const location: Location = {
    ...window.location,
    assign: jest.fn(),
  };

  jest.spyOn(window, 'location', 'get').mockReturnValue(location);
  (await download('/file.txt')).unsafeUnwrap();
  expect(window.location.assign).toHaveBeenCalledWith('/file.txt');
});

test('download with kiosk-browser and status!=200', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', { status: 404, body: '' });

  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.FetchFailed,
    response: expect.any(Response),
  });
});

test('download with kiosk-browser and no content-disposition', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', { status: 200, body: '', headers: {} });

  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.FileMissing,
    response: expect.any(Response),
  });
});

test('download with kiosk-browser and no body', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: undefined,
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.FileMissing,
    response: expect.any(Response),
  });
});

test('download with fetch options', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.postOnce('/file.txt', {});
  void (await download('/file.txt', { fetchOptions: { method: 'POST' } }));
  expect(fetchMock.lastOptions()).toMatchObject({
    method: 'POST',
  });
});

test('download with kiosk-browser and no content-disposition filename', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: '',
    headers: { 'Content-Disposition': 'inline' },
  });

  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.FileMissing,
    response: expect.any(Response),
  });
});

test('download with kiosk-browser and a content-disposition filename', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: '',
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  kiosk.saveAs.mockResolvedValueOnce(undefined);
  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.NoFileChosen,
  });
});

test('download with kiosk-browser and chosen file path is un-writable', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: '',
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  kiosk.saveAs.mockRejectedValueOnce(new Error('EPERM'));
  const result = await download('/file.txt');
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.OpenFailed,
    path: 'abc.txt',
    error: new Error('EPERM'),
  });
});

test('download with kiosk-browser and chosen file path is writable', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: 'a file body',
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  const fileWriter = fakeFileWriter();
  kiosk.saveAs.mockResolvedValueOnce(fileWriter);
  const result = await download('/file.txt');
  result.unsafeUnwrap();
  expect(fileWriter.write).toHaveBeenCalledWith(Buffer.from('a file body'));
  expect(fileWriter.end).toHaveBeenCalled();
});

test('download with kiosk-browser with a target directory', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: 'a file body',
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  const fileWriter = fakeFileWriter();
  // `writeFile` is overloaded in such a way to have different return types,
  // which confuses TS. There's no good way around this that I can find.
  kiosk.writeFile.mockResolvedValueOnce(
    fileWriter as unknown as ReturnType<KioskBrowser.Kiosk['writeFile']>
  );
  const result = await download('/file.txt', { directory: '/some/directory' });
  result.unsafeUnwrap();
  expect(kiosk.makeDirectory).toHaveBeenCalledWith('/some/directory', {
    recursive: true,
  });
  expect(kiosk.writeFile).toHaveBeenCalledWith('/some/directory/abc.txt');
});

test('download with kiosk-browser with a target directory and un-writable path', async () => {
  const kiosk = fakeKiosk();
  window.kiosk = kiosk;

  fetchMock.getOnce('/file.txt', {
    status: 200,
    body: 'a file body',
    headers: { 'Content-Disposition': 'attachment; filename=abc.txt' },
  });

  kiosk.writeFile.mockRejectedValueOnce(new Error('EPERM'));
  const result = await download('/file.txt', { directory: '/some/directory' });
  expect(result.err()).toEqual({
    kind: DownloadErrorKind.OpenFailed,
    path: '/some/directory/abc.txt',
    error: new Error('EPERM'),
  });
});
