import { unsafeParse } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { fetchJson } from '@votingworks/utils';
import { rootDebug } from '../utils/debug';

const debug = rootDebug.extend('api:scan');

export async function calibrate(): Promise<boolean> {
  const result = unsafeParse(
    Scan.CalibrateResponseSchema,
    await fetchJson('/precinct-scanner/scanner/calibrate', { method: 'POST' })
  );
  return result.status === 'ok';
}

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
