import { rootDebug } from '../utils/debug';

const debug = rootDebug.extend('api:scan');

// Returns CVR file which does not include any write-in images
export async function getExportWithoutImages(): Promise<string> {
  const response = await fetch('/precinct-scanner/export', {
    method: 'post',
    body: JSON.stringify({ skipImages: true }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status !== 200) {
    debug('failed to get scan export: %o', response);
    throw new Error('failed to generate scan export');
  }
  return await response.text();
}
