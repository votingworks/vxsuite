import { getMimeType, isImageMimeType, isTextMimeType } from './mime';

test('standard types', () => {
  expect(getMimeType('foo.txt')).toBe('text/plain');
  expect(getMimeType('foo.js')).toBe('application/javascript');
  expect(getMimeType('foo.json')).toBe('application/json');
  expect(getMimeType('foo.png')).toBe('image/png');
  expect(getMimeType('foo.jpg')).toBe('image/jpeg');
});

test('fallback types', () => {
  expect(getMimeType('foo.jsonl')).toBe('application/jsonlines');
  expect(getMimeType('foo.unknown')).toBe('application/octet-stream');
});

test('image types', () => {
  expect(isImageMimeType('image/png')).toBe(true);
  expect(isImageMimeType('image/jpeg')).toBe(true);
  expect(isImageMimeType('image/gif')).toBe(true);
  expect(isImageMimeType('image/svg+xml')).toBe(true);
  expect(isImageMimeType('image/tiff')).toBe(true);
  expect(isImageMimeType('image/bmp')).toBe(true);
  expect(isImageMimeType('text/plain')).toBe(false);
  expect(isImageMimeType('application/octet-stream')).toBe(false);
});

test('text types', () => {
  expect(isTextMimeType('text/plain')).toBe(true);
  expect(isTextMimeType('text/csv')).toBe(true);
  expect(isTextMimeType('application/xml')).toBe(true);
  expect(isTextMimeType('application/json')).toBe(true);
  expect(isTextMimeType('application/jsonlines')).toBe(true);
  expect(isTextMimeType('image/png')).toBe(false);
  expect(isTextMimeType('application/octet-stream')).toBe(false);
});
