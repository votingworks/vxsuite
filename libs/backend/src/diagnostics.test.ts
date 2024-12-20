import { tmpNameSync } from 'tmp';
import { writeFileSync } from 'node:fs';
import { Client } from '@votingworks/db';
import { DiagnosticRecord } from '@votingworks/types';
import {
  DIAGNOSTICS_TABLE_SCHEMA,
  addDiagnosticRecord,
  getMostRecentDiagnosticRecord,
} from './diagnostics';

test('add and get diagnostic records', () => {
  const schemaPath = tmpNameSync();
  writeFileSync(schemaPath, DIAGNOSTICS_TABLE_SCHEMA);
  const client = Client.memoryClient(schemaPath);

  expect(getMostRecentDiagnosticRecord(client, 'test-print')).toBeUndefined();

  addDiagnosticRecord(client, { type: 'test-print', outcome: 'pass' }, 0);
  addDiagnosticRecord(
    client,
    { type: 'test-print', outcome: 'fail', message: 'looks dirty' },
    1
  );
  addDiagnosticRecord(client, { type: 'blank-sheet-scan', outcome: 'pass' }, 2);
  addDiagnosticRecord(client, { type: 'blank-sheet-scan', outcome: 'fail' }, 3);

  expect(
    getMostRecentDiagnosticRecord(client, 'test-print')
  ).toEqual<DiagnosticRecord>({
    type: 'test-print',
    outcome: 'fail',
    message: 'looks dirty',
    timestamp: 1,
  });
  expect(
    getMostRecentDiagnosticRecord(client, 'blank-sheet-scan')
  ).toEqual<DiagnosticRecord>({
    type: 'blank-sheet-scan',
    outcome: 'fail',
    timestamp: 3,
  });
});

test('defaults to current timestamp', () => {
  const schemaPath = tmpNameSync();
  writeFileSync(schemaPath, DIAGNOSTICS_TABLE_SCHEMA);
  const client = Client.memoryClient(schemaPath);

  jest.useFakeTimers().setSystemTime(1000);
  addDiagnosticRecord(client, { type: 'test-print', outcome: 'pass' });
  expect(
    getMostRecentDiagnosticRecord(client, 'test-print')
  ).toEqual<DiagnosticRecord>({
    type: 'test-print',
    outcome: 'pass',
    timestamp: 1000,
  });
});
