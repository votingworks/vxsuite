import { getMimeType, isImageMimeType, isTextMimeType } from './mime.js';

test('standard types', () => {
  expect(getMimeType('foo.txt')).toEqual('text/plain');
  expect(getMimeType('foo.js')).toEqual('application/javascript');
  expect(getMimeType('foo.json')).toEqual('application/json');
  expect(getMimeType('foo.png')).toEqual('image/png');
  expect(getMimeType('foo.jpg')).toEqual('image/jpeg');
});

test('fallback types', () => {
  expect(getMimeType('foo.jsonl')).toEqual('application/jsonlines');
  expect(getMimeType('foo.unknown')).toEqual('application/octet-stream');
});

test('image types', () => {
  expect(isImageMimeType('image/png')).toEqual(true);
  expect(isImageMimeType('image/jpeg')).toEqual(true);
  expect(isImageMimeType('image/gif')).toEqual(true);
  expect(isImageMimeType('image/svg+xml')).toEqual(true);
  expect(isImageMimeType('image/tiff')).toEqual(true);
  expect(isImageMimeType('image/bmp')).toEqual(true);
  expect(isImageMimeType('text/plain')).toEqual(false);
  expect(isImageMimeType('application/octet-stream')).toEqual(false);
});

test('text types', () => {
  expect(isTextMimeType('text/plain')).toEqual(true);
  expect(isTextMimeType('text/csv')).toEqual(true);
  expect(isTextMimeType('application/xml')).toEqual(true);
  expect(isTextMimeType('application/json')).toEqual(true);
  expect(isTextMimeType('application/jsonlines')).toEqual(true);
  expect(isTextMimeType('image/png')).toEqual(false);
  expect(isTextMimeType('application/octet-stream')).toEqual(false);
});
