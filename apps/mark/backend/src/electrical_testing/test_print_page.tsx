import { DateTime } from 'luxon';
import { formatFullDateTimeZone } from '@votingworks/utils';

export interface TestPrintPageProps {
  timestamp: Date;
  machineId: string;
}

export function TestPrintPage({
  timestamp,
  machineId,
}: TestPrintPageProps): JSX.Element {
  const formattedTimestamp = formatFullDateTimeZone(
    DateTime.fromJSDate(timestamp),
    { includeTimezone: true, includeSeconds: true }
  );

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        fontSize: '12pt',
      }}
    >
      <h1 style={{ fontSize: '18pt', marginBottom: '12pt' }}>
        VxMark Test Print
      </h1>
      <p>Timestamp: {formattedTimestamp}</p>
      <p>Machine ID: {machineId}</p>
      <p style={{ marginTop: '12pt' }}>
        This is a test print from the VxMark Hardware Test Application.
      </p>
    </div>
  );
}
