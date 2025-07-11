import { expect, test } from 'vitest';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';
import { ReadinessReportHeader } from './report_header';

test('ReadinessReportHeader', () => {
  const machineType = 'VxMock';
  const generatedAtTime = new Date('2022-01-01T00:00:00');
  const machineId = 'MOCK';
  render(
    <ReadinessReportHeader
      reportType={machineType}
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );
  expect(screen.getByText('VxMock Readiness Report')).toBeInTheDocument();
  expect(
    screen.getByText(hasTextAcrossElements('Machine ID: MOCK'))
  ).toBeInTheDocument();
  expect(
    screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'))
  ).toBeInTheDocument();
});

test('no machine ID', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');

  render(
    <ReadinessReportHeader
      reportType="Ballot Style"
      generatedAtTime={generatedAtTime}
    />
  );

  screen.getByRole('heading', { name: 'Ballot Style Readiness Report' });
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));
  expect(screen.queryByText('Machine ID')).not.toBeInTheDocument();
});

test('with additional metadata', () => {
  const generatedAtTime = new Date('2022-01-01T00:00:00');

  render(
    <ReadinessReportHeader
      additionalMetadata={[
        { label: 'Election', value: 'Primary Election, a1b2c3' },
        { label: 'User', value: 'System Administrator' },
      ]}
      generatedAtTime={generatedAtTime}
      reportType="Ballot Style"
    />
  );

  screen.getByRole('heading', { name: 'Ballot Style Readiness Report' });
  screen.getByText(hasTextAcrossElements('Date: Jan 1, 2022, 12:00:00 AM'));
  screen.getByText(hasTextAcrossElements('Election: Primary Election, a1b2c3'));
  screen.getByText(hasTextAcrossElements('User: System Administrator'));
});
