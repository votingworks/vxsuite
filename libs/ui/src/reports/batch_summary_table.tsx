import { BatchInfo, Tabulation } from '@votingworks/types';
import { formatFullDateTimeZone } from '@votingworks/utils';
import { DateTime } from 'luxon';
import { styled } from '../styled.js';
import { TD, TH } from '../table.js';
import { ReportTable } from './layout.js';

const Container = styled.div`
  margin-top: 1.5em;
  page-break-inside: avoid;
`;

const SectionTitle = styled.p`
  font-size: 1.5em;
  margin: 0 0 0.25em;
`;

const BatchTable = styled(ReportTable)`
  width: auto;
  text-align: left;

  & th,
  & td {
    padding: 0.25rem 0.5rem;
  }
`;

interface Props {
  batches: BatchInfo[];
}

export function BatchSummaryTable({ batches }: Props): JSX.Element {
  const sortedBatches = [...batches].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt)
  );

  return (
    <Container>
      <SectionTitle>Batch Summary</SectionTitle>
      <BatchTable>
        <thead>
          <tr>
            <TH>Batch ID</TH>
            <TH narrow>Sheets Scanned</TH>
            <TH>Polls Opened / Resumed</TH>
            <TH>Polls Closed / Paused</TH>
          </tr>
        </thead>
        <tbody>
          {sortedBatches.map((batch) => (
            <tr key={batch.id}>
              <TD>{Tabulation.formatBatchId(batch.id)}</TD>
              <TD narrow>{batch.count}</TD>
              <TD>
                {formatFullDateTimeZone(DateTime.fromISO(batch.startedAt), {
                  includeWeekday: false,
                })}
              </TD>
              <TD>
                {batch.endedAt
                  ? formatFullDateTimeZone(DateTime.fromISO(batch.endedAt), {
                      includeWeekday: false,
                    })
                  : '—'}
              </TD>
            </tr>
          ))}
        </tbody>
      </BatchTable>
    </Container>
  );
}
