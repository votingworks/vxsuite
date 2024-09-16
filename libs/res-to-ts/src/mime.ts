import { getType } from 'mime';
import { extname } from 'node:path';

/**
 * Gets the MIME type of files not supported by `mime`.
 */
function getFallbackMimeType(path: string): string {
  const ext = extname(path);
  if (ext === '.jsonl') {
    return 'application/jsonlines';
  }
  return 'application/octet-stream';
}

/**
 * Determines the MIME type based on a file path.
 */
export function getMimeType(path: string): string {
  return getType(path) ?? getFallbackMimeType(path);
}

/**
 * Determines whether a MIME type is text-based.
 */
export function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.startsWith('application/json') ||
    mimeType === 'application/xml'
  );
}

/**
 * Determines whether a MIME type is image-based.
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
