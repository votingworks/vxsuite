import { expect, test, vi } from 'vitest';
import { BallotMetadata, PageInterpretation } from '@votingworks/types';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { UseQueryResult } from '@tanstack/react-query';
import { render } from '../../test/react_testing_library';
import * as api from '../api';
import { InsertedWrongTestModeBallotScreen } from './inserted_wrong_test_mode_ballot_screen';

vi.mock(import('../api.js'));

function setMockInterpretationQuery(params: {
  data?: Partial<PageInterpretation>;
  isSuccess: boolean;
}) {
  const { data, isSuccess } = params;

  vi.mocked(api.getInterpretation.useQuery).mockReturnValue({
    data: data as unknown as PageInterpretation,
    isSuccess,
  } as unknown as UseQueryResult<PageInterpretation>);
}

function setMockInterpretation(options: { isTestMode: boolean }) {
  const metadata: Partial<BallotMetadata> = { isTestMode: options.isTestMode };

  setMockInterpretationQuery({
    data: {
      metadata: metadata as unknown as BallotMetadata,
      type: 'InvalidTestModePage',
    },
    isSuccess: true,
  });
}

function setUnsupportedMockInterpretation() {
  setMockInterpretationQuery({
    data: { type: 'InvalidBallotHashPage' },
    isSuccess: true,
  });
}

test('test ballot in live mode', () => {
  setMockInterpretation({ isTestMode: true });

  const { container } = render(
    <TestErrorBoundary>
      <InsertedWrongTestModeBallotScreen />
    </TestErrorBoundary>
  );

  expect(container).toHaveTextContent(/sheet is a test ballot/i);
});

test('live ballot in test mode', () => {
  setMockInterpretation({ isTestMode: false });

  const { container } = render(
    <TestErrorBoundary>
      <InsertedWrongTestModeBallotScreen />
    </TestErrorBoundary>
  );

  expect(container).toHaveTextContent(/sheet is an official ballot/i);
});

test('no contents while query is pending', () => {
  setMockInterpretationQuery({ isSuccess: false });

  const { container } = render(
    <TestErrorBoundary>
      <InsertedWrongTestModeBallotScreen />
    </TestErrorBoundary>
  );

  expect(container).toHaveTextContent('');
});

test('throws if rendered for the wrong interpretation type', () => {
  suppressingConsoleOutput(() => {
    setUnsupportedMockInterpretation();

    const { container } = render(
      <TestErrorBoundary>
        <InsertedWrongTestModeBallotScreen />
      </TestErrorBoundary>
    );

    expect(container).toHaveTextContent('Test Error Boundary');
  });
});
