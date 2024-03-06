import { electionWithMsEitherNeither } from '@votingworks/fixtures';
import { render } from '../../test/react_testing_library';

import { TallyReportMetadata } from './tally_report_metadata';

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-11-03T22:22:00'));
});

afterEach(() => {
  jest.useRealTimers();
});

test('Renders report metadata', () => {
  const { getByText } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={new Date()}
    />
  );
  getByText(/Wednesday, August 26, 2020/);
  getByText(/Choctaw County/);
  getByText(/State of Mississippi/);
  getByText(
    /This report was created on Tuesday, November 3, 2020 at 10:22:00 PM AKST/
  );
});

test('while generating', () => {
  const { getByText } = render(
    <TallyReportMetadata election={electionWithMsEitherNeither} />
  );
  getByText(/Generating report/);
});
