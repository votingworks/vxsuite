import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen } from '../../test/react_testing_library';
import { ReadinessReportHeader } from './report_header';

test('ReadinessReportHeader', () => {
  const machineType = 'VxMock';
  const generatedAtTime = new Date('2022-01-01T00:00:00Z');
  const machineId = 'MOCK';
  render(
    <ReadinessReportHeader
      machineType={machineType}
      generatedAtTime={generatedAtTime}
      machineId={machineId}
    />
  );
  expect(
    screen.getByText('VxMock Equipment Readiness Report')
  ).toBeInTheDocument();
  expect(
    screen.getByText(hasTextAcrossElements('Machine ID: MOCK'))
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      hasTextAcrossElements(
        'Date: Saturday, January 1, 2022 at 12:00:00 AM UTC'
      )
    )
  ).toBeInTheDocument();
});
