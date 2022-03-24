/**
 * Reads a Blob as an ArrayBuffer. Though Chrome supports reading Blobs as
 * ArrayBuffers using `Blob#arrayBuffer()`, this is not supported by Jest/jsdom.
 */
export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Reads a Blob as a string. Though Chrome supports reading Blobs as text using
 * `Blob#text()`, this is not supported by Jest/jsdom.
 */
export function readBlobAsString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
