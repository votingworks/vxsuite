import { Buffer } from 'node:buffer';
import JsZip from 'jszip';

export async function zipFile(files: {
  [key: string]: Buffer | string;
}): Promise<Buffer> {
  const zip = new JsZip();
  for (const [name, data] of Object.entries(files)) {
    zip.file(
      name,
      data,
      // Use a specific date to make the zip deterministic
      { date: new Date('2024-01-29T00:00:00Z') }
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', streamFiles: true });
}
