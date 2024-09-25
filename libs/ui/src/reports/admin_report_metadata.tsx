import { formatFullDateTimeZone } from '@votingworks/utils';
import { DateTime } from 'luxon';
import { LabeledValue, ReportMetadata } from './report_header';

export function AdminReportMetadata({
  generatedAtTime,
}: {
  generatedAtTime: Date;
}): JSX.Element {
  return (
    <ReportMetadata>
      <LabeledValue
        label="Report Generated"
        value={formatFullDateTimeZone(DateTime.fromJSDate(generatedAtTime), {
          includeWeekday: false,
        })}
      />
    </ReportMetadata>
  );
}
