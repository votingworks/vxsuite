import { unsafeParse } from '@votingworks/types';
import { Scan } from '@votingworks/api';
import { fetchJson } from '@votingworks/utils';
import makeDebug from 'debug';

const debug = makeDebug('precinct-scanner:api:scan');

export async function getStatus(): Promise<Scan.PrecinctScannerStatus> {
  return unsafeParse(
    Scan.GetPrecinctScannerStatusResponseSchema,
    await fetchJson('/scanner/status')
  );
}

export async function scanBallot(): Promise<void> {
  await fetchJson('/scanner/scan', { method: 'POST' });
}

export async function acceptBallot(): Promise<void> {
  await fetchJson('/scanner/accept', { method: 'POST' });
}

export async function returnBallot(): Promise<void> {
  await fetchJson('/scanner/return', { method: 'POST' });
}

export async function calibrate(): Promise<boolean> {
  const result = unsafeParse(
    Scan.CalibrateResponseSchema,
    await fetchJson('/scanner/calibrate', { method: 'POST' })
  );
  return result.status === 'ok';
}

export async function getExport(): Promise<string> {
  const response = await fetch('/scan/export', {
    method: 'post',
  });
  if (response.status !== 200) {
    debug('failed to get scan export: %o', response);
    throw new Error('failed to generate scan export');
  }
  return await response.text();
}
