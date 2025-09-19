import { Client } from '@votingworks/db';
import {
  DiagnosticOutcome,
  DiagnosticRecord,
  DiagnosticType,
} from '@votingworks/types';

/**
 * A schema for tracking the outcome of hardware diagnostics.
 */
export const DIAGNOSTICS_TABLE_SCHEMA = `
create table diagnostics (
    id integer primary key,
    type text not null,
    outcome text not null check (outcome = 'pass' or outcome = 'fail'),
    message text,
    timestamp number not null
  );  
`;

/**
 * Add a new diagnostic record to a store.
 */
export function addDiagnosticRecord(
  client: Client,
  { type, outcome, message }: Omit<DiagnosticRecord, 'timestamp'>,
  timestamp: number = Date.now()
): void {
  client.run(
    `
      insert into diagnostics
        (type, outcome, message, timestamp)
      values
        (?, ?, ?, ?)
    `,
    type,
    outcome,
    message ?? null,
    timestamp
  );
}

/**
 * Get most recent diagnostic record of a given type.
 */
export function getMostRecentDiagnosticRecord(
  client: Client,
  type: DiagnosticType
): DiagnosticRecord | undefined {
  // Retrieve the latest record using the monotonically increasing ID rather than the timestamp to
  // ensure that we're pulling by real world time rather than system time, which can be toggled
  // into the future and then back into the past
  const record = client.one(
    `
      select
        type,
        outcome,
        message,
        timestamp
      from diagnostics
      where type = ?
      order by id desc
      limit 1
    `,
    type
  ) as
    | {
        type: DiagnosticType;
        outcome: DiagnosticOutcome;
        message: string | null;
        timestamp: number;
      }
    | undefined;

  return record
    ? {
        ...record,
        message: record.message ?? undefined,
      }
    : undefined;
}
